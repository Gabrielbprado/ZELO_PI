import { prisma } from '../config/prisma';
import { BadRequestError } from '../errors';
import { createTransfer, isAsaasConfigured } from './asaasClient.service';
import { logger } from '../utils/logger';

/**
 * Carteira do profissional: saldo/pendente, extrato (ledger) e saque via PIX.
 * A liquidação do escrow (o que enche a carteira) vive em `ledger.service.ts`.
 */

const STATEMENT_LIMIT = 30;

export interface WalletView {
  balanceCents: number;
  pendingCents: number;
}

export async function getWallet(userId: string): Promise<WalletView> {
  const w = await prisma.wallet.findUnique({ where: { userId }, select: { balanceCents: true, pendingCents: true } });
  return w ?? { balanceCents: 0, pendingCents: 0 };
}

export async function getStatement(userId: string, cursor?: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (!wallet) return { items: [], nextCursor: null };

  const rows = await prisma.ledgerEntry.findMany({
    where: { walletId: wallet.id },
    orderBy: { createdAt: 'desc' },
    take: STATEMENT_LIMIT + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });
  const items = rows.slice(0, STATEMENT_LIMIT);
  const nextCursor = rows.length > STATEMENT_LIMIT ? items[items.length - 1].id : null;
  return { items, nextCursor };
}

export async function listPayouts(userId: string) {
  const wallet = await prisma.wallet.findUnique({ where: { userId }, select: { id: true } });
  if (!wallet) return [];
  return prisma.payout.findMany({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' }, take: 50 });
}

/**
 * Solicita um saque. RESERVA os fundos na hora (debita + PAYOUT no ledger, atômico), então
 * processa via Asaas (Transfer) ou marca como pago no mock. Se falhar, ESTORNA — o ledger
 * é append-only, então o estorno é um lançamento REFUND, não uma exclusão.
 */
export async function requestPayout(userId: string, input: { amountCents: number; pixKey: string }) {
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new BadRequestError('Carteira sem saldo');
  if (input.amountCents <= 0) throw new BadRequestError('Valor inválido');

  // Reserva atômica: debita e cria o saque numa transação, com re-checagem do saldo dentro
  // dela (via updateMany condicional) para não permitir saque além do saldo em concorrência.
  const payout = await prisma.$transaction(async (tx) => {
    const debited = await tx.wallet.updateMany({
      where: { id: wallet.id, balanceCents: { gte: input.amountCents } },
      data: { balanceCents: { decrement: input.amountCents } },
    });
    if (debited.count === 0) throw new BadRequestError('Saldo insuficiente');

    await tx.ledgerEntry.create({
      data: { walletId: wallet.id, type: 'DEBIT', category: 'PAYOUT', amountCents: input.amountCents, description: 'Saque solicitado' },
    });
    return tx.payout.create({
      data: { walletId: wallet.id, amountCents: input.amountCents, pixKey: input.pixKey, status: 'PROCESSING' },
    });
  });

  // Processa fora da transação (I/O externo).
  let externalId: string | null = null;
  let ok = true;
  if (isAsaasConfigured()) {
    const transfer = await createTransfer({ value: input.amountCents / 100, pixKey: input.pixKey, description: 'ZELO saque' });
    ok = transfer !== null;
    externalId = transfer?.id ?? null;
  }

  if (ok) {
    return prisma.payout.update({ where: { id: payout.id }, data: { status: 'PAID', externalId, processedAt: new Date() } });
  }

  // Falha: estorna o saldo (lançamento REFUND) e marca FAILED.
  logger.warn({ payoutId: payout.id }, 'saque falhou no gateway; estornando');
  return prisma.$transaction(async (tx) => {
    await tx.wallet.update({ where: { id: wallet.id }, data: { balanceCents: { increment: input.amountCents } } });
    await tx.ledgerEntry.create({
      data: { walletId: wallet.id, type: 'CREDIT', category: 'REFUND', amountCents: input.amountCents, description: 'Estorno de saque não concluído' },
    });
    return tx.payout.update({ where: { id: payout.id }, data: { status: 'FAILED', failureReason: 'Transferência recusada pelo gateway' } });
  });
}
