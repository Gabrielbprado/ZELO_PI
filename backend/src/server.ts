import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { createRealtime, REALTIME_PATH } from './realtime/io';
import { getRedis, disconnectRedis } from './config/redis';

const app = createApp();
const httpServer = createServer(app);

// Attach the JWT-authenticated socket.io layer to the same HTTP server.
createRealtime(httpServer);

// Abre a conexão no boot para que a primeira requisição já encontre o cache pronto.
// `getRedis()` é no-op quando REDIS_ENABLED=false, e nunca lança.
getRedis();

const server = httpServer.listen(env.PORT, () => {
  logger.info(`ZERO API rodando em http://localhost:${env.PORT}`);
  logger.info(`Realtime (WebSocket) em ws://localhost:${env.PORT}${REALTIME_PATH}`);
});

const shutdown = (signal: string) => {
  logger.info(`${signal} recebido, encerrando...`);
  server.close(() => {
    // Encerra o Redis depois do servidor HTTP: requisições em voo ainda podem
    // querer ler do cache enquanto drenam.
    void disconnectRedis().finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
