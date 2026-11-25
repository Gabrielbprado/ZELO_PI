import * as amqp from 'amqplib';
import type { Channel, ChannelModel } from 'amqplib';
import { env } from './env';
import { logger } from './logger';

/**
 * Conexão com o RabbitMQ. O amqplib não reconecta sozinho: a conexão é cacheada e o
 * handler de 'close' zera o cache, de modo que o consumidor reassina no próprio ciclo e
 * a próxima tentativa reconecta. Se o broker está fora, o serviço fica ocioso mas de pé;
 * as mensagens continuam no broker (ou no outbox do backend) até ele voltar.
 */
let connection: ChannelModel | null = null;
let connecting: Promise<ChannelModel | null> | null = null;

export async function getAmqp(): Promise<ChannelModel | null> {
  if (connection) return connection;
  if (connecting) return connecting;

  connecting = amqp
    .connect(env.RABBITMQ_URL)
    .then((conn) => {
      connection = conn;
      conn.on('error', (err: Error) => logger.warn({ err: err.message }, 'rabbitmq: erro na conexão'));
      conn.on('close', () => {
        logger.warn('rabbitmq: conexão fechada');
        connection = null;
      });
      logger.info('rabbitmq conectado');
      return conn;
    })
    .catch((err: Error) => {
      logger.warn({ err: err.message }, 'rabbitmq não conectou; tentando de novo depois');
      connection = null;
      return null;
    })
    .finally(() => {
      connecting = null;
    });

  return connecting;
}

export async function createChannel(): Promise<Channel | null> {
  const conn = await getAmqp();
  if (!conn) return null;
  try {
    return await conn.createChannel();
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'rabbitmq: falha ao abrir canal');
    return null;
  }
}

export function amqpConnected(): boolean {
  return connection !== null;
}

export async function disconnectAmqp(): Promise<void> {
  const conn = connection;
  connection = null;
  if (!conn) return;
  try {
    await conn.close();
  } catch {
    /* já morta */
  }
}
