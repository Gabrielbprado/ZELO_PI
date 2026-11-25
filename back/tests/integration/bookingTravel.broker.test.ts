/**
 * AMQP end-to-end do consumer `travel.consumer`. Rodado só quando um RabbitMQ real
 * está acessível (RABBITMQ_ENABLED=true). O fluxo exercitado é o REAL, sem bypass:
 *
 *   recordEvent (dentro de tx)
 *     → OutboxEvent persistido
 *     → drainOutboxOnce() (relay)
 *     → publica no exchange `zelo.events` com confirm
 *     → mensagem roteia para a fila `travel.q`
 *     → consumer `travel.consumer` processa
 *     → grava ProcessedEvent (idempotência)
 *     → aplica efeito (travel.ended → broadcast + redis.del)
 *
 * A chamada direta ao handler é EXPRESSAMENTE proibida pelos critérios A.6.
 */
import { BookingTravelStatus, type Prisma } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { getRedis } from '../../src/config/redis';
import { createProvider, createUser } from './helpers';
import { ROUTING_KEYS, QUEUE_DLQ, mainQueue, retryQueue, RETRY_LEVELS } from '../../src/events/types';

const brokerOn = process.env.RABBITMQ_ENABLED === 'true';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null>, tries = 50, delayMs = 100): Promise<T | null> {
  for (let i = 0; i < tries; i += 1) {
    const r = await fn();
    if (r) return r;
    await sleep(delayMs);
  }
  return null;
}

async function seedActiveTravel() {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@amqp.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'T', address: 'R', status: 'ACCEPTED' },
  });
  const travel = await prisma.bookingTravel.create({
    data: { bookingId: booking.id, providerId: provider.id, status: BookingTravelStatus.ACTIVE },
  });
  return { booking, provider, providerUser, client, travel };
}

