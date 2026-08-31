/**
 * Dois níveis de garantia para o barramento de eventos:
 *
 *  A) SEM broker (sempre roda): o evento é gravado no outbox na MESMA transação da
 *     mudança de estado, e some junto se a transação falha. É o coração do padrão —
 *     e não depende de RabbitMQ nenhum para ser verificado.
 *
 *  B) COM broker (só quando RABBITMQ_ENABLED=true e um RabbitMQ está acessível):
 *     o ciclo completo outbox → relay → consumidor, provando que a notificação é
 *     persistida e o outbox é marcado como publicado.
 */
import { prisma } from '../../src/config/prisma';
import { createUser, createProvider } from './helpers';
import { createBooking, updateBookingStatus } from '../../src/services/bookings.service';
import { sendMessage } from '../../src/services/messages.service';
import { createReview } from '../../src/services/reviews.service';
import { confirmPayment } from '../../src/services/payments.service';
import { ROUTING_KEYS } from '../../src/events/types';

interface OutboxRow {
  routingKey: string;
  publishedAt: Date | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
}

function outbox(routingKey?: string): Promise<OutboxRow[]> {
  return prisma.outboxEvent.findMany({
    where: routingKey ? { routingKey } : {},
    orderBy: { createdAt: 'asc' },
  }) as unknown as Promise<OutboxRow[]>;
}

