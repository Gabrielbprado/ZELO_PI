/**
 * Jobs — a lógica (processors) é testada com banco real, sem BullMQ; o agendamento
 * delayed (BullMQ) é testado à parte, gated por Redis.
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor } from './helpers';
import {
  cleanupExpiredRefreshTokens,
  expireStaleBookings,
  sendBookingReminder,
} from '../../src/jobs/processors';
import { getAdminOverview } from '../../src/services/adminMetrics.service';
import { ROUTING_KEYS } from '../../src/events/types';

const HOUR = 60 * 60 * 1000;

async function makeBooking(opts: {
  status?: 'REQUESTED' | 'ACCEPTED' | 'CANCELLED' | 'COMPLETED';
  createdAt?: Date;
  scheduledAt?: Date;
}) {
  const { provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@job.test` });
  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Serviço',
      address: 'Rua 1, 100',
      status: opts.status ?? 'REQUESTED',
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
      ...(opts.scheduledAt ? { scheduledAt: opts.scheduledAt } : {}),
    },
  });
  return { booking, provider, client };
}

describe('cleanupExpiredRefreshTokens', () => {
  it('apaga só os tokens expirados', async () => {
    const user = await createUser();
    await prisma.refreshToken.createMany({
      data: [
        { userId: user.id, tokenHash: `exp-${Date.now()}`, expiresAt: new Date(Date.now() - HOUR) },
        { userId: user.id, tokenHash: `ok-${Date.now()}`, expiresAt: new Date(Date.now() + HOUR) },
      ],
    });

    const removed = await cleanupExpiredRefreshTokens();

    expect(removed).toBe(1);
    expect(await prisma.refreshToken.count()).toBe(1);
  });
});

describe('expireStaleBookings', () => {
  it('expira REQUESTED antigos e emite booking.cancelled; poupa os recentes e os aceitos', async () => {
    const old = await makeBooking({ status: 'REQUESTED', createdAt: new Date(Date.now() - 72 * HOUR) });
    await makeBooking({ status: 'REQUESTED' }); // recente
    await makeBooking({ status: 'ACCEPTED', createdAt: new Date(Date.now() - 72 * HOUR) }); // aceito

    const count = await expireStaleBookings();

    expect(count).toBe(1);
    const reloaded = await prisma.booking.findUnique({ where: { id: old.booking.id } });
    expect(reloaded?.status).toBe('CANCELLED');

    const events = await prisma.outboxEvent.findMany({ where: { routingKey: ROUTING_KEYS.BOOKING_CANCELLED } });
    expect(events).toHaveLength(1);
    expect((events[0].payload as { bookingId: string }).bookingId).toBe(old.booking.id);
  });
});

describe('sendBookingReminder', () => {
  it('emite booking.reminder quando o booking está ACCEPTED', async () => {
    const { booking } = await makeBooking({ status: 'ACCEPTED' });

    const sent = await sendBookingReminder(booking.id, '24h');

    expect(sent).toBe(true);
    const events = await prisma.outboxEvent.findMany({ where: { routingKey: ROUTING_KEYS.BOOKING_REMINDER } });
    expect(events).toHaveLength(1);
    expect((events[0].payload as { when: string }).when).toBe('24h');
  });

  it('não lembra um booking cancelado', async () => {
    const { booking } = await makeBooking({ status: 'CANCELLED' });

    const sent = await sendBookingReminder(booking.id, '1h');

    expect(sent).toBe(false);
    expect(await prisma.outboxEvent.count({ where: { routingKey: ROUTING_KEYS.BOOKING_REMINDER } })).toBe(0);
  });
});

describe('GET /admin/metrics/overview', () => {
  it('exige papel ADMIN', async () => {
    const client = await createUser({ role: 'CLIENT' });
    const app = await getApp();
    await request(app)
      .get('/api/v1/admin/metrics/overview')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .expect(403);
  });

  it('devolve a visão geral para o ADMIN', async () => {
    await makeBooking({ status: 'REQUESTED' });
    const admin = await createUser({ role: 'ADMIN' });
    const app = await getApp();

    const res = await request(app)
      .get('/api/v1/admin/metrics/overview')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .expect(200);

    expect(res.body).toHaveProperty('users');
    expect(res.body).toHaveProperty('bookings.total');
    expect(res.body.bookings.total).toBeGreaterThanOrEqual(1);
    expect(res.body).toHaveProperty('gmv');
  });
});

// ─── Agendamento delayed (BullMQ) — só com Redis ─────────────────────────────

const redisOn = process.env.REDIS_ENABLED === 'true';

(redisOn ? describe : describe.skip)('agendamento de lembretes (BullMQ, Redis real)', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { scheduleBookingReminders, cancelBookingReminders, getQueue, stopJobs } = require('../../src/jobs');
  /* eslint-enable @typescript-eslint/no-var-requires */

  afterAll(async () => {
    await stopJobs();
  });

  it('agenda os jobs 24h/1h e depois os cancela', async () => {
    const bookingId = `bk-${Date.now()}`;
    const scheduledAt = new Date(Date.now() + 48 * HOUR); // dois dias à frente

    await scheduleBookingReminders(bookingId, scheduledAt);

    const q = getQueue('reminders');
    const j24 = await q.getJob(`reminder:${bookingId}:24h`);
    const j1 = await q.getJob(`reminder:${bookingId}:1h`);
    expect(j24).toBeTruthy();
    expect(j1).toBeTruthy();

    await cancelBookingReminders(bookingId);
    expect(await q.getJob(`reminder:${bookingId}:24h`)).toBeFalsy();
    expect(await q.getJob(`reminder:${bookingId}:1h`)).toBeFalsy();
  });
});
