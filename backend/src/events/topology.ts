import type { Channel } from 'amqplib';
import { env } from '../config/env';
import {
  QUEUE_DLQ,
  RETRY_LEVELS,
  mainQueue,
  retryQueue,
  type RoutingKey,
} from './types';

/**
 * Declara a topologia. Idempotente por natureza (assertExchange/assertQueue não falham
 * se já existem com os MESMOS argumentos), então roda no boot de cada processo que fala
 * com o broker sem coordenação.
 *
 * Tudo `durable`: exchange, filas e a DLQ sobrevivem a um restart do RabbitMQ. Como o
 * broker não tem volume no compose (a verdade é o outbox), o que garante a entrega
 * mesmo assim é o relay republicando o que ficou com `publishedAt IS NULL`.
 */
export async function assertBaseTopology(channel: Channel): Promise<void> {
  await channel.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
  // DLQ única: o fim da linha depois de EVENT_MAX_ATTEMPTS. Fica visível na UI com o
  // profundímetro subindo — é o alarme de "algo está sistematicamente falhando".
  await channel.assertQueue(QUEUE_DLQ, { durable: true });
}

/**
 * Declara a fila principal de um consumidor, suas filas de espera de retry, e liga a
 * principal à exchange para cada routing key que o consumidor quer ouvir.
 *
 * Cada fila de espera tem TTL e faz dead-letter de volta para a fila PRINCIPAL do
 * próprio consumidor (via default exchange + `x-dead-letter-routing-key`), nunca para a
 * exchange de domínio — é o que mantém o retry contido a um consumidor só.
 */
export async function assertConsumerTopology(
  channel: Channel,
  consumer: string,
  bindingKeys: readonly RoutingKey[],
): Promise<void> {
  const main = mainQueue(consumer);
  await channel.assertQueue(main, { durable: true });
  for (const key of bindingKeys) {
    await channel.bindQueue(main, env.RABBITMQ_EXCHANGE, key);
  }

  for (const level of RETRY_LEVELS) {
    await channel.assertQueue(retryQueue(consumer, level.suffix), {
      durable: true,
      arguments: {
        'x-message-ttl': level.ttlMs,
        'x-dead-letter-exchange': '',
        'x-dead-letter-routing-key': main,
      },
    });
  }
}
