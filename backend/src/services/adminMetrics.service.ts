import { prisma } from '../config/prisma';
import { invalidate, withCache } from './cache.service';

/**
 * Visão geral para o painel admin. Um job recomputa e reaquece o cache a cada poucos
 * minutos (`refreshAdminOverview`); o endpoint lê pelo cache (`getAdminOverview`). É o
 * consumo de agregado que justifica o cache da Onda 1 — as queries de `GROUP BY`/`SUM`
 * não dependem de quem pergunta, então cachear por instância todas serve.
 */
const OVERVIEW_KEY = 'metrics:admin:overview';
const OVERVIEW_TTL_SEC = 600;

export interface AdminOverview {
  users: number;
  providers: number;
  bookings: { total: number; byStatus: Record<string, number> };
  gmv: number;
  computedAt: string;
}

export async function computeAdminOverview(): Promise<AdminOverview> {
  const [users, providers, byStatusRows, gmvAgg] = await Promise.all([
    prisma.user.count(),
    prisma.providerProfile.count(),
    prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { status: 'PAID' } }),
  ]);

  const byStatus: Record<string, number> = {};
  let total = 0;
  for (const row of byStatusRows) {
    byStatus[row.status] = row._count._all;
    total += row._count._all;
  }

  return {
    users,
    providers,
    bookings: { total, byStatus },
    gmv: gmvAgg._sum.amount ?? 0,
    computedAt: new Date().toISOString(),
  };
}

/** Lê pelo cache; calcula no miss e grava. Usado pelo endpoint do admin. */
export async function getAdminOverview(): Promise<AdminOverview> {
  const cached = await withCache(OVERVIEW_KEY, OVERVIEW_TTL_SEC, computeAdminOverview);
  // withCache só devolve undefined se o loader devolver undefined — o que não acontece aqui.
  return cached as AdminOverview;
}

/** Recomputa e reaquece o cache. Usado pelo job repetível. */
export async function refreshAdminOverview(): Promise<AdminOverview> {
  await invalidate(OVERVIEW_KEY);
  return getAdminOverview();
}
