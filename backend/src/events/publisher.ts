import type { ConfirmChannel } from 'amqplib';
import { env } from '../config/env';
import { HEADER_ATTEMPTS } from './types';

export interface PublishableEvent {
  id: string;
  routingKey: string;
  payload: unknown;
}

/**
 * Publica UM evento e resolve só quando o broker confirma (ou falha) ESTA mensagem.
 *
 * Usar o callback por-mensagem do confirm channel — em vez de um `waitForConfirms()`
 * global — é o que deixa o relay marcar `publishedAt` exatamente para os eventos que o
 * RabbitMQ ACKou, publicando um lote inteiro em pipeline sem perder a granularidade.
 * Um evento que não confirma simplesmente continua com `publishedAt IS NULL` e o
 * próximo tick tenta de novo: no pior caso, entrega duplicada — que a idempotência do
 * consumidor absorve —, nunca entrega perdida.
 */
export function publishConfirmed(channel: ConfirmChannel, event: PublishableEvent): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      channel.publish(
        env.RABBITMQ_EXCHANGE,
        event.routingKey,
        Buffer.from(JSON.stringify(event.payload)),
        {
          persistent: true,
          contentType: 'application/json',
          // O id da linha do outbox viaja como messageId: é a chave de deduplicação
          // no consumidor. Same event id → processado uma vez, sempre.
          messageId: event.id,
          timestamp: Math.floor(Date.now() / 1000),
          headers: { [HEADER_ATTEMPTS]: 0 },
        },
        (err) => resolve(!err),
      );
    } catch {
      // Canal fechado no meio do voo: trata como não-confirmado; o relay retenta.
      resolve(false);
    }
  });
}