(brokerOn ? describe : describe.skip)('AMQP end-to-end — travel.consumer (RabbitMQ real)', () => {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { startConsumer, stopConsumers } = require('../../src/events/consumers/runtime');
  const { travelConsumer } = require('../../src/events/consumers/travel.consumer');
  const { drainOutboxOnce } = require('../../src/events/relay');
  const { createConsumerChannel, disconnectAmqp, getPublishChannel } = require('../../src/config/amqp');
  const { recordEvent } = require('../../src/events/domainBus');
  /* eslint-enable @typescript-eslint/no-var-requires */

  async function purgeAll(): Promise<void> {
    const ch = await createConsumerChannel();
    if (!ch) return;
    const queues = [
      mainQueue('travel'),
      QUEUE_DLQ,
      ...RETRY_LEVELS.flatMap((l: { suffix: string }) => [retryQueue('travel', l.suffix)]),
    ];
    for (const q of queues) {
      try { await ch.purgeQueue(q); } catch { /* fila ainda não declarada */ }
    }
    await ch.close();
  }

  beforeAll(async () => {
    await startConsumer(travelConsumer);
    await purgeAll();
  });

  afterAll(async () => {
    await stopConsumers();
    await disconnectAmqp();
  });

  afterEach(async () => {
    await purgeAll();
  });

  it('A.1 — publicação pelo relay marca o outbox como published', async () => {
    const { booking, provider, providerUser, client } = await seedActiveTravel();
    // Publica via outbox (fluxo real) — simulando o `startTravel` sem chamar o service
    // de novo (o service já foi testado em bookingTravel.test). O ponto deste teste é
    // o transporte: outbox → relay → broker → consumer → ProcessedEvent.
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await recordEvent(tx, ROUTING_KEYS.TRAVEL_STARTED, {
        bookingId: booking.id,
        providerId: provider.id,
        providerUserId: providerUser.id,
        clientId: client.id,
        startedAt: new Date().toISOString(),
      });
    });

    await drainOutboxOnce();

    const row = await waitFor(async () => {
      const r = await prisma.outboxEvent.findFirst({
        where: { routingKey: ROUTING_KEYS.TRAVEL_STARTED },
        orderBy: { createdAt: 'desc' },
      });
      return r?.publishedAt ? r : null;
    });
    expect(row).not.toBeNull();
    expect(row!.publishedAt).not.toBeNull();
  });

  it('A.2 — consumer processa e grava ProcessedEvent (sem bypass)', async () => {
    const { booking, provider, providerUser, client } = await seedActiveTravel();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await recordEvent(tx, ROUTING_KEYS.TRAVEL_STARTED, {
        bookingId: booking.id,
        providerId: provider.id,
        providerUserId: providerUser.id,
        clientId: client.id,
        startedAt: new Date().toISOString(),
      });
    });
    await drainOutboxOnce();

    // A idempotência é feita pelo consumer inserindo em ProcessedEvent (consumer+eventId).
    // Essa linha é prova objetiva de que o consumer RECEBEU e PROCESSOU, sem bypass.
    const processed = await waitFor(async () => {
      const outbox = await prisma.outboxEvent.findFirst({
        where: { routingKey: ROUTING_KEYS.TRAVEL_STARTED },
        orderBy: { createdAt: 'desc' },
      });
      if (!outbox) return null;
      const pe = await prisma.processedEvent.findUnique({
        where: { consumer_eventId: { consumer: 'travel', eventId: outbox.id } },
      });
      return pe;
    });
    expect(processed).not.toBeNull();
  });

  it('A.3 — redelivery do mesmo eventId é tratada como duplicata (ProcessedEvent continua com 1 linha)', async () => {
    const { booking, provider, providerUser, client } = await seedActiveTravel();

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await recordEvent(tx, ROUTING_KEYS.TRAVEL_STARTED, {
        bookingId: booking.id,
        providerId: provider.id,
        providerUserId: providerUser.id,
        clientId: client.id,
        startedAt: new Date().toISOString(),
      });
    });
    await drainOutboxOnce();

    // Aguarda o consumer processar a primeira entrega.
    const outbox = await waitFor(async () => {
      const r = await prisma.outboxEvent.findFirst({
        where: { routingKey: ROUTING_KEYS.TRAVEL_STARTED },
        orderBy: { createdAt: 'desc' },
      });
      return r?.publishedAt ? r : null;
    });
    expect(outbox).not.toBeNull();

    const before = await prisma.processedEvent.count({ where: { consumer: 'travel', eventId: outbox!.id } });
    expect(before).toBe(1);

    // Reentrega MANUAL via canal auxiliar: publica a mesma mensagem no exchange de novo.
    // O consumer vai processar, tentar INSERT em ProcessedEvent, bater em P2002 (unique),
    // tx rollback, ack como duplicata. ProcessedEvent continua com 1 linha.
    const ch = await getPublishChannel();
    expect(ch).not.toBeNull();
    ch!.publish(
      process.env.RABBITMQ_EXCHANGE ?? 'zelo.events',
      ROUTING_KEYS.TRAVEL_STARTED,
      Buffer.from(JSON.stringify(outbox!.payload)),
      { messageId: outbox!.id, persistent: true },
    );
    await new Promise<void>((resolve, reject) => ch!.waitForConfirms().then(() => resolve()).catch(reject));

    // Espera um ciclo de consumo e re-conta.
    await sleep(500);
    const after = await prisma.processedEvent.count({ where: { consumer: 'travel', eventId: outbox!.id } });
    expect(after).toBe(1);
  });

  it('A.4 — travel.ended apaga a chave Redis via consumer', async () => {
    const { booking, provider, providerUser, client } = await seedActiveTravel();
    const r = getRedis();
    expect(r).not.toBeNull();
    // Chave existe antes do evento.
    await r!.set(`zelo:travel:${booking.id}:location`, JSON.stringify({ x: 1 }), 'EX', 60);
    expect(await r!.exists(`zelo:travel:${booking.id}:location`)).toBe(1);

    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await recordEvent(tx, ROUTING_KEYS.TRAVEL_ENDED, {
        bookingId: booking.id,
        providerId: provider.id,
        providerUserId: providerUser.id,
        clientId: client.id,
        reason: 'arrived' as const,
        endedAt: new Date().toISOString(),
      });
    });
    await drainOutboxOnce();

    // Aguarda o consumer processar e apagar.
    const gone = await waitFor(async () => {
      const exists = await r!.exists(`zelo:travel:${booking.id}:location`);
      return exists === 0 ? true : null;
    });
    expect(gone).toBe(true);
  });

  it('A.5 — payload malformado vai para a DLQ (ack na fila original, sem reentrega infinita)', async () => {
    // Publica DIRETAMENTE no exchange um JSON que não passa no schema travelStarted.
    const ch = await getPublishChannel();
    expect(ch).not.toBeNull();
    const badId = `bad-${Date.now()}`;
    ch!.publish(
      process.env.RABBITMQ_EXCHANGE ?? 'zelo.events',
      ROUTING_KEYS.TRAVEL_STARTED,
      Buffer.from(JSON.stringify({ ohNo: true })),
      { messageId: badId, persistent: true },
    );
    await new Promise<void>((resolve, reject) => ch!.waitForConfirms().then(() => resolve()).catch(reject));

    // Espera a DLQ receber UMA mensagem. Usamos check assíncrono do count via canal aux.
    const dlqReceived = await waitFor(async () => {
      const aux = await createConsumerChannel();
      if (!aux) return null;
      try {
        const q = await aux.checkQueue(QUEUE_DLQ);
        return q.messageCount > 0 ? q.messageCount : null;
      } finally {
        await aux.close();
      }
    });
    expect(dlqReceived).not.toBeNull();
    expect(dlqReceived! >= 1).toBe(true);

    // O ProcessedEvent NÃO deve ter sido criado (consumer rejeitou antes).
    const processed = await prisma.processedEvent.count({ where: { consumer: 'travel', eventId: badId } });
    expect(processed).toBe(0);
  });
});
