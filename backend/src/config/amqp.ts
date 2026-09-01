import * as amqp from 'amqplib';
import type { Channel, ChannelModel, ConfirmChannel } from 'amqplib';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Conexão com o RabbitMQ.
 *
 * Mesma filosofia do `redis.ts`: dependência OPCIONAL. O outbox é gravado dentro da
 * transação de domínio SEMPRE, exista broker ou não — é o Postgres que guarda a
 * verdade. O RabbitMQ é só o transporte que o relay usa para entregar. Se ele cai, os
 * eventos ficam represados no outbox (`publishedAt IS NULL`) e são publicados quando
 * volta; nenhum evento se perde, e nenhuma requisição HTTP trava por causa disso.
 *
 * O amqplib NÃO reconecta sozinho. Por isso a conexão é cacheada e o handler de
 * 'close'/'error' apenas ZERA o cache: o relay pede o canal a cada tick e os
 * consumidores reassinam no seu próprio ciclo, então a próxima tentativa reconecta
 * naturalmente com backoff, sem um supervisor central.
 */

let connection: ChannelModel | null = null;
let connecting: Promise<ChannelModel | null> | null = null;
let publishChannel: ConfirmChannel | null = null;

export function isAmqpEnabled(): boolean {
  return env.RABBITMQ_ENABLED && Boolean(env.RABBITMQ_URL);
}

/**
 * Devolve a conexão, abrindo-a se preciso, ou `null` quando o broker está desligado
 * por configuração ou inacessível. Nunca lança: quem chama degrada.
 */
export async function getAmqp(): Promise<ChannelModel | null> {
  if (!isAmqpEnabled()) return null;
  if (connection) return connection;
  if (connecting) return connecting;

  connecting = amqp
    .connect(env.RABBITMQ_URL as string)
    .then((conn) => {
      connection = conn;
      conn.on('error', (err: Error) => logger.warn({ err: err.message }, 'rabbitmq: erro na conexão'));
      conn.on('close', () => {
        logger.warn('rabbitmq: conexão fechada');
        connection = null;
        publishChannel = null;
      });
      logger.info('rabbitmq conectado');
      return conn;
    })
    .catch((err: Error) => {
      logger.warn({ err: err.message }, 'rabbitmq não conectou; eventos ficam represados no outbox');
      connection = null;
      return null;
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

/**
 * Canal de publicação com *publisher confirms* ligados. É o único canal que o relay
 * usa, e confirmar é o que fecha a última fresta do outbox: só marcamos `publishedAt`
 * depois que o broker ACKou a mensagem, então uma falha na entrega vira reentrega, não
 * evento perdido.
 */
export async function getPublishChannel(): Promise<ConfirmChannel | null> {
  if (publishChannel) return publishChannel;
  const conn = await getAmqp();
  if (!conn) return null;
  try {
    const ch = await conn.createConfirmChannel();
    // O relay assere a exchange no próprio canal de publicação: assim ele não depende
    // de nenhum consumidor ter subido antes para a exchange existir. Idempotente.
    await ch.assertExchange(env.RABBITMQ_EXCHANGE, 'topic', { durable: true });
    ch.on('error', (err: Error) => logger.warn({ err: err.message }, 'rabbitmq: erro no canal de publicação'));
    ch.on('close', () => {
      publishChannel = null;
    });
    publishChannel = ch;
    return ch;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'rabbitmq: falha ao abrir canal de publicação');
    return null;
  }
}

/** Canal novo para um consumidor. Cada consumidor é dono do seu canal e do seu prefetch. */
export async function createConsumerChannel(): Promise<Channel | null> {
  const conn = await getAmqp();
  if (!conn) return null;
  try {
    return await conn.createChannel();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'rabbitmq: falha ao abrir canal de consumo');
    return null;
  }
}

/** Estado para o health check. Não faz I/O — só lê o que já sabemos. */
export function amqpStatus(): 'disabled' | 'ready' | 'down' {
  if (!isAmqpEnabled()) return 'disabled';
  return connection ? 'ready' : 'down';
}

export async function disconnectAmqp(): Promise<void> {
  const conn = connection;
  connection = null;
  publishChannel = null;
  if (!conn) return;
  try {
    await conn.close();
  } catch {
    // Fechar em cima de uma conexão já morta é inofensivo.
  }
}
