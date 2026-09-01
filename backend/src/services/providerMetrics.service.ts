import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors';
import { withCache } from './cache.service';

/**
 * Métricas do próprio profissional (dashboard): desempenho e ganhos. Cacheado 60s por
 * profissional — o cálculo não muda a cada request.
 */
const TTL_SEC = 60;
const ACCEPTED_OR_BEYOND = ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED'] as const;

export interface ProviderMetrics {
  jobsDone: number;
  ratingAvg: number;
  ratingCount: number;
  bookings: { total: number; accepted: number; completed: number };
  acceptRate: number;      // 0..1
  completionRate: number;  // 0..1
  balanceCents: number;
  pendingCents: number;
  totalEarnedCents: number; // líquido recebido (bruto − comissão)
}

export async function getMyMetrics(userId: string): Promise<ProviderMetrics> {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    select: { id: true, jobsDone: true, ratingAvg: true, ratingCount: true },
  });
  if (!profile) throw new NotFoundError('Perfil de profissional não encontrado');

  return withCache(`metrics:provider:${profile.id}`, TTL_SEC, async () => {
    const [total, accepted, completed, wallet] = await Promise.all([
      prisma.booking.count({ where: { providerId: profile.id } }),
      prisma.booking.count({ where: { providerId: profile.id, status: { in: [...ACCEPTED_OR_BEYOND] } } }),
      prisma.booking.count({ where: { providerId: profile.id, status: 'COMPLETED' } }),
      prisma.wallet.findUnique({ where: { userId }, select: { id: true, balanceCents: true, pendingCents: true } }),
    ]);

    let totalEarnedCents = 0;
    if (wallet) {
      const [gross, fee] = await Promise.all([
        prisma.ledgerEntry.aggregate({ _sum: { amountCents: true }, where: { walletId: wallet.id, category: 'ESCROW_HOLD' } }),
        prisma.ledgerEntry.aggregate({ _sum: { amountCents: true }, where: { walletId: wallet.id, category: 'PLATFORM_FEE' } }),
      ]);
      totalEarnedCents = (gross._sum.amountCents ?? 0) - (fee._sum.amountCents ?? 0);
    }

    return {
      jobsDone: profile.jobsDone,
      ratingAvg: profile.ratingAvg,
      ratingCount: profile.ratingCount,
      bookings: { total, accepted, completed },
      acceptRate: total > 0 ? Number((accepted / total).toFixed(4)) : 0,
      completionRate: accepted > 0 ? Number((completed / accepted).toFixed(4)) : 0,
      balanceCents: wallet?.balanceCents ?? 0,
      pendingCents: wallet?.pendingCents ?? 0,
      totalEarnedCents,
    };
  }) as Promise<ProviderMetrics>;
}
