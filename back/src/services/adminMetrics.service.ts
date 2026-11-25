import { prisma } from '../config/prisma';
import { invalidate, invalidatePrefix, withCache } from './cache.service';

/**
 * Métricas do painel admin. Um job recomputa e reaquece o cache a cada poucos minutos;
 * os endpoints leem pelo cache. É o consumo de agregado que justifica o cache da Onda 1 —
 * as queries de `GROUP BY`/`SUM` não dependem de quem pergunta, então cachear serve a todos.
 *
 * Tudo é calculado ao vivo sobre as tabelas atuais (snapshot). Séries temporais (novos
 * usuários por dia etc.) pedem um `DailyMetric` alimentado por job — evolução futura; para
 * a defesa, GMV/funil/comissão como snapshot já contam a história do negócio.
 */
const OVERVIEW_KEY = 'metrics:admin:overview';
const FUNNEL_KEY = 'metrics:admin:funnel';
const TTL_SEC = 300;

const ACCEPTED_OR_BEYOND = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] as const;

export interface AdminOverview {
  users: number;
  providers: number;
  verifiedProviders: number;
  bookings: { total: number; byStatus: Record<string, number> };
  gmv: number;            // GMV em reais (soma dos pagamentos PAID)
  paidCount: number;
  avgTicket: number;      // ticket médio em reais
  commissionCents: number; // comissão retida (PLATFORM_FEE no ledger)
  payoutsPaidCents: number;
  computedAt: string;
}

export interface Funnel {
  stages: { key: string; label: string; count: number }[];
  // Conversão entre etapas consecutivas (0..1).
  rates: { acceptedFromRequested: number; completedFromAccepted: number; paidFromCompleted: number };
  computedAt: string;
}

function rate(part: number, whole: number): number {
  return whole > 0 ? Number((part / whole).toFixed(4)) : 0;
}

export async function computeAdminOverview(): Promise<AdminOverview> {
  const [users, providers, verifiedProviders, byStatusRows, gmvAgg, paidCount, feeAgg, payoutAgg] = await Promise.all([
    prisma.user.count(),
    prisma.providerProfile.count(),
    prisma.providerProfile.count({ where: { kycStatus: 'VERIFIED' } }),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
    prisma.payment.count({ where: { status: 'PAID' } }),
    prisma.ledgerEntry.aggregate({ _sum: { amountCents: true }, where: { category: 'PLATFORM_FEE' } }),
    prisma.payout.aggregate({ _sum: { amountCents: true }, where: { status: 'PAID' } }),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of byStatusRows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }
  const gmv = gmvAgg._sum.amount ?? 0;

  return {
    users,
    providers,
    verifiedProviders,
    bookings: { total, byStatus },
    gmv,
    paidCount,
    avgTicket: paidCount > 0 ? Number((gmv / paidCount).toFixed(2)) : 0,
    commissionCents: feeAgg._sum.amountCents ?? 0,
    payoutsPaidCents: payoutAgg._sum.amountCents ?? 0,
    computedAt: new Date().toISOString(),
  };
}

export async function computeFunnel(): Promise<Funnel> {
  const [requested, accepted, completed, paid] = await Promise.all([
    prisma.booking.count(),
    prisma.booking.count({ where: { status: { in: [...ACCEPTED_OR_BEYOND] } } }),
    prisma.booking.count({ where: { status: 'COMPLETED' } }),
    prisma.payment.count({ where: { status: 'PAID' } }),
  ]);

  return {
    stages: [
      { key: 'requested', label: 'Solicitados', count: requested },
      { key: 'accepted', label: 'Aceitos', count: accepted },
      { key: 'completed', label: 'Concluídos', count: completed },
      { key: 'paid', label: 'Pagos', count: paid },
    ],
    rates: {
      acceptedFromRequested: rate(accepted, requested),
      completedFromAccepted: rate(completed, accepted),
      paidFromCompleted: rate(paid, completed),
    },
    computedAt: new Date().toISOString(),
  };
}

export async function getAdminOverview(): Promise<AdminOverview> {
  return (await withCache(OVERVIEW_KEY, TTL_SEC, computeAdminOverview)) as AdminOverview;
}

export async function getFunnel(): Promise<Funnel> {
  return (await withCache(FUNNEL_KEY, TTL_SEC, computeFunnel)) as Funnel;
}

/** Recomputa e reaquece o cache dos agregados. Usado pelo job repetível. */
export async function refreshAdminOverview(): Promise<void> {
  await Promise.all([invalidate(OVERVIEW_KEY), invalidate(FUNNEL_KEY)]);
  await Promise.all([getAdminOverview(), getFunnel()]);
}

/** Invalidação pontual quando algo relevante muda (pagamento, conclusão). */
export async function invalidateAdminMetrics(): Promise<void> {
  await invalidatePrefix('metrics:admin:');
}
