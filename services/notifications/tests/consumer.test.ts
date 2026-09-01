/**
 * O ciclo de verdade do serviço, com um RabbitMQ real (gated por BROKER_TESTS=1):
 * publicar um evento na exchange de domínio → o consumidor persiste o inbox no schema
 * `notifications`, é idempotente, e sincroniza a réplica de push token.
 */
const brokerOn = process.env.BROKER_TESTS === '1';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null>, tries = 40, delayMs = 100): Promise<T | null> {
  for (let i = 0; i < tries; i += 1) {
    const r = await fn();
    if (r) return r;
    await sleep(delayMs);
  }
  return null;
}

(brokerOn ? describe : describe.skip)('consumidor de eventos (RabbitMQ real)', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { startConsumer, stopConsumer } = require('../src/events/consumer');
  const { createChannel, disconnectAmqp } = require('../src/config/amqp');
  const { assertTopology } = require('../src/events/topology');
  const { env } = require('../src/config/env');
  const { prisma } = require('../src/config/prisma');
  const { MAIN_QUEUE, QUEUE_DLQ, RETRY_LEVELS, retryQueue } = require('../src/events/types');
  /* eslint-enable @typescript-eslint/no-var-requires */

  async function publish(routingKey: string, payload: unknown, id: string): Promise<void> {
    const ch = await createChannel();
    await assertTopology(ch);
    ch.publish(env.RABBITMQ_EXCHANGE, routingKey, Buffer.from(JSON.stringify(payload)), {
      persistent: true,
      messageId: id,
      contentType: 'application/json',
    });
    await ch.close();
  }

  async function purge(): Promise<void> {
    const ch = await createChannel();
    if (!ch) return;
    for (const q of [MAIN_QUEUE, QUEUE_DLQ, ...RETRY_LEVELS.map((l: { suffix: string }) => retryQueue(l.suffix))]) {
      try {
        await ch.purgeQueue(q);
      } catch {
        /* nada a purgar */
      }
    }
    await ch.close();
  }

  beforeAll(async () => {
    await startConsumer();
    await purge();
  });

  afterEach(async () => {
    await purge();
    await prisma.notification.deleteMany();
    await prisma.pushToken.deleteMany();
  });

  afterAll(async () => {
    await stopConsumer();
    await disconnectAmqp();
    await prisma.$disconnect();
  });

  it('persiste o inbox de um booking.created', async () => {
    await publish(
      'booking.created',
      { bookingId: 'b1', clientId: 'c', providerId: 'p', providerUserId: 'prov1', categoryId: 'plumb', title: 'Vazamento' },
      'evt-1',
    );

    const n = await waitFor<any>(() => prisma.notification.findFirst({ where: { userId: 'prov1' } }));
    expect(n).not.toBeNull();
    expect(n.id).toBe('evt-1'); // a PK é o id do evento
    expect(n.type).toBe('BOOKING');
  });

  it('é idempotente: o mesmo evento duas vezes gera uma linha só', async () => {
    const payload = { bookingId: 'b2', clientId: 'c', providerId: 'p', providerUserId: 'prov2', categoryId: 'plumb', title: 'X' };
    await publish('booking.created', payload, 'evt-dup');
    await publish('booking.created', payload, 'evt-dup');

    await waitFor(() => prisma.notification.findUnique({ where: { id: 'evt-dup' } }));
    await sleep(400); // dá tempo de a segunda entrega ser processada (e descartada)

    const count = await prisma.notification.count({ where: { id: 'evt-dup' } });
    expect(count).toBe(1);
  });

  it('sincroniza a réplica de push token via user.pushtoken.set', async () => {
    await publish('user.pushtoken.set', { userId: 'u9', pushToken: 'ExponentPushToken[abc]' }, 'evt-tok');

    const t = await waitFor<any>(() => prisma.pushToken.findUnique({ where: { userId: 'u9' } }));
    expect(t).not.toBeNull();
    expect(t.token).toBe('ExponentPushToken[abc]');
  });

  it('payload fora do contrato não persiste nada (vai para a DLQ)', async () => {
    await publish('booking.created', { nope: true }, 'evt-bad');
    await sleep(500);
    const count = await prisma.notification.count();
    expect(count).toBe(0);
  });
});
