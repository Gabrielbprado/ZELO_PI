import { Prisma } from '@prisma/client';
import type { Channel, ConsumeMessage } from 'amqplib';
import { prisma } from '../../config/prisma';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { runWithRequestContext } from '../../utils/requestContext';
import { eventsConsumed, eventProcessing } from '../../config/metrics';
import { createConsumerChannel } from '../../config/amqp';
import { assertBaseTopology, assertConsumerTopology } from '../topology';
import {
  EVENT_SCHEMAS,
  HEADER_ATTEMPTS,
  QUEUE_DLQ,
  mainQueue,
  retryLevelFor,
  retryQueue,
  type DomainEvent,
  type RoutingKey,
} from '../types';

/**
 * Um consumidor de eventos de domínio. `handle` recebe uma transação: as gravações do
 * handler E o registro de idempotência commitam JUNTOS, então "processou" e "efeito
 * colateral persistido" nunca divergem.
 */
export interface EventConsumer {
  name: string;
  bindings: readonly RoutingKey[];
  handle(event: DomainEvent, tx: Prisma.TransactionClient): Promise<void>;
}

const PREFETCH = 10;
const active: Channel[] = [];
let stopped = false;

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}

/**
 * Processa uma mensagem: valida contra o contrato, roda o handler sob idempotência, e
 * decide ack / retry / DLQ.
 *
 * A inserção em `ProcessedEvent` é o PORTÃO de concorrência, não um `findUnique` antes:
 * se duas entregas correm, a segunda viola a PK composta (P2002), a transação inteira
 * — inclusive os efeitos do handler — dá rollback, e a mensagem é tratada como
 * duplicata (ack, sem retry). É o padrão de consumidor idempotente na sua forma mínima.
 */
async function processMessage(channel: Channel, consumer: EventConsumer, msg: ConsumeMessage): Promise<void> {
  const routingKey = msg.fields.routingKey as RoutingKey;
  const eventId = msg.properties.messageId as string | undefined;

  const schema = EVENT_SCHEMAS[routingKey];
  // Contrato divergente (chave desconhecida, corpo malformado, sem messageId) é
  // veneno: retentar não conserta. Vai direto para a DLQ, uma vez.
  if (!schema || !eventId) {
    logger.warn({ routingKey, consumer: consumer.name }, 'evento sem contrato conhecido; para a DLQ');
    deadLetter(channel, msg);
    channel.ack(msg);
    return;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(msg.content.toString());
  } catch {
    deadLetter(channel, msg);
    channel.ack(msg);
    return;
  }

  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    logger.warn({ routingKey, issues: parsed.error.issues }, 'payload fora do contrato; para a DLQ');
    deadLetter(channel, msg);
    channel.ack(msg);
    return;
  }

  const event = { id: eventId, routingKey, payload: parsed.data } as DomainEvent;

  // Reidrata o correlation id que veio do backend no header: os logs deste consumidor
  // passam a carregar o mesmo requestId da request HTTP que originou o evento.
  const header = msg.properties.headers?.['x-request-id'];
  const requestId = typeof header === 'string' ? header : undefined;

  const handle = async (): Promise<void> => {
    const endTimer = eventProcessing.startTimer({ consumer: consumer.name });
    try {
      await prisma.$transaction(async (tx) => {
        await consumer.handle(event, tx);
        await tx.processedEvent.create({ data: { consumer: consumer.name, eventId } });
      });
      channel.ack(msg);
      eventsConsumed.inc({ consumer: consumer.name, result: 'ok' });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Já processado por uma entrega anterior. Rollback já desfez os efeitos desta.
        channel.ack(msg);
        eventsConsumed.inc({ consumer: consumer.name, result: 'duplicate' });
        return;
      }
      scheduleRetry(channel, consumer, msg, err);
      eventsConsumed.inc({ consumer: consumer.name, result: 'retry' });
    } finally {
      endTimer();
    }
  };

  if (requestId) {
    await runWithRequestContext({ requestId }, handle);
  } else {
    await handle();
  }
}

/** Reenfileira em uma fila de espera com backoff, ou manda para a DLQ após o limite. */
function scheduleRetry(channel: Channel, consumer: EventConsumer, msg: ConsumeMessage, err: unknown): void {
  const attempts = Number(msg.properties.headers?.[HEADER_ATTEMPTS] ?? 0) + 1;
  const headers = { ...msg.properties.headers, [HEADER_ATTEMPTS]: attempts };
  const opts = { persistent: true, headers, messageId: msg.properties.messageId };

  if (attempts >= env.EVENT_MAX_ATTEMPTS) {
    logger.warn(
      { consumer: consumer.name, attempts, err: (err as Error).message },
      'evento esgotou as tentativas; para a DLQ',
    );
    channel.sendToQueue(QUEUE_DLQ, msg.content, opts);
  } else {
    const level = retryLevelFor(attempts);
    logger.debug({ consumer: consumer.name, attempts, wait: level.suffix }, 'evento reagendado para retry');
    channel.sendToQueue(retryQueue(consumer.name, level.suffix), msg.content, opts);
  }
  // Ack só DEPOIS de a cópia (retry/DLQ) estar publicada: se o processo cair no meio, o
  // original continua na fila e é reentregue — nunca sumindo.
  channel.ack(msg);
}

function deadLetter(channel: Channel, msg: ConsumeMessage): void {
  channel.sendToQueue(QUEUE_DLQ, msg.content, {
    persistent: true,
    headers: msg.properties.headers,
    messageId: msg.properties.messageId,
  });
}

/** Abre canal, declara topologia e começa a consumir. Reassina sozinho se o canal cair. */
async function subscribe(consumer: EventConsumer): Promise<void> {
  if (stopped) return;
  const channel = await createConsumerChannel();
  if (!channel) {
    logger.warn({ consumer: consumer.name }, 'sem canal; consumidor não iniciou');
    return;
  }

  await assertBaseTopology(channel);
  await assertConsumerTopology(channel, consumer.name, consumer.bindings);
  await channel.prefetch(PREFETCH);
  active.push(channel);

  const resubscribe = (): void => {
    const idx = active.indexOf(channel);
    if (idx >= 0) active.splice(idx, 1);
    if (!stopped) setTimeout(() => void subscribe(consumer), 2_000);
  };
  channel.on('error', (e: Error) => logger.warn({ err: e.message, consumer: consumer.name }, 'canal do consumidor: erro'));
  channel.on('close', resubscribe);

  await channel.consume(mainQueue(consumer.name), (msg) => {
    if (msg) void processMessage(channel, consumer, msg);
  });
  logger.info({ consumer: consumer.name, bindings: consumer.bindings }, 'consumidor de eventos iniciado');
}

export async function startConsumer(consumer: EventConsumer): Promise<void> {
  stopped = false;
  await subscribe(consumer);
}

export async function stopConsumers(): Promise<void> {
  stopped = true;
  const channels = active.splice(0, active.length);
  await Promise.all(
    channels.map(async (ch) => {
      try {
        await ch.close();
      } catch {
        // canal já morto
      }
    }),
  );
}
