/**
 * Job `travel-timeout-active` — cenários B.1 a B.6 definidos pelo Agente 1
 * (docs/audits/ETAPA_2_1_PASS_FAIL_CRITERIA.md).
 *
 * Técnica: sessão é criada normal (status=ACTIVE, startedAt=now), e DEPOIS a gente
 * recua `startedAt` com UPDATE direto, simulando "sessão que começou há N horas".
 * Isso NÃO altera a lógica do service; só manipula o banco de testes.
 */
import { BookingTravelStatus } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { createProvider, createUser } from './helpers';
import { travelTimeoutActive } from '../../src/jobs/travelHousekeeping.job';
import { ROUTING_KEYS } from '../../src/events/types';

const HOUR_MS = 60 * 60 * 1000;

async function seedSession(status: BookingTravelStatus, startedAgoMs: number) {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@tmo.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'T', address: 'R', status: 'ACCEPTED' },
  });
  const created = await prisma.bookingTravel.create({
    data: {
      bookingId: booking.id,
      providerId: provider.id,
      status,
      // Para ARRIVED/CANCELLED também seta arrivedAt/endedAt consistentes.
      arrivedAt: status === BookingTravelStatus.ARRIVED ? new Date(Date.now() - startedAgoMs + 1000) : null,
      endedAt: status === BookingTravelStatus.ACTIVE ? null : new Date(Date.now() - startedAgoMs + 1000),
    },
  });
  // Força o startedAt — o default `now()` do Prisma ignora o valor do create se não é setado,
  // então o UPDATE é a técnica controlada para "backdating" seguro.
  const startedAt = new Date(Date.now() - startedAgoMs);
  await prisma.bookingTravel.update({ where: { id: created.id }, data: { startedAt } });
  return { bookingId: booking.id, providerId: provider.id, providerUserId: providerUser.id, clientId: client.id };
}

async function countTravelEnded(bookingId: string): Promise<number> {
  const events = await prisma.outboxEvent.findMany({
    where: { routingKey: ROUTING_KEYS.TRAVEL_ENDED },
    orderBy: { createdAt: 'desc' },
  });
  return events.filter((e) => (e.payload as { bookingId?: string }).bookingId === bookingId).length;
}

describe('travel-timeout-active (job) — cenários B.1 a B.6', () => {
  it('B.1 — ACTIVE < 8h: não é fechada', async () => {
    const { bookingId } = await seedSession(BookingTravelStatus.ACTIVE, 1 * HOUR_MS);

    const result = await travelTimeoutActive();

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId } });
    expect(session!.status).toBe(BookingTravelStatus.ACTIVE);
    expect(session!.endedAt).toBeNull();
    expect(await countTravelEnded(bookingId)).toBe(0);
    expect(result.closed).toBe(0);
  });

  it('B.2 — ACTIVE > 8h: fechada com reason=timeout e travel.ended emitido', async () => {
    const { bookingId } = await seedSession(BookingTravelStatus.ACTIVE, 9 * HOUR_MS);

    const result = await travelTimeoutActive();

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId } });
    expect(session!.status).toBe(BookingTravelStatus.CANCELLED);
    expect(session!.endReason).toBe('timeout');
    expect(session!.endedAt).not.toBeNull();
    expect(result.closed).toBe(1);

    expect(await countTravelEnded(bookingId)).toBe(1);
    const event = await prisma.outboxEvent.findFirst({
      where: { routingKey: ROUTING_KEYS.TRAVEL_ENDED },
      orderBy: { createdAt: 'desc' },
    });
    expect((event!.payload as { reason?: string }).reason).toBe('timeout');
  });

  it('B.3 — ARRIVED > 8h: ignorada', async () => {
    const { bookingId } = await seedSession(BookingTravelStatus.ARRIVED, 10 * HOUR_MS);

    const before = await prisma.bookingTravel.findUnique({ where: { bookingId } });

    const result = await travelTimeoutActive();

    const after = await prisma.bookingTravel.findUnique({ where: { bookingId } });
    expect(after!.status).toBe(BookingTravelStatus.ARRIVED);
    expect(after!.arrivedAt?.getTime()).toBe(before!.arrivedAt?.getTime());
    expect(after!.endedAt?.getTime()).toBe(before!.endedAt?.getTime());
    expect(await countTravelEnded(bookingId)).toBe(0);
    expect(result.closed).toBe(0);
  });

  it('B.4 — CANCELLED > 8h: ignorada', async () => {
    const { bookingId } = await seedSession(BookingTravelStatus.CANCELLED, 10 * HOUR_MS);

    const before = await prisma.bookingTravel.findUnique({ where: { bookingId } });

    const result = await travelTimeoutActive();

    const after = await prisma.bookingTravel.findUnique({ where: { bookingId } });
    expect(after!.status).toBe(BookingTravelStatus.CANCELLED);
    expect(after!.endedAt?.getTime()).toBe(before!.endedAt?.getTime());
    expect(await countTravelEnded(bookingId)).toBe(0);
    expect(result.closed).toBe(0);
  });

  it('B.5 — Execução duplicada do job: segunda chamada é no-op (idempotente)', async () => {
    const { bookingId } = await seedSession(BookingTravelStatus.ACTIVE, 9 * HOUR_MS);

    const first = await travelTimeoutActive();
    expect(first.closed).toBe(1);

    const second = await travelTimeoutActive();
    expect(second.closed).toBe(0);

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId } });
    expect(session!.status).toBe(BookingTravelStatus.CANCELLED);
    expect(await countTravelEnded(bookingId)).toBe(1); // continua 1, não duplicou
  });

  it('B.6 — Duas instâncias em paralelo: exatamente 1 transição e 1 evento', async () => {
    const { bookingId } = await seedSession(BookingTravelStatus.ACTIVE, 9 * HOUR_MS);

    const [a, b] = await Promise.all([travelTimeoutActive(), travelTimeoutActive()]);
    // A soma dos closed é 1 (uma venceu a corrida; a outra viu transition.count=0).
    expect(a.closed + b.closed).toBe(1);

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId } });
    expect(session!.status).toBe(BookingTravelStatus.CANCELLED);
    expect(session!.endReason).toBe('timeout');
    expect(await countTravelEnded(bookingId)).toBe(1); // sem duplicata
  });
});
