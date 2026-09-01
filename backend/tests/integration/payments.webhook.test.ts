/**
 * Webhook do Asaas: é a fonte da verdade da confirmação quando o gateway está ligado.
 * Valida o token de origem, confirma o pagamento pelo externalId e emite payment.confirmed
 * no outbox (que o microserviço de notificações consome).
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider } from './helpers';
import { ROUTING_KEYS } from '../../src/events/types';

const WEBHOOK_URL = '/api/v1/payments/webhook/asaas';
const TOKEN = 'test-webhook-token';

async function seedPayment(externalId: string) {
  const { provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@pay.test` });
  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Serviço',
      address: 'Rua 1',
      status: 'COMPLETED',
      priceEstimate: 200,
    },
  });
  const payment = await prisma.payment.create({
    data: { bookingId: booking.id, amount: 200, method: 'pix', status: 'PENDING', externalId },
  });
  return { payment, booking };
}

describe('POST /payments/webhook/asaas', () => {
  it('confirma o pagamento e emite payment.confirmed com token válido', async () => {
    const { payment } = await seedPayment('pay_webhook_1');
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', TOKEN)
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_webhook_1', status: 'RECEIVED' } })
      .expect(200);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PAID');

    const events = await prisma.outboxEvent.findMany({ where: { routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED } });
    expect(events).toHaveLength(1);
    expect((events[0].payload as { paymentId: string }).paymentId).toBe(payment.id);
  });

  it('rejeita token inválido com 401 e não confirma', async () => {
    const { payment } = await seedPayment('pay_webhook_2');
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', 'errado')
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_webhook_2' } })
      .expect(401);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('ignora eventos que não são de pagamento recebido (200, sem mudança)', async () => {
    const { payment } = await seedPayment('pay_webhook_3');
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', TOKEN)
      .send({ event: 'PAYMENT_CREATED', payment: { id: 'pay_webhook_3' } })
      .expect(200);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('não quebra quando a cobrança é desconhecida', async () => {
    const app = await getApp();
    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', TOKEN)
      .send({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_inexistente' } })
      .expect(200);
  });

  it('é idempotente: dois webhooks do mesmo pagamento emitem um evento só', async () => {
    const { payment } = await seedPayment('pay_webhook_idem');
    const app = await getApp();
    const body = { event: 'PAYMENT_RECEIVED', payment: { id: 'pay_webhook_idem' } };

    await request(app).post(WEBHOOK_URL).set('asaas-access-token', TOKEN).send(body).expect(200);
    await request(app).post(WEBHOOK_URL).set('asaas-access-token', TOKEN).send(body).expect(200);

    const events = await prisma.outboxEvent.findMany({ where: { routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED } });
    expect(events.filter((e) => (e.payload as { paymentId: string }).paymentId === payment.id)).toHaveLength(1);
  });
});
