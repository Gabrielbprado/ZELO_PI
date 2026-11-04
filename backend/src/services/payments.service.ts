import { PaymentStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError, ConflictError } from '../errors';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';
import {
  AsaasCardHolderInfo,
  AsaasCreditCardInput,
  createCustomer as asaasCreateCustomer,
  createPixPayment as asaasCreatePixPayment,
  createCardPayment as asaasCreateCardPayment,
  getPixQrCode as asaasGetPixQrCode,
  isAsaasChargeId,
  isAsaasConfigured,
} from './asaasClient.service';

export type PaymentMethod = 'pix' | 'cash' | 'credit_card' | 'debit_card';

export interface CardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CardHolderInfoInput {
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export interface CreatePaymentInput {
  bookingId: string;
  method: PaymentMethod;
  installments?: number;
  card?: CardInput;
  cardHolderInfo?: CardHolderInfoInput;
  idempotencyKey?: string;
  remoteIp?: string;
}

// Taxas de parcelamento negociadas comercialmente com a Asaas. A API deles não devolve
// um "payer_costs" por cobrança: a comissão vem no extrato do recebível, e o parcelamento
// que mostramos ao cliente é a nossa tabela interna — então o valor cobrado no cartão
// tem que bater com o `installmentValue` que mandamos. 0% nos primeiros 3x é commercial
// decision; dali pra frente, as taxas são repasse.
const INSTALLMENT_FEE_RATES: Record<number, number> = {
  1: 0,
  2: 0.0399,
  3: 0.0799,
  4: 0.1199,
  5: 0.1599,
  6: 0.1999,
  7: 0.2399,
  8: 0.2799,
  9: 0.3199,
  10: 0.3599,
  11: 0.3999,
  12: 0.4399,
};

function calculateInstallmentFee(installments: number, amount: number): { fee: number; total: number; installmentAmount: number } {
  const rate = INSTALLMENT_FEE_RATES[installments];
  if (rate === undefined) {
    throw new BadRequestError('Parcelamento deve ser entre 1 e 12 vezes');
  }
  // Cálculo em centavos para não arrastar drift de ponto flutuante. A soma das parcelas
  // tem que bater com o total que vai pro gateway e pro UI; antes, `installmentAmount *
  // installments` divergia em alguns centavos (100 em 3x gerava parcela 36.00 somando
  // 108.00 contra total 107.99). Arredondando a parcela PRA CIMA, nunca cobramos a
  // menos; o total efetivo passa a ser `parcela × N` — a fonte da verdade.
  const amountCents = Math.round(amount * 100);
  const grossTotalCents = amountCents + Math.round(amountCents * rate);
  const installmentCents = Math.ceil(grossTotalCents / installments);
  const totalCents = installmentCents * installments;
  const feeCents = totalCents - amountCents;
  return {
    fee: feeCents / 100,
    total: totalCents / 100,
    installmentAmount: installmentCents / 100,
  };
}

export async function getInstallmentOptions(amount: number): Promise<Array<{
  installments: number;
  installmentAmount: number;
  totalAmount: number;
  interestRate: number;
  hasInterest: boolean;
}>> {
  const options = [];
  for (let i = 1; i <= 12; i++) {
    const { total, installmentAmount } = calculateInstallmentFee(i, amount);
    options.push({
      installments: i,
      installmentAmount,
      totalAmount: total,
      interestRate: INSTALLMENT_FEE_RATES[i] || 0,
      hasInterest: i > 1,
    });
  }
  return options;
}

const PAYABLE_BOOKING_STATUSES = new Set(['COMPLETED', 'IN_PROGRESS', 'ACCEPTED']);
const DEFAULT_PIX_EXPIRES_IN_SEC = 3600;
const PAYMENT_CURRENCY = 'BRL';
const PENDING_PAYMENT_STATUSES = new Set(['PENDING', 'AUTHORIZED']);
const CASH_EXTERNAL_PREFIX = 'cash_';
const PLACEHOLDER_PREFIXES = ['pending_', 'idem_'] as const;
const CARD_METHODS = new Set<PaymentMethod>(['credit_card', 'debit_card']);

function isPlaceholderExternalId(externalId: string | null | undefined): boolean {
  return typeof externalId === 'string' && PLACEHOLDER_PREFIXES.some((p) => externalId.startsWith(p));
}

async function ensureAsaasCustomer(userId: string): Promise<{ customerId: string; user: { name: string; email: string; cpf: string | null } }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, cpf: true, asaasCustomerId: true },
  });
  if (!user) throw new NotFoundError('Usuário não encontrado');

  if (user.asaasCustomerId) {
    return { customerId: user.asaasCustomerId, user };
  }

  const customerId = await asaasCreateCustomer({
    name: user.name,
    email: user.email,
    cpfCnpj: user.cpf ?? undefined,
  });
  if (!customerId) throw new BadRequestError('Não foi possível registrar o cliente no gateway. Tente novamente.');

  await prisma.user.update({ where: { id: userId }, data: { asaasCustomerId: customerId } });
  return { customerId, user };
}

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

  const amount = booking.priceFinal;
  if (!amount || amount <= 0) {
    throw new BadRequestError('O profissional ainda não definiu o valor final do serviço');
  }

  if (booking.payment?.status === 'PAID') {
    throw new BadRequestError('Pagamento já efetuado');
  }
  if (booking.payment?.status === 'REFUNDED') {
    throw new BadRequestError('Este pagamento foi estornado. Contate o suporte.');
  }

  if (CARD_METHODS.has(input.method)) {
    if (!input.installments || input.installments < 1 || input.installments > 12) {
      throw new BadRequestError('Parcelamento deve ser entre 1 e 12 vezes');
    }
    if (!input.card) {
      throw new BadRequestError('Dados do cartão são obrigatórios para pagamento com cartão');
    }
    if (!input.cardHolderInfo) {
      throw new BadRequestError('Dados do titular (CEP, número, telefone) são obrigatórios para pagamento com cartão');
    }
  }

  if (input.idempotencyKey) {
    const existingByKey = await prisma.payment.findFirst({
      where: { externalId: `idem_${input.idempotencyKey}` },
    });
    if (existingByKey) {
      if (existingByKey.bookingId !== input.bookingId) {
        throw new ConflictError('Chave de idempotência já usada para outro agendamento');
      }
      const pix = existingByKey.method === 'pix' ? await buildPixResponse(existingByKey) : undefined;
      return { payment: existingByKey, pix };
    }
  }

  let payment: Awaited<ReturnType<typeof prisma.payment.create>>;

  try {
    payment = await prisma.$transaction(async (tx) => {
      const freshBooking = await tx.booking.findUnique({
        where: { id: input.bookingId },
        include: { payment: true },
      });
      if (!freshBooking) throw new NotFoundError('Agendamento não encontrado');

      const existing = freshBooking.payment;
      if (existing && PENDING_PAYMENT_STATUSES.has(existing.status)) {
        const sameAmount = existing.amount === amount;
        const sameMethod = existing.method === input.method;
        const sameInstallments = existing.installments === input.installments;
        if (sameAmount && sameMethod && sameInstallments) {
          if (input.method === 'cash' || existing.externalId) {
            return existing;
          }
          if (!existing.externalId) {
            throw new BadRequestError('A cobrança ainda está sendo gerada. Tente novamente em instantes.');
          }
        }
        throw new BadRequestError('Já existe um pagamento pendente para este agendamento');
      }
      if (existing && existing.status === 'FAILED') {
        return tx.payment.update({
          where: { id: existing.id },
          data: { status: 'PENDING', amount, method: input.method, externalId: null, installments: input.installments },
        });
      }

      const tempExternalId = input.idempotencyKey
        ? `idem_${input.idempotencyKey}`
        : `pending_${uuidv4()}`;

      return tx.payment.create({
        data: {
          bookingId: input.bookingId,
          amount,
          currency: PAYMENT_CURRENCY,
          method: input.method,
          status: 'PENDING',
          externalId: tempExternalId,
          installments: input.installments,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      throw new ConflictError('Já existe um pagamento em processamento para este agendamento');
    }
    throw err;
  }

  if (input.method === 'cash') {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { externalId: `${CASH_EXTERNAL_PREFIX}${payment.bookingId}` },
    });
    await auditLogPayment(userId, 'CASH_PAYMENT_CREATED', { paymentId: payment.id, bookingId: payment.bookingId, amount });
    return { payment, pix: undefined };
  }

  if (!isAsaasConfigured()) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: 'FAILED', externalId: null },
    });
    throw new BadRequestError(
      'Pagamento indisponível. Escolha dinheiro ou contate o suporte.',
    );
  }

  const { customerId, user } = await ensureAsaasCustomer(userId);

  if (input.method === 'pix') {
    const charge = await asaasCreatePixPayment({
      customerId,
      value: amount,
      externalReference: payment.bookingId,
      description: `ZELO — ${booking.title}`,
    });

    if (!charge) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', externalId: null },
      });
      throw new BadRequestError('Não foi possível gerar a cobrança agora. Tente novamente em instantes.');
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { externalId: charge.id },
    });

    await auditLogPayment(userId, 'PIX_PAYMENT_CREATED', {
      paymentId: updated.id,
      bookingId: updated.bookingId,
      amount,
      asaasPaymentId: charge.id,
      asaasStatus: charge.status,
    });

    const pixPayload = await buildPixResponse(updated);
    return { payment: updated, pix: pixPayload };
  }

  if (CARD_METHODS.has(input.method)) {
    if (!user.cpf) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', externalId: null },
      });
      throw new BadRequestError('CPF obrigatório para pagamento com cartão. Atualize seu perfil.');
    }

    const { total, installmentAmount: localInstallmentAmount } = calculateInstallmentFee(input.installments!, amount);

    const holder: AsaasCardHolderInfo = {
      name: user.name,
      email: user.email,
      cpfCnpj: user.cpf.replace(/\D/g, ''),
      postalCode: input.cardHolderInfo!.postalCode.replace(/\D/g, ''),
      addressNumber: input.cardHolderInfo!.addressNumber,
      phone: input.cardHolderInfo!.phone.replace(/\D/g, ''),
    };

    const card: AsaasCreditCardInput = {
      holderName: input.card!.holderName,
      number: input.card!.number.replace(/\s+/g, ''),
      expiryMonth: input.card!.expiryMonth,
      expiryYear: input.card!.expiryYear,
      ccv: input.card!.ccv,
    };

    const charge = await asaasCreateCardPayment({
      customerId,
      value: total,
      installmentCount: input.installments!,
      installmentValue: localInstallmentAmount,
      externalReference: payment.bookingId,
      description: `ZELO — ${booking.title}`,
      card,
      holder,
      remoteIp: input.remoteIp ?? '0.0.0.0',
    });

    if (!charge) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', externalId: null },
      });
      throw new BadRequestError('Não foi possível processar o pagamento com cartão. Tente novamente.');
    }

    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        externalId: charge.id,
        installments: input.installments,
        installmentAmount: Math.round(localInstallmentAmount * 100),
        totalAmount: Math.round(total * 100),
      },
    });

    await auditLogPayment(userId, 'CARD_PAYMENT_CREATED', {
      paymentId: updated.id,
      bookingId: updated.bookingId,
      amount,
      installments: input.installments,
      fee: total - amount,
      total,
      asaasPaymentId: charge.id,
      asaasStatus: charge.status,
    });

    return {
      payment: updated,
      pix: undefined,
      installments: input.installments,
      installmentAmount: localInstallmentAmount,
      totalAmount: total,
    };
  }

  throw new BadRequestError('Método de pagamento inválido');
}

