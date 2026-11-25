import { Prisma } from '@prisma/client';
import type { Channel, ConsumeMessage } from 'amqplib';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../config/logger';
import { createChannel } from '../config/amqp';
import { runWithRequestContext } from '../config/requestContext';
import { eventsConsumed, eventProcessing, notificationsPersisted } from '../config/metrics';
import { assertTopology } from './topology';
import { toInbox } from './mapper';
import { pushToUser } from '../push/expoPush';
import {
  CONSUMER,
  EVENT_SCHEMAS,
  HEADER_ATTEMPTS,
  MAIN_QUEUE,
  QUEUE_DLQ,
  ROUTING_KEYS,
  retryLevelFor,
  retryQueue,
  type DomainEvent,
  type RoutingKey,
} from './types';

const PREFETCH = 10;
let channel: Channel | null = null;
let stopped = false;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Persiste cada entrada de inbox derivada do evento e dispara o push. O id da linha É
 * derivado do id do evento (`${eventId}` ou `${eventId}:${suffix}` para eventos multi-
 * destinatário como `payment.confirmed`): uma entrega duplicada colide na PK (P2002) e é
 * tratada como duplicata, sem tabela auxiliar. Cada entrada é persistida na sua própria
 * chamada — uma duplicata isolada NÃO impede que a irmã (outro destinatário) seja
 * gravada, garantindo que o cliente e o profissional recebam ambos, ainda que o broker
 * reentregue o mesmo evento no meio do processamento.
 */
async function persistAndPush(event: DomainEvent): Promise<void> {
  const entries = toInbox(event);
  if (entries.length === 0) return;

  for (const entry of entries) {
    const id = entry.suffix ? `${event.id}:${entry.suffix}` : event.id;
    try {
      await prisma.notification.create({
        data: {
          id,
          userId: entry.userId,
          type: entry.type,
          title: entry.title,
          body: entry.body,
          data: entry.data as unknown as Prisma.InputJsonValue,
        },
      });
      notificationsPersisted.inc();
      // Push best-effort e por-destinatário: falha do push de A não impede persistir/push
      // de B, e uma duplicata (que nem chega a inserir) também não re-empurra.
      await pushToUser(entry.userId, { title: entry.title, body: entry.body, data: entry.data });
    } catch (err) {
      if (isUniqueViolation(err)) continue; // já persistido em entrega anterior
      throw err;
    }
  }
}

/** Sincroniza a réplica local de tokens. Upsert/delete são idempotentes por natureza. */
async function handlePushToken(event: DomainEvent): Promise<void> {
  if (event.routingKey !== ROUTING_KEYS.USER_PUSHTOKEN_SET) return;
  const { userId, pushToken } = event.payload;
  if (pushToken) {
    await prisma.pushToken.upsert({
      where: { userId },
      create: { userId, token: pushToken },
      update: { token: pushToken },
    });
  } else {
    await prisma.pushToken.deleteMany({ where: { userId } });
  }
}

async function processMessage(ch: Channel, msg: ConsumeMessage): Promise<void> {
  const routingKey = msg.fields.routingKey as RoutingKey;
  const eventId = msg.properties.messageId as string | undefined;
  const schema = EVENT_SCHEMAS[routingKey];

  if (!schema || !eventId) {
    logger.warn({ routingKey }, 'evento sem contrato/id; para a DLQ');
    settleDeadLetter(ch, msg);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(msg.content.toString());
  } catch {
    settleDeadLetter(ch, msg);
    return;
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ routingKey, issues: parsed.error.issues }, 'payload fora do contrato; para a DLQ');
    settleDeadLetter(ch, msg);
    return;
  }

  const event = { id: eventId, routingKey, payload: parsed.data } as DomainEvent;

  // Validação adicional estrita para payment.confirmed: amount finito e > 0.
  // Um NaN passava pela guarda antiga (NaN > 0 e NaN <= 0 são ambos false) e
  // chegava no mapper como "R$ NaN" na notificação ao cliente.
  if (routingKey === ROUTING_KEYS.PAYMENT_CONFIRMED) {
    const p = event.payload as { amount?: number };
    if (typeof p.amount !== 'number' || !Number.isFinite(p.amount) || p.amount <= 0) {
      logger.warn({ eventId }, 'payment.confirmed: amount inválido, para DLQ');
      settleDeadLetter(ch, msg);
      return;
    }
  }

  const header = msg.properties.headers?.['x-request-id'];
  const requestId = typeof header === 'string' ? header : undefined;

  const run = async (): Promise<void> => {
    const endTimer = eventProcessing.startTimer();
    try {
      if (routingKey === ROUTING_KEYS.USER_PUSHTOKEN_SET) {
        await handlePushToken(event);
      } else {
        await persistAndPush(event);
      }
      ch.ack(msg);
      eventsConsumed.inc({ result: 'ok' });
    } catch (err) {
      if (isUniqueViolation(err)) {
        ch.ack(msg); // duplicata: já persistida numa entrega anterior
        eventsConsumed.inc({ result: 'duplicate' });
        return;
      }
      scheduleRetry(ch, msg, err);
      eventsConsumed.inc({ result: 'retry' });
    } finally {
      endTimer();
    }
  };

  // Reidrata o correlation id (do backend, via header AMQP) para os logs deste serviço.
  if (requestId) {
    await runWithRequestContext({ requestId }, run);
  } else {
    await run();
  }
}

