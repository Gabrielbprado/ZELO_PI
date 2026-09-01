import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Ledger e escrow — o coração financeiro, e a razão do outbox transacional existir.
 *
 * Fluxo (dirigido por eventos de domínio, não por request):
 *  - `payment.confirmed` → ESCROW_HOLD: o valor pago entra em `pendingCents` (retido).
 *  - `booking.completed`  → liquidação: pending → balance MENOS a comissão (PLATFORM_FEE).
 *
 * A ordem dos dois eventos não importa: cada handler chama `trySettle`, que só liquida
 * quando pago E concluído. Idempotente por `payment.netAmountCents` (marca de liquidado,
 * reivindicada com um updateMany condicional) e por conferir o ESCROW_HOLD existente.
 *
 * Roda DENTRO da transação do consumidor (recebe `tx`), então "processou o evento" e
 * "moveu o dinheiro" commitam juntos — nada de meio-lançamento.
 *
 * Invariante (testada): balanceCents + pendingCents == SUM(CREDIT) − SUM(DEBIT). A
 * movimentação pending→balance NÃO é lançamento (não muda o total); só ESCROW_HOLD (+),
 * PLATFORM_FEE (−), PAYOUT (−) e REFUND (+) entram no ledger.
 */

const CENTS = 100;

async function ensureWallet(tx: Prisma.TransactionClient, userId: string): Promise<string> {
  const existing = await tx.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (existing) return existing.id;
  return (await tx.wallet.create({ data: { userId } })).id;
}

/** ESCROW_HOLD na confirmação do pagamento + tenta liquidar (caso já esteja concluído). */
export async function onPaymentConfirmed(tx: Prisma.TransactionClient, paymentId: string): Promise<void> {
  const payment = await tx.payment.findUnique({
    where: { id: paymentId },
    include: { booking: { include: { provider: { select: { userId: true } } } } },
  });
  if (!payment) return;

  const held = await tx.ledgerEntry.findFirst({ where: { paymentId, category: 'ESCROW_HOLD' }, select: { id: true } });
  if (!held) {
    const walletId = await ensureWallet(tx, payment.booking.provider.userId);
    const amountCents = payment.amount * CENTS;
    await tx.ledgerEntry.create({
      data: { walletId, type: 'CREDIT', category: 'ESCROW_HOLD', amountCents, paymentId, bookingId: payment.bookingId, description: 'Pagamento retido em garantia' },
    });
    await tx.wallet.update({ where: { id: walletId }, data: { pendingCents: { increment: amountCents } } });
  }

  await trySettle(tx, payment.bookingId);
}

/** Na conclusão do booking, tenta liquidar (caso o pagamento já esteja confirmado). */
export async function onBookingCompleted(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
  await trySettle(tx, bookingId);
}

/** Libera o escrow (pending→balance menos a comissão) quando pago E concluído. Idempotente. */
async function trySettle(tx: Prisma.TransactionClient, bookingId: string): Promise<void> {
  const booking = await tx.booking.findUnique({
    where: { id: bookingId },
    include: { payment: true, provider: { select: { userId: true } } },
  });
  const payment = booking?.payment;
  if (!booking || !payment) return;
  if (booking.status !== 'COMPLETED' || payment.status !== 'PAID' || payment.netAmountCents !== null) return;

  const held = await tx.ledgerEntry.findFirst({ where: { paymentId: payment.id, category: 'ESCROW_HOLD' }, select: { id: true } });
  if (!held) return; // ainda não retido; a liquidação virá com payment.confirmed

  const amountCents = payment.amount * CENTS;
  const feeCents = Math.round((amountCents * env.PLATFORM_FEE_PERCENT) / 100);
  const netCents = amountCents - feeCents;

  // Reivindica a liquidação atomicamente: se já foi marcada, count=0 e saímos.
  const claimed = await tx.payment.updateMany({
    where: { id: payment.id, netAmountCents: null },
    data: { platformFeeCents: feeCents, netAmountCents: netCents },
  });
  if (claimed.count === 0) return;

  const walletId = await ensureWallet(tx, booking.provider.userId);
  await tx.wallet.update({
    where: { id: walletId },
    data: { pendingCents: { decrement: amountCents }, balanceCents: { increment: netCents } },
  });
  await tx.ledgerEntry.create({
    data: { walletId, type: 'DEBIT', category: 'PLATFORM_FEE', amountCents: feeCents, paymentId: payment.id, bookingId, description: `Comissão da plataforma (${env.PLATFORM_FEE_PERCENT}%)` },
  });
  logger.info({ bookingId, feeCents, netCents }, 'escrow liquidado');
}

// ─── Wrappers que abrem a própria transação (uso direto / testes) ────────────
export function settlePaymentConfirmed(paymentId: string): Promise<void> {
  return prisma.$transaction((tx) => onPaymentConfirmed(tx, paymentId));
}
export function settleBookingCompleted(bookingId: string): Promise<void> {
  return prisma.$transaction((tx) => onBookingCompleted(tx, bookingId));
}

/** Soma assinada do ledger de uma carteira — base da invariante e dos testes. */
export async function ledgerTotalCents(walletId: string): Promise<number> {
  const [credit, debit] = await Promise.all([
    prisma.ledgerEntry.aggregate({ where: { walletId, type: 'CREDIT' }, _sum: { amountCents: true } }),
    prisma.ledgerEntry.aggregate({ where: { walletId, type: 'DEBIT' }, _sum: { amountCents: true } }),
  ]);
  return (credit._sum.amountCents ?? 0) - (debit._sum.amountCents ?? 0);
}