type PaymentWithBooking = Awaited<ReturnType<typeof findPaymentByBooking>>;
type GatewayStatus = 'PAID' | 'FAILED' | 'REFUNDED';

function findPaymentByBooking(bookingId: string) {
  return prisma.payment.findUnique({
    where: { bookingId },
    include: { booking: { include: { provider: { select: { userId: true } } } } },
  });
}

async function markPaidAndEmit(payment: NonNullable<PaymentWithBooking>) {
  return prisma.$transaction(async (tx) => {
    const transition = await tx.payment.updateMany({
      where: {
        id: payment.id,
        status: { notIn: ['PAID', 'REFUNDED'] },
      },
      data: { status: 'PAID' },
    });

    if (transition.count === 0) {
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      return current;
    }

    const updated = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });

    await recordEvent(tx, ROUTING_KEYS.PAYMENT_CONFIRMED, {
      paymentId: updated.id,
      bookingId: payment.bookingId,
      clientId: payment.booking.clientId,
      providerUserId: payment.booking.provider.userId,
      amount: updated.amount,
    });

    await auditLogPayment(
      payment.booking.clientId,
      'PAYMENT_CONFIRMED',
      { paymentId: updated.id, bookingId: payment.bookingId, amount: updated.amount }
    );

    return updated;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function markGatewayTerminalStatus(
  payment: NonNullable<PaymentWithBooking>,
  status: Exclude<GatewayStatus, 'PAID'>
) {
  const allowedCurrentStatuses: PaymentStatus[] = status === 'REFUNDED'
    ? [PaymentStatus.PAID]
    : [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED];
  await prisma.payment.updateMany({
    where: {
      id: payment.id,
      status: { in: allowedCurrentStatuses },
    },
    data: { status },
  });
  return prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
}

export async function confirmPayment(userId: string, role: Role, bookingId: string) {
  const payment = await findPaymentByBooking(bookingId);
  if (!payment) throw new NotFoundError('Pagamento não encontrado');

  if (payment.method !== 'cash') {
    throw new BadRequestError(
      'Este método é confirmado automaticamente pelo banco. Não há confirmação manual.',
    );
  }
  const isOwnerProvider = role === 'PROVIDER' && payment.booking.provider.userId === userId;
  if (!isOwnerProvider && role !== 'ADMIN') {
    throw new ForbiddenError('Somente o profissional confirma pagamentos em dinheiro');
  }

  const updated = await markPaidAndEmit(payment);
  await auditLogPayment(userId, 'CASH_PAYMENT_CONFIRMED', {
    paymentId: updated.id,
    bookingId: updated.bookingId,
    amount: updated.amount,
    confirmedBy: role,
  });

  return updated;
}

export async function applyGatewayPaymentStatus(input: {
  externalId: string;
  status: GatewayStatus;
  amount?: number;
  externalReference?: string;
  eventId?: string;
}): Promise<{ found: boolean; changed: boolean; reason?: string }> {
  if (!isAsaasChargeId(input.externalId)) {
    return { found: false, changed: false, reason: 'invalid_external_id' };
  }

  let payment = await prisma.payment.findFirst({
    where: { externalId: input.externalId },
    include: { booking: { include: { provider: { select: { userId: true } } } } },
  });

  if (!payment && input.externalReference) {
    const byBooking = await prisma.payment.findUnique({
      where: { bookingId: input.externalReference },
      include: { booking: { include: { provider: { select: { userId: true } } } } },
    });
    if (byBooking && byBooking.method !== 'cash' && isPlaceholderExternalId(byBooking.externalId)) {
      try {
        await prisma.payment.update({
          where: { id: byBooking.id },
          data: { externalId: input.externalId },
        });
        payment = { ...byBooking, externalId: input.externalId };
        logger.info(
          { paymentId: byBooking.id, externalId: input.externalId, eventId: input.eventId },
          'webhook: externalId amarrado retroativamente via externalReference',
        );
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          payment = await prisma.payment.findFirst({
            where: { externalId: input.externalId },
            include: { booking: { include: { provider: { select: { userId: true } } } } },
          });
        } else {
          throw err;
        }
      }
    }
  }

  if (!payment) return { found: false, changed: false };
  if (payment.method === 'cash') return { found: true, changed: false, reason: 'invalid_method' };
  if (payment.booking.status === 'CANCELLED' || payment.booking.status === 'DISPUTED') {
    return { found: true, changed: false, reason: 'invalid_booking_status' };
  }

  // Para PIX comparamos com o `amount` cru do booking (reais inteiros). Para cartão,
  // o valor cobrado no gateway é `totalAmount` (centavos) com as taxas de parcelamento.
  if (typeof input.amount === 'number') {
    const expected = payment.totalAmount != null
      ? payment.totalAmount / 100
      : payment.amount;
    if (Math.abs(input.amount - expected) > 0.01) {
      return { found: true, changed: false, reason: 'amount_mismatch' };
    }
  }

  if (input.externalReference && input.externalReference !== payment.bookingId) {
    return { found: true, changed: false, reason: 'external_reference_mismatch' };
  }

  const before = payment.status;
  let updated;

  if (input.status === 'PAID') {
    updated = await markPaidAndEmit(payment);
  } else {
    updated = await markGatewayTerminalStatus(payment, input.status);
  }

  await auditLogPayment('system:webhook', `PAYMENT_${input.status}`, {
    paymentId: payment.id,
    bookingId: payment.bookingId,
    amount: payment.amount,
    previousStatus: before,
    newStatus: updated.status,
    asaasEventId: input.eventId,
  });

  return { found: true, changed: before !== updated.status };
}

