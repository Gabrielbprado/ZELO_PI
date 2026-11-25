import type { Channel } from 'amqplib';
import { env } from '../config/env';
import {
  CONSUMED_KEYS,
  MAIN_QUEUE,
  QUEUE_DLQ,
  RETRY_LEVELS,
  retryQueue,
} from './types';

/**
 * Declara a topologia do consumidor. Idempotente: assertExchange/assertQueue não falham
 * se já existem com os mesmos argumentos, então backend e serviço podem declarar a mesma
 * exchange sem coordenação. Cada fila de retry tem TTL e faz dead-letter de volta para a
 * fila principal (default exchange + routing key), contendo o retry a este serviço.
 */
export async function assertTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
  await channel.assertQueue(QUEUE_DLQ, { durable: true });

  await channel.assertQueue(MAIN_QUEUE, { durable: true });
  for (const key of CONSUMED_KEYS) {
    await channel.bindQueue(MAIN_QUEUE, env.RABBITMQ_EXCHANGE, key);
  }

  for (const level of RETRY_LEVELS) {
    await channel.assertQueue(retryQueue(level.suffix), {
      durable: true,
      arguments: {
        'x-message-ttl': level.ttlMs,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': MAIN_QUEUE,
      },
    });
  }
}
