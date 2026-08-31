import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';
import { pushToUser } from './notifications.service';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';

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

  if (booking.payment) {
    if (booking.payment.status === 'PAID') {
      throw new BadRequestError('Pagamento já efetuado');
    }
    return prisma.payment.update({
      where: { id: booking.payment.id },
      data: {
        amount,
        method: input.method,
        status: 'PENDING',
        externalId: pseudoExternalId(input.method),
      },
    });
  }

  return prisma.payment.create({
    data: {
      bookingId: booking.id,
      amount,
      currency: PAYMENT_CURRENCY,
      method: input.method,
      status: 'PENDING',
      externalId: pseudoExternalId(input.method),
    },
  });
}

export async function confirmPayment(userId: string, bookingId: string) {
  const payment = await prisma.payment.findUnique({
    where: { bookingId },
    include: { booking: { include: { provider: { select: { userId: true } } } } },
  });
  if (!payment) throw new NotFoundError('Pagamento não encontrado');
  if (payment.booking.clientId !== userId) throw new ForbiddenError('Acesso negado');
  if (payment.status === 'PAID') return payment;

  // `payment.confirmed` é o evento de maior risco do sistema: na Onda 7 ele vira
  // lançamento no ledger. Por isso ele nasce DENTRO da transação que confirma o
  // pagamento — o outbox garante que confirmar e emitir são atômicos, e que dinheiro
  // nunca "some" entre um commit no Postgres e uma falha ao publicar no broker.
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.payment.update({
      where: { id: payment.id },
      data: { status: 'PAID' },
    });
    await recordEvent(tx, ROUTING_KEYS.PAYMENT_CONFIRMED, {
      paymentId: u.id,
      bookingId,
      clientId: payment.booking.clientId,
      providerUserId: payment.booking.provider.userId,
      amount: u.amount,
    });
    return u;
  });

  // Notify the provider that they got paid.
  await pushToUser(payment.booking.provider.userId, {
    title: 'Pagamento confirmado 💰',
    body: `Você recebeu o pagamento de ${formatBRL(updated.amount)}.`,
    data: { type: 'PAYMENT', bookingId, paymentId: updated.id },
  });

  return updated;
}

function formatBRL(amount: number): string {
  return `R$ ${amount.toLocaleString('pt-BR')}`;
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

/** Mock PIX copy-and-paste payload. A real gateway would return this. */
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
