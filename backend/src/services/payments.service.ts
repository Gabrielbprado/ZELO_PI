import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';
import { logger } from '../utils/logger';
import {
  createCustomer,
  createPixPayment,
  getPixQrCode,
  isAsaasChargeId,
  isAsaasConfigured,
} from './asaasClient.service';

export type PaymentMethod = 'pix' | 'card';

export interface CreatePaymentInput {
  bookingId: string;
  method: PaymentMethod;
}

const PAYABLE_BOOKING_STATUSES = new Set(['COMPLETED', 'IN_PROGRESS', 'ACCEPTED']);
const EXTERNAL_ID_BYTES = 8;
const PIX_EXPIRES_IN_SEC = 600;
const PAYMENT_CURRENCY = 'BRL';

export async function createPaymentForBooking(userId: string, input: CreatePaymentInput) {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { payment: true, provider: true },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');
  if (booking.clientId !== userId) throw new ForbiddenError('Apenas o contratante pode pagar');
  if (!PAYABLE_BOOKING_STATUSES.has(booking.status)) {
    throw new BadRequestError('Este agendamento ainda não está pronto para pagamento');
  }

  const amount = booking.priceFinal ?? booking.priceEstimate;
  if (!amount || amount <= 0) {
    throw new BadRequestError('Valor do agendamento ainda não definido');
  }

  if (booking.payment?.status === 'PAID') {
    throw new BadRequestError('Pagamento já efetuado');
  }

  // Com o Asaas ligado e método PIX, cria a cobrança REAL e guarda o id dela (`pay_…`) em
  // externalId. Se o gateway falhar, degrada para um id mock — o fluxo não quebra.
  const externalId = await resolveExternalId(userId, booking.id, booking.title, amount, input.method);

  if (booking.payment) {
    return prisma.payment.update({
      where: { id: booking.payment.id },
      data: { amount, method: input.method, status: 'PENDING', externalId },
    });
  }

  return prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount,
      currency: PAYMENT_CURRENCY,
      method: input.method,
      status: 'PENDING',
      externalId,
    },
  });
}

/** Decide o externalId: cobrança real do Asaas (PIX) quando configurado, senão mock. */
async function resolveExternalId(
  userId: string,
  bookingId: string,
  title: string,
  amount: number,
  method: PaymentMethod,
): Promise<string> {
  if (method === 'pix' && isAsaasConfigured()) {
    const charge = await createAsaasCharge(userId, bookingId, title, amount);
    if (charge) return charge;
    logger.warn({ bookingId }, 'asaas indisponível na criação da cobrança; usando PIX mock');
  }
  return pseudoExternalId(method);
}

/** Garante o cliente no Asaas (reusa o id salvo) e cria a cobrança PIX. Devolve o id ou null. */
async function createAsaasCharge(
  userId: string,
  bookingId: string,
  title: string,
  amount: number,
): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, asaasCustomerId: true },
  });
  if (!user) return null;

  let customerId = user.asaasCustomerId;
  if (!customerId) {
    customerId = await createCustomer({ name: user.name, email: user.email });
    if (!customerId) return null;
    await prisma.user.update({ where: { id: userId }, data: { asaasCustomerId: customerId } });
  }

  const charge = await createPixPayment({
    customerId,
    value: amount,
    externalReference: bookingId,
    description: `ZELO — ${title}`,
  });
  return charge?.id ?? null;
}

type PaymentWithBooking = Awaited<ReturnType<typeof findPaymentByBooking>>;

function findPaymentByBooking(bookingId: string) {
  return prisma.payment.findUnique({
    where: { bookingId },
    include: { booking: { include: { provider: { select: { userId: true } } } } },
  });
}

/**
 * Marca o pagamento como PAID e emite `payment.confirmed` na MESMA transação.
 *
 * É o evento de maior risco do sistema: na Onda 7 ele vira lançamento no ledger. O outbox
 * garante que confirmar e emitir são atômicos — dinheiro nunca "some" entre um commit no
 * Postgres e uma falha ao publicar no broker. Idempotente: se já está PAID, não reemite.
 */
