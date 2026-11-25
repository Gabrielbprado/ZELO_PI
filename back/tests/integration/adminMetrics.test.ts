/**
 * Painel admin: GMV, comissão, ticket médio, funil de conversão, e métricas do
 * profissional. Tudo restrito por papel.
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor } from './helpers';
import { settlePaymentConfirmed } from '../../src/services/ledger.service';

async function bookingIn(status: 'REQUESTED' | 'ACCEPTED' | 'COMPLETED', opts: { pay?: boolean; amount?: number } = {}) {
  const { user: pro, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@m.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'X', address: 'R', status },
  });
  if (opts.pay) {
    const payment = await prisma.payment.create({
      data: { bookingId: booking.id, amount: opts.amount ?? 100, method: 'pix', status: 'PAID' },
    });
    await settlePaymentConfirmed(payment.id);
  }
  return { pro, provider, booking };
}

async function adminToken(): Promise<string> {
  const admin = await createUser({ role: 'ADMIN', email: `adm-${Date.now()}-${Math.random()}@m.test` });
  return tokenFor(admin);
}

describe('overview', () => {
  it('reporta GMV, comissão, ticket médio e contagens', async () => {
    await bookingIn('COMPLETED', { pay: true, amount: 100 });
    await bookingIn('COMPLETED', { pay: true, amount: 300 });

    const app = await getApp();
    const res = await request(app).get('/api/v1/admin/metrics/overview').set('Authorization', `Bearer ${await adminToken()}`).expect(200);
    expect(res.body.gmv).toBe(400);
    expect(res.body.paidCount).toBe(2);
    expect(res.body.avgTicket).toBe(200);
    // comissão 12%: 12% de (100+300)*100c = 4800c
    expect(res.body.commissionCents).toBe(4800);
    expect(res.body.bookings.total).toBe(2);
  });

  it('é restrito a ADMIN', async () => {
    const client = await createUser({ role: 'CLIENT' });
    const app = await getApp();
    await request(app).get('/api/v1/admin/metrics/overview').set('Authorization', `Bearer ${tokenFor(client)}`).expect(403);
  });
});

describe('funil', () => {
  it('conta as etapas e as taxas de conversão', async () => {
    await bookingIn('REQUESTED');
    await bookingIn('ACCEPTED');
    await bookingIn('COMPLETED', { pay: true });

    const app = await getApp();
    const res = await request(app).get('/api/v1/admin/metrics/funnel').set('Authorization', `Bearer ${await adminToken()}`).expect(200);
    const stages = Object.fromEntries(res.body.stages.map((s: { key: string; count: number }) => [s.key, s.count]));
    expect(stages.requested).toBe(3);
    expect(stages.accepted).toBe(2); // ACCEPTED + COMPLETED
    expect(stages.completed).toBe(1);
    expect(stages.paid).toBe(1);
    expect(res.body.rates.completedFromAccepted).toBeCloseTo(0.5);
    expect(res.body.rates.paidFromCompleted).toBeCloseTo(1);
  });
});

describe('métricas do profissional', () => {
  it('reporta desempenho e ganhos', async () => {
    const { pro, provider } = await bookingIn('COMPLETED', { pay: true, amount: 100 });
    // mais um booking REQUESTED para o mesmo profissional
    const client = await createUser({ email: `cli2-${Date.now()}@m.test` });
    await prisma.booking.create({ data: { clientId: client.id, providerId: provider.id, categoryId: 'plumb', title: 'Y', address: 'R', status: 'REQUESTED' } });

    const app = await getApp();
    const res = await request(app).get('/api/v1/providers/me/metrics').set('Authorization', `Bearer ${tokenFor(pro)}`).expect(200);
    expect(res.body.bookings.total).toBe(2);
    expect(res.body.bookings.completed).toBe(1);
    expect(res.body.acceptRate).toBeCloseTo(0.5);
    expect(res.body.completionRate).toBeCloseTo(1);
    expect(res.body.balanceCents).toBe(8800);
    expect(res.body.totalEarnedCents).toBe(8800);
  });

  it('é restrito a PROFISSIONAL', async () => {
    const client = await createUser({ role: 'CLIENT' });
    const app = await getApp();
    await request(app).get('/api/v1/providers/me/metrics').set('Authorization', `Bearer ${tokenFor(client)}`).expect(403);
  });
});
