import { Prisma } from '@prisma/client';
import { timingSafeEqual } from 'crypto';
import { z } from 'zod';
import {
  applyGatewayPaymentStatus,
  confirmPayment,
  createPaymentForBooking,
  getPaymentByBooking,
  getPixForBooking,
  getInstallmentOptions,
} from '../services/payments.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getRequestId } from '../utils/requestContext';
import { prisma } from '../config/prisma';
import { getPayment as asaasGetPayment, mapAsaasStatusToInternal } from '../services/asaasClient.service';

const WEBHOOK_CONSUMER = 'asaas-webhook';

function clientIp(req: { ip?: string | null; headers: Record<string, unknown> }): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip ?? '0.0.0.0';
}

export const create = asyncHandler(async (req, res) => {
  const idempotencyKey = req.header('Idempotency-Key') ?? undefined;
  const result = await createPaymentForBooking(req.user!.sub, {
    ...req.body,
    idempotencyKey,
    remoteIp: clientIp(req as unknown as { ip?: string; headers: Record<string, unknown> }),
  });
  res.status(HttpStatus.CREATED).json(result);
});

export const confirm = asyncHandler(async (req, res) => {
  const payment = await confirmPayment(req.user!.sub, req.user!.role, req.params.bookingId);
  res.json({ payment });
});

export const getByBooking = asyncHandler(async (req, res) => {
  const payment = await getPaymentByBooking(req.user!.sub, req.params.bookingId);
  res.json({ payment });
});

export const getPix = asyncHandler(async (req, res) => {
  const pix = await getPixForBooking(req.user!.sub, req.params.bookingId);
  if (!pix) {
    res.status(HttpStatus.NOT_FOUND).json({ error: { code: 'PIX_UNAVAILABLE', message: 'PIX indisponível para este pagamento' } });
    return;
  }
  res.json({ pix });
});

export const getInstallments = asyncHandler(async (req, res) => {
  const amount = Number(req.query.amount);
  if (!amount || amount <= 0) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: 'INVALID_AMOUNT', message: 'Valor inválido' } });
    return;
  }
  const options = await getInstallmentOptions(amount);
  res.json({ options });
});

// Confirmação administrativa de PIX: executa o mesmo caminho que o webhook (PAID
// via applyGatewayPaymentStatus → emite payment.confirmed no outbox). Serve pros
// casos operacionais em que o webhook do Asaas não chegou (indisponibilidade do
// túnel, sandbox que não permite simular PIX, suporte reconciliando manualmente).
// Bloqueado em produção por segurança: a fonte da verdade continua sendo o webhook.
export const adminForceConfirm = asyncHandler(async (req, res) => {
  if (!env.ALLOW_ADMIN_FORCE_CONFIRM) {
    res.status(HttpStatus.FORBIDDEN).json({ error: { code: 'FORBIDDEN', message: 'Confirmação administrativa não habilitada (ALLOW_ADMIN_FORCE_CONFIRM=false)' } });
    return;
  }
  const payment = await prisma.payment.findUnique({ where: { bookingId: req.params.bookingId } });
  if (!payment) {
    res.status(HttpStatus.NOT_FOUND).json({ error: { code: 'PAYMENT_NOT_FOUND', message: 'Pagamento não encontrado' } });
    return;
  }
  if (payment.status === 'PAID') {
    res.json({ payment, alreadyPaid: true });
    return;
  }
  if (!payment.externalId) {
    res.status(HttpStatus.BAD_REQUEST).json({ error: { code: 'NO_EXTERNAL_ID', message: 'Pagamento ainda sem externalId do gateway' } });
    return;
  }

  const result = await applyGatewayPaymentStatus({
    externalId: payment.externalId,
    status: 'PAID',
    amount: payment.amount,
    externalReference: payment.bookingId,
    eventId: `admin-force-${Date.now()}`,
  });
  logger.info({ adminUser: req.user!.sub, bookingId: req.params.bookingId, result }, 'admin: force-confirm executado');
  const fresh = await prisma.payment.findUniqueOrThrow({ where: { bookingId: req.params.bookingId } });
  res.json({ payment: fresh, result });
});

// Shape padrão do webhook da Asaas:
//   { id, event: "PAYMENT_RECEIVED"|..., dateCreated, payment: { id, status, value, externalReference, ... } }
// Doc: https://docs.asaas.com/docs/overview-sobre-os-webhooks
const asaasWebhookSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  event: z.string().min(1),
  dateCreated: z.string().optional(),
  payment: z.object({
    id: z.string(),
    status: z.string(),
    value: z.number().optional(),
    externalReference: z.string().optional().nullable(),
  }).optional(),
});

