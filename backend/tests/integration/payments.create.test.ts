import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { createProvider, createUser, getApp, tokenFor } from './helpers';

async function seedPayableBooking() {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@pay-create.test` });
  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Servico',
      address: 'Rua 1',
      status: 'COMPLETED',
      priceFinal: 200,
    },
  });
  return { booking, client, providerUser };
}

describe('POST /payments', () => {
  it('reutiliza pagamento cash pendente em retry do cliente', async () => {
    const { booking, client } = await seedPayableBooking();
    const app = await getApp();
    const token = tokenFor(client);
    const body = { bookingId: booking.id, method: 'cash' };

    const first = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    const second = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`)
      .send(body)
      .expect(201);

    expect(second.body.payment.id).toBe(first.body.payment.id);
    expect(await prisma.payment.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it('idempotency key: segunda request com mesma chave retorna mesmo payment', async () => {
    const { booking, client } = await seedPayableBooking();
    const app = await getApp();
    const token = tokenFor(client);
    const idemKey = '550e8400-e29b-41d4-a716-446655440000';
    const body = { bookingId: booking.id, method: 'cash', idempotencyKey: idemKey };

    const first = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send(body)
      .expect(201);

    const second = await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send(body)
      .expect(201);

    expect(second.body.payment.id).toBe(first.body.payment.id);
    expect(await prisma.payment.count({ where: { bookingId: booking.id } })).toBe(1);
  });

  it('idempotency key: chave reutilizada para booking diferente → 409', async () => {
    const { booking: b1, client } = await seedPayableBooking();
    const { booking: b2 } = await seedPayableBooking();
    const app = await getApp();
    const token = tokenFor(client);
    const idemKey = '550e8400-e29b-41d4-a716-446655440001';

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send({ bookingId: b1.id, method: 'cash', idempotencyKey: idemKey })
      .expect(201);

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${token}`)
      .set('Idempotency-Key', idemKey)
      .send({ bookingId: b2.id, method: 'cash', idempotencyKey: idemKey })
      .expect(409);
  });

  it('rejeita cartão sem card/cardHolderInfo/installments', async () => {
    const { booking, client } = await seedPayableBooking();
    const app = await getApp();

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ bookingId: booking.id, method: 'credit_card' })
      .expect(400);
  });

  it('bloqueia alteração de preço quando já existe pagamento ativo', async () => {
    const { booking, client, providerUser } = await seedPayableBooking();
    const app = await getApp();

    await request(app)
      .post('/api/v1/payments')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ bookingId: booking.id, method: 'cash' })
      .expect(201);

    await request(app)
      .patch(`/api/v1/bookings/${booking.id}/price`)
      .set('Authorization', `Bearer ${tokenFor(providerUser)}`)
      .send({ priceFinal: 250 })
      .expect(400);

    const reloaded = await prisma.booking.findUnique({ where: { id: booking.id } });
    expect(reloaded?.priceFinal).toBe(200);
  });
});