/**
 * Agenda e disponibilidade: o profissional define a grade semanal, o público vê os
 * horários livres (menos folgas e bookings), e — o mais importante — dois clientes NÃO
 * conseguem reservar o mesmo horário (o conflito que antes não era validado).
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor } from './helpers';
import { createBooking } from '../../src/services/bookings.service';
import { ConflictError } from '../../src/errors';

function futureDate(daysAhead: number): string {
  return new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
}
function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay();
}
/** Um Date em UTC no dia `dateStr` às `hour`:00. */
function atHour(dateStr: string, hour: number): Date {
  return new Date(`${dateStr}T${String(hour).padStart(2, '0')}:00:00.000Z`);
}

describe('disponibilidade do profissional', () => {
  it('define a grade semanal e devolve os horários livres', async () => {
    const { user: pro, provider } = await createProvider();
    const app = await getApp();
    const date = futureDate(7);
    const weekday = weekdayOf(date);

    await request(app)
      .put('/api/v1/providers/me/availability')
      .set('Authorization', `Bearer ${tokenFor(pro)}`)
      .send({ rules: [{ weekday, startMinute: 480, endMinute: 720 }] }) // 08:00–12:00
      .expect(200);

    const res = await request(app).get(`/api/v1/providers/${provider.id}/slots?date=${date}`).expect(200);
    // 08–09, 09–10, 10–11, 11–12
    expect(res.body.slots).toHaveLength(4);
  });

  it('remove do slots os horários já reservados', async () => {
    const { user: pro, provider, category } = await createProvider();
    const client = await createUser({ email: `cli-${Date.now()}@av.test` });
    const app = await getApp();
    const date = futureDate(8);
    const weekday = weekdayOf(date);

    await request(app)
      .put('/api/v1/providers/me/availability')
      .set('Authorization', `Bearer ${tokenFor(pro)}`)
      .send({ rules: [{ weekday, startMinute: 480, endMinute: 720 }] })
      .expect(200);

    // Reserva 10:00 → o slot 10–11 some.
    await createBooking({
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Serviço',
      address: 'Rua 1',
      urgency: 'FLEXIBLE',
      scheduledAt: atHour(date, 10).toISOString(),
    });

    const res = await request(app).get(`/api/v1/providers/${provider.id}/slots?date=${date}`).expect(200);
    expect(res.body.slots).toHaveLength(3);
    expect(res.body.slots.some((s: { startsAt: string }) => s.startsAt === atHour(date, 10).toISOString())).toBe(false);
  });

  it('rejeita grade com faixas sobrepostas (400)', async () => {
    const { user: pro } = await createProvider();
    const app = await getApp();
    await request(app)
      .put('/api/v1/providers/me/availability')
      .set('Authorization', `Bearer ${tokenFor(pro)}`)
      .send({ rules: [{ weekday: 1, startMinute: 480, endMinute: 720 }, { weekday: 1, startMinute: 600, endMinute: 800 }] })
      .expect(400);
  });
});

describe('conflito de agendamento', () => {
  it('impede dois bookings no mesmo horário do profissional', async () => {
    const { provider, category } = await createProvider();
    const a = await createUser({ email: `a-${Date.now()}@av.test` });
    const b = await createUser({ email: `b-${Date.now()}@av.test` });
    const when = atHour(futureDate(9), 14).toISOString();

    const base = { providerId: provider.id, categoryId: category.id, title: 'X', address: 'Rua 1', urgency: 'FLEXIBLE' as const, scheduledAt: when };

    await createBooking({ ...base, clientId: a.id });
    await expect(createBooking({ ...base, clientId: b.id })).rejects.toThrow(ConflictError);

    // Só um booking existe para aquele horário.
    const count = await prisma.booking.count({ where: { providerId: provider.id, scheduledAt: new Date(when) } });
    expect(count).toBe(1);
  });

  it('permite horários que não colidem', async () => {
    const { provider, category } = await createProvider();
    const client = await createUser({ email: `c-${Date.now()}@av.test` });
    const date = futureDate(10);
    const base = { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'X', address: 'Rua 1', urgency: 'FLEXIBLE' as const };

    await createBooking({ ...base, scheduledAt: atHour(date, 9).toISOString() });
    await expect(createBooking({ ...base, scheduledAt: atHour(date, 11).toISOString() })).resolves.toBeTruthy();
  });
});