function hasValidAsaasWebhookToken(received: string | undefined): boolean {
  const expected = env.ASAAS_WEBHOOK_TOKEN;
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function claimWebhookEvent(eventId: string): Promise<boolean> {
  try {
    await prisma.processedEvent.create({
      data: { consumer: WEBHOOK_CONSUMER, eventId },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
}

async function auditWebhookMismatch(logBase: Record<string, unknown>, reason: string, extra: Record<string, unknown>): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'PAYMENT_WEBHOOK_MISMATCH',
        entity: 'Payment',
        entityId: (extra.paymentId as string) ?? null,
        metadata: { reason, ...logBase, ...extra } as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn({ err, reason }, 'audit: falha ao gravar mismatch do webhook');
  }
}

export const webhook = asyncHandler(async (req, res) => {
  const requestId = getRequestId() ?? req.header('x-request-id') ?? `webhook-${Date.now()}`;
  const eventId = String(req.body?.id ?? req.header('asaas-event-id') ?? `asaas-${Date.now()}`);
  const logBase = { requestId, eventId, path: req.path };

  const received = req.header('asaas-access-token');
  if (!hasValidAsaasWebhookToken(received)) {
    // Diagnóstico sem vazar valor: só tamanho recebido vs esperado. Ajuda o operador
    // a diferenciar "esqueceram o header" de "token com tamanho diferente" (comumente
    // causado por copy-paste com espaço/aspas) sem expor o segredo no log.
    logger.warn(
      {
        ...logBase,
        tokenHeaderPresent: typeof received === 'string' && received.length > 0,
        receivedLength: typeof received === 'string' ? received.length : 0,
        expectedLength: env.ASAAS_WEBHOOK_TOKEN?.length ?? 0,
      },
      'asaas webhook: token inválido',
    );
    // Body JSON padronizado com o resto da API, SEM revelar nada do token. 401 continua.
    res.status(HttpStatus.UNAUTHORIZED).json({
      error: { code: 'INVALID_WEBHOOK_TOKEN', message: 'Webhook token mismatch' },
    });
    return;
  }

  const parsed = asaasWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ ...logBase, issues: parsed.error.issues }, 'asaas webhook: payload inválido');
    res.status(HttpStatus.OK).json({ received: true, ignored: 'invalid_payload' });
    return;
  }

  const { event, payment } = parsed.data;

  if (!payment?.id) {
    logger.debug({ ...logBase, event }, 'asaas webhook ignorado (sem payment.id)');
    res.status(HttpStatus.OK).json({ received: true });
    return;
  }

  // Buscar o estado real do pagamento na Asaas em vez de confiar só no payload
  // do webhook. Protege contra replay/payloads adulterados: a palavra final é da API.
  const fresh = await asaasGetPayment(payment.id);
  if (!fresh) {
    logger.warn({ ...logBase, asaasPaymentId: payment.id }, 'asaas webhook: falha ao buscar detalhes do pagamento');
    // NÃO reserva o eventId: o próximo retry do Asaas tem que conseguir refazer o fetch.
    res.status(HttpStatus.OK).json({ received: true, ignored: 'fetch_failed' });
    return;
  }

  const gatewayStatus = mapAsaasStatusToInternal(fresh.status);
  if (!gatewayStatus) {
    logger.debug({ ...logBase, asaasPaymentId: fresh.id, status: fresh.status, event }, 'asaas webhook: status não terminal');
    // NÃO reserva o eventId: se o status virar terminal depois, queremos processar.
    res.status(HttpStatus.OK).json({ received: true });
    return;
  }

  // Deduplicação só agora, quando sabemos que há trabalho terminal a fazer. Antes o
  // claim era feito no topo e, se o fetch do Asaas falhasse, o retry do webhook batia
  // em P2002 e o pagamento ficava órfão. `applyGatewayPaymentStatus` já é idempotente
  // (updateMany com guarda de status), mas manter o claim ajuda na observabilidade.
  const first = await claimWebhookEvent(eventId);
  if (!first) {
    logger.info({ ...logBase, asaasPaymentId: fresh.id }, 'asaas webhook: evento duplicado, ignorado');
    res.status(HttpStatus.OK).json({ received: true, duplicate: true });
    return;
  }

  const result = await applyGatewayPaymentStatus({
    externalId: fresh.id,
    status: gatewayStatus,
    amount: fresh.value ?? undefined,
    externalReference: fresh.externalReference ?? undefined,
    eventId,
  });

  if (result.reason) {
    await auditWebhookMismatch(logBase, result.reason, {
      asaasPaymentId: fresh.id,
      asaasStatus: fresh.status,
      event,
      amount: fresh.value,
      externalReference: fresh.externalReference,
    });
  }

  logger.info({ ...logBase, asaasPaymentId: fresh.id, asaasStatus: fresh.status, event, result }, 'asaas webhook processado');
  res.status(HttpStatus.OK).json({ received: true });
});
