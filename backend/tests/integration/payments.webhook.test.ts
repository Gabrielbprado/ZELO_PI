/**
 * Webhook do Asaas: fonte da verdade da confirmação quando o gateway está ligado.
 * Valida o token no header `asaas-access-token`, re-busca o estado real pela API
 * (via global.fetch mockado nos testes), confirma pelo externalId e emite
 * payment.confirmed no outbox (que o microserviço de notificações consome).
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider } from './helpers';
import { ROUTING_KEYS } from '../../src/events/types';

const WEBHOOK_URL = '/api/v1/payments/webhook/asaas';
const WEBHOOK_TOKEN = 'test-asaas-webhook-token-32-chars-min';

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

function mockAsaasGetPayment(details: {
  id: string;
  status: string;
  value?: number;
  externalReference?: string | null;
  billingType?: string;
}): jest.Mock {
  const spy = jest.fn().mockResolvedValue(
    new Response(
      JSON.stringify({
        id: details.id,
        status: details.status,
        value: details.value ?? 200,
        externalReference: details.externalReference ?? null,
        billingType: details.billingType ?? 'PIX',
      }),
      { status: 200 },
    ),
  );
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

async function seedPayment(externalId: string, overrides: { amount?: number; method?: string } = {}) {
  const { provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@pay.test` });
  const amount = overrides.amount ?? 200;
  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Serviço',
      address: 'Rua 1',
      status: 'COMPLETED',
      priceEstimate: amount,
      priceFinal: amount,
    },
  });
  const payment = await prisma.payment.create({
    data: { bookingId: booking.id, amount, method: overrides.method ?? 'pix', status: 'PENDING', externalId },
  });
  return { payment, booking };
}

function makeAsaasWebhookBody(opts: { paymentId: string; event?: string; status?: string; value?: number; externalReference?: string | null; eventId?: string }) {
  return {
    id: opts.eventId ?? `evt_${Date.now()}_${Math.random()}`,
    event: opts.event ?? 'PAYMENT_RECEIVED',
    dateCreated: new Date().toISOString(),
    payment: {
      id: opts.paymentId,
      status: opts.status ?? 'RECEIVED',
      value: opts.value ?? 200,
      externalReference: opts.externalReference ?? null,
    },
  };
}

describe('POST /payments/webhook/asaas', () => {
  it('confirma o pagamento e emite payment.confirmed com token válido', async () => {
    const { payment } = await seedPayment('pay_abc1');
    mockAsaasGetPayment({ id: 'pay_abc1', status: 'RECEIVED', value: 200 });
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send(makeAsaasWebhookBody({ paymentId: 'pay_abc1' }))
      .expect(200);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PAID');

    const events = await prisma.outboxEvent.findMany({ where: { routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED } });
    expect(events.filter((e) => (e.payload as { paymentId: string }).paymentId === payment.id)).toHaveLength(1);
  });

  it('rejeita token inválido com 401 e não confirma', async () => {
    const { payment } = await seedPayment('pay_abc2');
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', 'token-errado')
      .send(makeAsaasWebhookBody({ paymentId: 'pay_abc2' }))
      .expect(401);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('rejeita webhook sem token com 401', async () => {
    const { payment } = await seedPayment('pay_abc3');
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .send(makeAsaasWebhookBody({ paymentId: 'pay_abc3' }))
      .expect(401);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('ignora payload sem payment.id (200, sem mudança)', async () => {
    const { payment } = await seedPayment('pay_abc4');
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send({ id: 'evt_x', event: 'PAYMENT_UPDATED' })
      .expect(200);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('não quebra quando a cobrança é desconhecida', async () => {
    mockAsaasGetPayment({ id: 'pay_desconhecida', status: 'RECEIVED', value: 200 });
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send(makeAsaasWebhookBody({ paymentId: 'pay_desconhecida' }))
      .expect(200);
  });

  it('marca como FAILED quando o status Asaas é terminal negativo', async () => {
    const { payment } = await seedPayment('pay_abc5');
    mockAsaasGetPayment({ id: 'pay_abc5', status: 'OVERDUE', value: 200 });
    const app = await getApp();

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send(makeAsaasWebhookBody({ paymentId: 'pay_abc5', event: 'PAYMENT_OVERDUE', status: 'OVERDUE' }))
      .expect(200);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('FAILED');
  });

  it('é idempotente: dois webhooks do mesmo evento emitem um payment.confirmed só', async () => {
    const { payment } = await seedPayment('pay_abc6');
    mockAsaasGetPayment({ id: 'pay_abc6', status: 'RECEIVED', value: 200 });
    const app = await getApp();

    const body = makeAsaasWebhookBody({ paymentId: 'pay_abc6', eventId: 'evt_dup' });
    await request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(body).expect(200);
    await request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(body).expect(200);

    const events = await prisma.outboxEvent.findMany({ where: { routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED } });
    expect(events.filter((e) => (e.payload as { paymentId: string }).paymentId === payment.id)).toHaveLength(1);
  });

  it('é idempotente sob webhooks concorrentes do mesmo evento', async () => {
    const { payment } = await seedPayment('pay_abc7');
    mockAsaasGetPayment({ id: 'pay_abc7', status: 'RECEIVED', value: 200 });
    const app = await getApp();

    const body = makeAsaasWebhookBody({ paymentId: 'pay_abc7', eventId: 'evt_concurrent' });
    await Promise.all([
      request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(body).expect(200),
      request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(body).expect(200),
    ]);

    const events = await prisma.outboxEvent.findMany({ where: { routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED } });
    expect(events.filter((e) => (e.payload as { paymentId: string }).paymentId === payment.id)).toHaveLength(1);
  });

  it('registra audit log de PAYMENT_PAID com asaasEventId', async () => {
    const { payment } = await seedPayment('pay_abc8');
    mockAsaasGetPayment({ id: 'pay_abc8', status: 'RECEIVED', value: 200 });
    const app = await getApp();
    const eventId = `evt_audit_${Date.now()}`;

    await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send(makeAsaasWebhookBody({ paymentId: 'pay_abc8', eventId }))
      .expect(200);

    const audit = await prisma.auditLog.findFirst({
      where: { entity: 'Payment', entityId: payment.id, action: 'PAYMENT_PAID' },
    });
    expect(audit?.metadata).toMatchObject({ asaasEventId: eventId });
  });
});