export async function confirmPaymentByExternalId(externalId: string): Promise<boolean> {
  const result = await applyGatewayPaymentStatus({ externalId, status: 'PAID' });
  return result.found;
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

export interface PixPayload {
  qrCode: string;
  qrCopyPaste: string;
  expiresInSec: number;
  amount: number;
  currency: string;
}

export async function getPixForBooking(userId: string, bookingId: string): Promise<PixPayload | null> {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: { booking: { select: { clientId: true } } },
  });
  if (!payment) return null;
  if (payment.booking.clientId !== userId) {
    throw new ForbiddenError('Somente o contratante acessa o PIX deste pagamento');
  }
  if (payment.method !== 'pix') return null;
  if (payment.status !== 'PENDING' && payment.status !== 'AUTHORIZED') return null;
  if (!isAsaasChargeId(payment.externalId)) return null;

  return buildPixResponse(payment);
}

export async function buildPixResponse(payment: {
  amount: number;
  currency: string;
  externalId: string | null;
  id: string;
  status: string;
}): Promise<PixPayload> {
  if (payment.status !== 'PENDING' && payment.status !== 'AUTHORIZED') {
    throw new BadRequestError('Cobrança não está mais disponível para pagamento');
  }
  if (!isAsaasConfigured() || !isAsaasChargeId(payment.externalId)) {
    throw new BadRequestError('Cobrança PIX indisponível');
  }

  const qr = await asaasGetPixQrCode(payment.externalId as string);
  if (!qr) throw new BadRequestError('QR do PIX indisponível no momento — tente daqui a pouco');

  return {
    qrCode: qr.encodedImage ? `data:image/png;base64,${qr.encodedImage}` : '',
    qrCopyPaste: qr.payload,
    expiresInSec: DEFAULT_PIX_EXPIRES_IN_SEC,
    amount: payment.amount,
    currency: payment.currency,
  };
}

async function auditLogPayment(
  userId: string,
  action: string,
  metadata: Record<string, unknown>
) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: userId === 'system:webhook' ? null : userId,
        action,
        entity: 'Payment',
        entityId: String(metadata.paymentId),
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.warn({ err, action }, 'falha ao gravar audit log de pagamento');
  }
}