async function seedClientAndProvider() {
  const { provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@ev.test` });
  return { provider, category, client };
}

describe('outbox transacional (sem broker)', () => {
  it('createBooking grava booking.created não publicado, com o providerUserId resolvido', async () => {
    const { provider, category, client } = await seedClientAndProvider();

    const booking = await createBooking({
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Vazamento na pia',
      address: 'Rua das Flores, 100',
      urgency: 'FLEXIBLE',
    });

    const rows = await outbox(ROUTING_KEYS.BOOKING_CREATED);
    expect(rows).toHaveLength(1);
    expect(rows[0].publishedAt).toBeNull();
    expect(rows[0].payload.bookingId).toBe(booking.id);
    expect(rows[0].payload.providerUserId).toBe(provider.userId);
  });

  it('booking rejeitado não deixa evento algum — atomicidade', async () => {
    const client = await createUser({ email: `cli-${Date.now()}@ev.test` });

    await expect(
      createBooking({
        clientId: client.id,
        providerId: 'provider-inexistente',
        categoryId: 'plumb',
        title: 'x',
        address: 'Rua Y, 1',
        urgency: 'FLEXIBLE',
      }),
    ).rejects.toThrow();

    expect(await outbox()).toHaveLength(0);
  });

  it('aceitar e concluir emitem booking.accepted e booking.completed', async () => {
    const { provider, category, client } = await seedClientAndProvider();
    const booking = await createBooking({
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Troca de resistência',
      address: 'Av. Central, 500',
      urgency: 'TODAY',
    });

    await updateBookingStatus(booking.id, provider.userId, 'PROVIDER', 'ACCEPTED');
    await updateBookingStatus(booking.id, provider.userId, 'PROVIDER', 'COMPLETED', 180);

    expect(await outbox(ROUTING_KEYS.BOOKING_ACCEPTED)).toHaveLength(1);
    expect(await outbox(ROUTING_KEYS.BOOKING_COMPLETED)).toHaveLength(1);
  });

  it('confirmar pagamento emite payment.confirmed com o valor', async () => {
    const { provider, category, client } = await seedClientAndProvider();
    const booking = await createBooking({
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Instalação',
      address: 'Rua A, 10',
      urgency: 'FLEXIBLE',
    });
    await updateBookingStatus(booking.id, provider.userId, 'PROVIDER', 'COMPLETED', 200);
    await prisma.payment.create({
      data: { bookingId: booking.id, amount: 200, method: 'pix', status: 'PENDING' },
    });

    await confirmPayment(client.id, booking.id);

    const rows = await outbox(ROUTING_KEYS.PAYMENT_CONFIRMED);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.amount).toBe(200);
    expect(rows[0].payload.providerUserId).toBe(provider.userId);
  });

  it('enviar mensagem emite message.created para o destinatário', async () => {
    const a = await createUser({ email: `a-${Date.now()}@ev.test`, name: 'Marina' });
    const b = await createUser({ email: `b-${Date.now()}@ev.test`, name: 'Carlos' });

    await sendMessage(a.id, { receiverId: b.id, content: 'Bom dia, pode vir hoje?' });

    const rows = await outbox(ROUTING_KEYS.MESSAGE_CREATED);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.receiverId).toBe(b.id);
    expect(rows[0].payload.senderName).toBe('Marina');
  });

  it('avaliar emite review.created', async () => {
    const { provider, category, client } = await seedClientAndProvider();
    const booking = await createBooking({
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Reparo',
      address: 'Rua B, 20',
      urgency: 'FLEXIBLE',
    });
    await updateBookingStatus(booking.id, provider.userId, 'PROVIDER', 'COMPLETED', 150);

    await createReview(client.id, { bookingId: booking.id, rating: 5, comment: 'Excelente' });

    const rows = await outbox(ROUTING_KEYS.REVIEW_CREATED);
    expect(rows).toHaveLength(1);
    expect(rows[0].payload.rating).toBe(5);
    expect(rows[0].payload.providerId).toBe(provider.id);
  });
});

// ─── Ciclo completo, só com um RabbitMQ real ─────────────────────────────────

const brokerOn = process.env.RABBITMQ_ENABLED === 'true';
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function waitFor<T>(fn: () => Promise<T | null>, tries = 40, delayMs = 100): Promise<T | null> {
  for (let i = 0; i < tries; i += 1) {
    const r = await fn();
    if (r) return r;
    await sleep(delayMs);
  }
  return null;
}

(brokerOn ? describe : describe.skip)('ciclo outbox → relay → consumidor (RabbitMQ real)', () => {
  // Import tardio: só quando o broker está ligado, para o suite sem broker nem tocar
  // no amqplib.
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { startConsumer, stopConsumers } = require('../../src/events/consumers/runtime');
  const { notificationsConsumer } = require('../../src/events/consumers/notifications.consumer');
  const { analyticsConsumer } = require('../../src/events/consumers/analytics.consumer');
  const { drainOutboxOnce } = require('../../src/events/relay');
  const { createConsumerChannel, disconnectAmqp } = require('../../src/config/amqp');
  const { QUEUE_DLQ, RETRY_LEVELS, mainQueue, retryQueue } = require('../../src/events/types');
  /* eslint-enable @typescript-eslint/no-var-requires */

  async function purgeAll(): Promise<void> {
    const ch = await createConsumerChannel();
    if (!ch) return;
    const queues = [
      mainQueue('notifications'),
      mainQueue('analytics'),
      QUEUE_DLQ,
      ...RETRY_LEVELS.flatMap((l: { suffix: string }) => [
        retryQueue('notifications', l.suffix),
        retryQueue('analytics', l.suffix),
      ]),
    ];
    for (const q of queues) {
      try {
        await ch.purgeQueue(q);
      } catch {
        /* fila ainda não declarada: nada a purgar */
      }
    }
    await ch.close();
  }

  beforeAll(async () => {
    await startConsumer(notificationsConsumer);
    await startConsumer(analyticsConsumer);
    await purgeAll();
  });

  afterAll(async () => {
    await stopConsumers();
    await disconnectAmqp();
  });

  afterEach(async () => {
    await purgeAll();
  });

  it('publica o evento e o consumidor persiste a notificação; o outbox fica marcado', async () => {
    const { provider, category, client } = await seedClientAndProvider();
    const booking = await createBooking({
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Vazamento',
      address: 'Rua C, 30',
      urgency: 'FLEXIBLE',
    });

    await drainOutboxOnce();

    const notif = await waitFor(() =>
      prisma.notification.findFirst({ where: { userId: provider.userId, type: 'BOOKING' } }),
    );
    expect(notif).not.toBeNull();

    const row = await prisma.outboxEvent.findFirst({
      where: { routingKey: ROUTING_KEYS.BOOKING_CREATED },
    });
    expect(row?.publishedAt).not.toBeNull();
    expect(booking.id).toBe((row?.payload as { bookingId: string }).bookingId);
  });

  it('analytics recupera o trackBooked quando o booking veio de uma recomendação', async () => {
    const { provider, category, client } = await seedClientAndProvider();
    await createBooking({
      clientId: client.id,
      providerId: provider.id,
      categoryId: category.id,
      title: 'Pintura',
      address: 'Rua D, 40',
      urgency: 'FLEXIBLE',
      requestId: 'rec-req-abc',
    });

    await drainOutboxOnce();

    const rec = await waitFor(() =>
      prisma.recEvent.findFirst({ where: { type: 'BOOKED', requestId: 'rec-req-abc' } }),
    );
    expect(rec).not.toBeNull();
    expect(rec?.providerId).toBe(provider.id);
  });
});