function scheduleRetry(ch: Channel, msg: ConsumeMessage, err: unknown): void {
  const attempts = Number(msg.properties.headers?.[HEADER_ATTEMPTS] ?? 0) + 1;
  const headers = { ...msg.properties.headers, [HEADER_ATTEMPTS]: attempts };
  const opts = { persistent: true, headers, messageId: msg.properties.messageId };

  if (attempts >= env.EVENT_MAX_ATTEMPTS) {
    logger.warn({ attempts, err: (err as Error).message }, 'evento esgotou tentativas; para a DLQ');
    ch.sendToQueue(QUEUE_DLQ, msg.content, opts);
  } else {
    ch.sendToQueue(retryQueue(retryLevelFor(attempts).suffix), msg.content, opts);
  }
  ch.ack(msg);
}

function deadLetter(ch: Channel, msg: ConsumeMessage): boolean {
  try {
    ch.sendToQueue(QUEUE_DLQ, msg.content, {
      persistent: true,
      headers: msg.properties.headers,
      messageId: msg.properties.messageId,
    });
    return true;
  } catch (err) {
    logger.warn(
      { err: (err as Error).message, messageId: msg.properties.messageId },
      'DLQ: falha ao publicar; nack com requeue para o broker reentregar',
    );
    return false;
  }
}

/**
 * Resolve uma mensagem rumo à DLQ com a semântica correta: só faz ack se o publish
 * na DLQ não lançou. Se o canal cair no meio, nack+requeue e o broker reentrega —
 * antes a mensagem era perdida porque o ack ia sempre depois do sendToQueue sem
 * nenhuma verificação.
 */
function settleDeadLetter(ch: Channel, msg: ConsumeMessage): void {
  if (deadLetter(ch, msg)) {
    try {
      ch.ack(msg);
    } catch {
      /* canal já caiu — o broker vai reentregar na próxima conexão */
    }
  } else {
    try {
      ch.nack(msg, false, true);
    } catch {
      /* canal caiu antes do nack, o broker reentrega quando reabrir */
    }
  }
}

async function subscribe(): Promise<void> {
  if (stopped) return;
  const ch = await createChannel();
  if (!ch) {
    // Broker fora: tenta de novo em breve. O serviço fica de pé, ocioso.
    setTimeout(() => void subscribe(), 3_000);
    return;
  }

  await assertTopology(ch);
  await ch.prefetch(PREFETCH);
  channel = ch;

  ch.on('error', (e: Error) => logger.warn({ err: e.message }, 'canal: erro'));
  ch.on('close', () => {
    channel = null;
    if (!stopped) setTimeout(() => void subscribe(), 2_000);
  });

  await ch.consume(MAIN_QUEUE, (msg) => {
    if (msg) void processMessage(ch, msg);
  });
  logger.info({ consumer: CONSUMER, queue: MAIN_QUEUE }, 'consumidor iniciado');
}

export async function startConsumer(): Promise<void> {
  stopped = false;
  await subscribe();
}

export async function stopConsumer(): Promise<void> {
  stopped = true;
  const ch = channel;
  channel = null;
  if (!ch) return;
  try {
    await ch.close();
  } catch {
    /* já fechado */
  }
}