async function markPaidAndEmit(payment: NonNullable<PaymentWithBooking>) {
  if (payment.status === 'PAID') return payment;
  return prisma.$transaction(async (tx) => {
    const u = await tx.payment.update({ where: { id: payment.id }, data: { status: 'PAID' } });
    await recordEvent(tx, ROUTING_KEYS.PAYMENT_CONFIRMED, {
      paymentId: u.id,
      bookingId: payment.bookingId,
      clientId: payment.booking.clientId,
      providerUserId: payment.booking.provider.userId,
      amount: u.amount,
    });
    return u;
  });
}

/**
 * Confirmação manual (usada no fluxo mock/dev). Com o Asaas ligado, a confirmação de
 * verdade chega pelo WEBHOOK (`confirmPaymentByExternalId`), não por aqui.
 */
export async function confirmPayment(userId: string, bookingId: string) {
  const payment = await findPaymentByBooking(bookingId);
  if (!payment) throw new NotFoundError('Pagamento não encontrado');
  if (payment.booking.clientId !== userId) throw new ForbiddenError('Acesso negado');
  return markPaidAndEmit(payment);
}

/**
 * Confirmação vinda do webhook do Asaas: acha o Payment pela cobrança (`externalId`) e o
 * marca como pago. Idempotente e sem dono — o Asaas é a autoridade. Devolve se encontrou.
 */
export async function confirmPaymentByExternalId(externalId: string): Promise<boolean> {
  const payment = await prisma.payment.findFirst({
    where: { externalId },
    include: { booking: { include: { provider: { select: { userId: true } } } } },
  });
  if (!payment) return false;
  await markPaidAndEmit(payment);
  return true;
}

export async function getPaymentByBooking(userId: string, bookingId: string) {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: { booking: true },
  });
  if (!payment) return null;

  if (payment.booking.clientId !== userId) {
    const isProvider = await prisma.providerProfile.findFirst({
      where: { id: payment.booking.providerId, userId },
    });
    if (!isProvider) throw new ForbiddenError('Acesso negado');
  }
  return payment;
}

function pseudoExternalId(method: PaymentMethod): string {
  return `${method}_${crypto.randomBytes(EXTERNAL_ID_BYTES).toString('hex')}`;
}

export interface PixPayload {
  qrCode: string;
  qrCopyPaste: string;
  expiresInSec: number;
  amount: number;
  currency: string;
}

/** Mock PIX copy-and-paste payload. Usado quando o Asaas está desligado. */
export function buildPixPayload(amount: number, externalId: string): PixPayload {
  const payload = `00020126${externalId}5204000053039865802BR5910ZERO LTDA6009Sao Paulo62070503${externalId}6304`;
  return {
    qrCode: payload,
    qrCopyPaste: payload,
    expiresInSec: PIX_EXPIRES_IN_SEC,
    amount,
    currency: PAYMENT_CURRENCY,
  };
}

/**
 * Monta a resposta PIX para a tela de checkout. Com o Asaas ligado e a cobrança sendo
 * real (`pay_…`), busca o QR Code de verdade (imagem base64 + copia-e-cola). Se o gateway
 * falhar na hora de buscar, cai no mock — a tela nunca fica sem nada.
 */
export async function buildPixResponse(payment: {
  amount: number;
  currency: string;
  externalId: string | null;
  id: string;
}): Promise<PixPayload> {
  if (isAsaasConfigured() && isAsaasChargeId(payment.externalId)) {
    const qr = await getPixQrCode(payment.externalId as string);
    if (qr) {
      return {
        qrCode: `data:image/png;base64,${qr.encodedImage}`,
        qrCopyPaste: qr.payload,
        expiresInSec: PIX_EXPIRES_IN_SEC,
        amount: payment.amount,
        currency: payment.currency,
      };
    }
    logger.warn({ paymentId: payment.id }, 'asaas: QR indisponível; usando PIX mock');
  }
  return buildPixPayload(payment.amount, payment.externalId ?? payment.id);
}
