import { env } from './config/env';
import { logger } from './config/logger';
import { prisma } from './config/prisma';
import { disconnectAmqp } from './config/amqp';
import { startConsumer, stopConsumer } from './events/consumer';
import { createServer } from './http/server';

async function main(): Promise<void> {
  const app = createServer();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'notifications service ouvindo');
  });

  // Começa a consumir eventos. Resiliente: se o broker estiver fora, tenta reconectar
  // em loop sem derrubar o processo (a API interna continua servindo o inbox já gravado).
  await startConsumer();

  const shutdown = (signal: string): void => {
    logger.info({ signal }, 'encerrando...');
    server.close(() => {
      void Promise.allSettled([stopConsumer(), disconnectAmqp(), prisma.$disconnect()]).finally(() =>
        process.exit(0),
      );
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

void main();
