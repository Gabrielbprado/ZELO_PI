/**
 * Cenários de autenticação/roteamento do webhook Asaas exigidos pelo diagnóstico de
 * falhas do Sandbox. Complementa `payments.webhook.test.ts` (que foca no fluxo de
 * confirmação). Aqui o foco é: autenticação, rota, método, idempotência pelo eventId,
 * e resposta HTTP sob falha de persistência.
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor } from './helpers';
import { env } from '../../src/config/env';

const WEBHOOK_URL = '/api/v1/payments/webhook/asaas';
const WEBHOOK_TOKEN = env.ASAAS_WEBHOOK_TOKEN as string;

const realFetch = global.fetch;
afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

function mockAsaasGetPayment(details: { id: string; status: string; value?: number; externalReference?: string | null }): jest.Mock {
  // Response é single-shot (o body stream é consumido pela primeira chamada a .json()).
  // mockImplementation cria uma Response NOVA a cada invocação para suportar múltiplas
  // chamadas no mesmo teste (ex.: redelivery, idempotência).
  const spy = jest.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          id: details.id,
          status: details.status,
          value: details.value ?? 200,
          externalReference: details.externalReference ?? null,
          billingType: 'PIX',
        }),
        { status: 200 },
      ),
    ),
  );
  global.fetch = spy as unknown as typeof fetch;
  return spy;
}

async function seedPayment(externalId: string) {
  const { provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@wh.test` });
  const booking = await prisma.booking.create({
    data: {
      clientId: client.id, providerId: provider.id, categoryId: category.id,
      title: 'S', address: 'R', status: 'COMPLETED', priceEstimate: 200, priceFinal: 200,
    },
  });
  const payment = await prisma.payment.create({
    data: { bookingId: booking.id, amount: 200, method: 'pix', status: 'PENDING', externalId },
  });
  return { payment, booking };
}

function samplePayload(opts: { eventId?: string; paymentId?: string; event?: string; status?: string } = {}) {
  return {
    id: opts.eventId ?? `evt_${Date.now()}_${Math.random()}`,
    event: opts.event ?? 'PAYMENT_RECEIVED',
    dateCreated: new Date().toISOString(),
    payment: {
      id: opts.paymentId ?? `pay_${Date.now()}`,
      status: opts.status ?? 'RECEIVED',
      value: 200,
      externalReference: null,
    },
  };
}

describe('Webhook Asaas — autenticação e roteamento', () => {
  // ─── Token ──────────────────────────────────────────────────────────────

  it('1) token correto → 200', async () => {
    const { payment } = await seedPayment('pay_ok1');
    mockAsaasGetPayment({ id: 'pay_ok1', status: 'RECEIVED' });
    const app = await getApp();
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send(samplePayload({ paymentId: 'pay_ok1' }));
    expect(res.status).toBe(200);
    expect(res.body.received).toBe(true);

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PAID');
  });

  it('2) token ausente → 401 com body JSON padronizado (sem vazar valor)', async () => {
    const app = await getApp();
    const res = await request(app).post(WEBHOOK_URL).send(samplePayload());
    expect(res.status).toBe(401);
    expect(res.body?.error?.code).toBe('INVALID_WEBHOOK_TOKEN');
    // Nenhum valor do token ou do segredo pode vazar no corpo.
    expect(JSON.stringify(res.body)).not.toMatch(/token.*[a-f0-9]{16,}/i);
  });

  it('3) token incorreto → 401 e payment NÃO transita', async () => {
    const { payment } = await seedPayment('pay_bad1');
    const app = await getApp();
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', 'token-errado-32-chars-aaaaaaaaaa')
      .send(samplePayload({ paymentId: 'pay_bad1' }));
    expect(res.status).toBe(401);
    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PENDING');
  });

  it('3b) header case-insensitive (ASAAS-ACCESS-TOKEN uppercase) → 200', async () => {
    const { payment } = await seedPayment('pay_case1');
    mockAsaasGetPayment({ id: 'pay_case1', status: 'RECEIVED' });
    const app = await getApp();
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('ASAAS-ACCESS-TOKEN', WEBHOOK_TOKEN)
      .send(samplePayload({ paymentId: 'pay_case1' }));
    expect(res.status).toBe(200);
    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PAID');
  });

  // ─── Rota e método ──────────────────────────────────────────────────────

  it('4) rota inexistente → 404 JSON', async () => {
    const app = await getApp();
    // Sem /payments
    const res1 = await request(app).post('/api/v1/webhook/asaas').send({});
    expect(res1.status).toBe(404);
    // Sem /api/v1
    const res2 = await request(app).post('/payments/webhook/asaas').send({});
    expect(res2.status).toBe(404);
    // Sem /v1
    const res3 = await request(app).post('/api/payments/webhook/asaas').send({});
    expect(res3.status).toBe(404);
  });

  it('4b) método não-POST no path correto → 405 (não vaza como 401)', async () => {
    const app = await getApp();
    const get = await request(app).get(WEBHOOK_URL);
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe('POST');
    expect(get.body?.error?.code).toBe('METHOD_NOT_ALLOWED');

    const put = await request(app).put(WEBHOOK_URL).send({});
    expect(put.status).toBe(405);

    const del = await request(app).delete(WEBHOOK_URL);
    expect(del.status).toBe(405);
  });

  // ─── Idempotência ──────────────────────────────────────────────────────

  it('5) evento válido → 200 e payment transita para PAID', async () => {
    const { payment } = await seedPayment('pay_v1');
    mockAsaasGetPayment({ id: 'pay_v1', status: 'RECEIVED' });
    const app = await getApp();
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send(samplePayload({ paymentId: 'pay_v1', eventId: 'evt_valid_1' }));
    expect(res.status).toBe(200);
    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PAID');
  });

  it('6) evento duplicado (mesmo id) → segunda chamada 200 com duplicate:true, SEM re-transição', async () => {
    const { payment } = await seedPayment('pay_dup1');
    mockAsaasGetPayment({ id: 'pay_dup1', status: 'RECEIVED' });
    const app = await getApp();
    const body = samplePayload({ paymentId: 'pay_dup1', eventId: 'evt_dup_once' });

    const first = await request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(body);
    const second = await request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);

    // Exatamente 1 evento no outbox para esse paymentId.
    const events = await prisma.outboxEvent.findMany({ where: { routingKey: 'payment.confirmed' } });
    expect(events.filter((e) => (e.payload as { paymentId?: string }).paymentId === payment.id)).toHaveLength(1);
  });

  // ─── Falha de persistência: não mascarar como sucesso ──────────────────

  it('7) falha no fetch do Asaas → 200 com ignored:fetch_failed, SEM claim e SEM transição', async () => {
    const { payment } = await seedPayment('pay_f1');
    // Fetch falha — simulamos retorno 500 em vez de 200.
    global.fetch = jest.fn().mockResolvedValue(new Response('error', { status: 500 })) as unknown as typeof fetch;
    const app = await getApp();
    const body = samplePayload({ paymentId: 'pay_f1', eventId: 'evt_fetchfail' });

    const res = await request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(body);
    // Comportamento intencional: 200 é o que o Asaas Sandbox espera para NÃO reentregar
    // imediatamente (reentrega agressiva causaria thundering herd). O importante é que a
    // transação não aconteceu: payment ainda PENDING, e o eventId NÃO está claimado, para
    // que um retry futuro consiga processar quando o fetch voltar.
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('fetch_failed');

    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PENDING');

    const claimed = await prisma.processedEvent.findUnique({
      where: { consumer_eventId: { consumer: 'asaas-webhook', eventId: 'evt_fetchfail' } },
    });
    expect(claimed).toBeNull();
  });

  // ─── Resposta HTTP 200 em caminho de sucesso ───────────────────────────

  it('8) resposta final é 200 em caminho de sucesso (asserção explícita)', async () => {
    await seedPayment('pay_200');
    mockAsaasGetPayment({ id: 'pay_200', status: 'RECEIVED' });
    const app = await getApp();
    const res = await request(app)
      .post(WEBHOOK_URL)
      .set('asaas-access-token', WEBHOOK_TOKEN)
      .send(samplePayload({ paymentId: 'pay_200' }));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('received', true);
  });

  // ─── Payload de exemplo da documentação oficial do Asaas ───────────────

  it('9) payload shape da doc oficial (PAYMENT_RECEIVED com campos adicionais) é aceito', async () => {
    const { payment } = await seedPayment('pay_doc');
    mockAsaasGetPayment({ id: 'pay_doc', status: 'RECEIVED', value: 200, externalReference: payment.bookingId });
    const app = await getApp();
    // Shape reproduzido da doc oficial: inclui `object`, `dateCreated`, campos extras
    // em `payment`. O schema Zod ignora extras não declarados — vale o contrato mínimo.
    const payload = {
      id: 'evt_doc_sample',
      event: 'PAYMENT_RECEIVED',
      dateCreated: new Date().toISOString(),
      payment: {
        object: 'payment',
        id: 'pay_doc',
        dateCreated: '2026-11-01',
        customer: 'cus_123',
        paymentLink: null,
        value: 200,
        netValue: 198,
        originalValue: null,
        interestValue: null,
        description: 'Teste sandbox',
        billingType: 'PIX',
        pixTransaction: null,
        status: 'RECEIVED',
        dueDate: '2026-11-02',
        originalDueDate: '2026-11-02',
        paymentDate: '2026-11-01',
        clientPaymentDate: '2026-11-01',
        installmentNumber: null,
        invoiceUrl: 'https://sandbox.asaas.com/i/pay_doc',
        invoiceNumber: '000000001',
        externalReference: payment.bookingId,
        deleted: false,
        anticipated: false,
        anticipable: false,
      },
    };
    const res = await request(app).post(WEBHOOK_URL).set('asaas-access-token', WEBHOOK_TOKEN).send(payload);
    expect(res.status).toBe(200);
    const reloaded = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(reloaded?.status).toBe('PAID');
  });
});
