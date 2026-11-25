import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';
import { refreshAdminOverview } from '../services/adminMetrics.service';

const HOUR_MS = 60 * 60 * 1000;

/**
 * Lógica dos jobs, em funções PURAS e testáveis — desacopladas do BullMQ. O worker só
 * chama estas; os testes unitários também, sem subir Redis nenhum.
 */

/** Housekeeping: apaga RefreshTokens expirados. A tabela crescia para sempre. */
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const res = await prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  if (res.count > 0) logger.info({ count: res.count }, 'housekeeping: refresh tokens expirados removidos');
  return res.count;
}

/** Expira bookings REQUESTED sem resposta há mais de BOOKING_EXPIRY_HOURS. */
export async function expireStaleBookings(): Promise<number> {
  const cutoff = new Date(Date.now() - env.BOOKING_EXPIRY_HOURS * HOUR_MS);
  const stale = await prisma.booking.findMany({
    where: { status: 'REQUESTED', createdAt: { lt: cutoff } },
    include: { provider: { select: { userId: true } } },
  });

  let count = 0;
  for (const b of stale) {
    await prisma.$transaction(async (tx) => {
      // Recheca dentro da transação: um aceite pode ter ocorrido entre a busca e aqui.
      const updated = await tx.booking.updateMany({
        where: { id: b.id, status: 'REQUESTED' },
        data: { status: 'CANCELLED' },
      });
      if (updated.count === 0) return;
      await recordEvent(tx, ROUTING_KEYS.BOOKING_CANCELLED, {
        bookingId: b.id,
        clientId: b.clientId,
        providerUserId: b.provider.userId,
        title: b.title,
      });
      count += 1;
    });
  }
  if (count > 0) logger.info({ count }, 'jobs: bookings REQUESTED expirados');
  return count;
}

/** Recomputa e reaquece o cache do painel admin. */
export async function recomputeAdminOverview(): Promise<void> {
  await refreshAdminOverview();
}

/**
 * Dispara o lembrete de um agendamento, SE ele ainda estiver ACCEPTED. Se foi cancelado
 * ou concluído nesse meio-tempo, não lembra — e o job delayed pode até já ter sido
 * removido pelo consumidor de booking.cancelled, mas esta guarda fecha a corrida.
 */
export async function sendBookingReminder(bookingId: string, when: '24h' | '1h'): Promise<boolean> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { provider: { select: { userId: true } } },
  });
  if (!booking || booking.status !== 'ACCEPTED') return false;

  await prisma.$transaction(async (tx) => {
    await recordEvent(tx, ROUTING_KEYS.BOOKING_REMINDER, {
      bookingId: booking.id,
      clientId: booking.clientId,
      providerUserId: booking.provider.userId,
      title: booking.title,
      when,
    });
  });
  return true;
}
