import { createServer } from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './utils/logger';
import { createRealtime, REALTIME_PATH } from './realtime/io';

const app = createApp();
const httpServer = createServer(app);

// Attach the JWT-authenticated socket.io layer to the same HTTP server.
createRealtime(httpServer);

const server = httpServer.listen(env.PORT, () => {
  logger.info(`ZERO API rodando em http://localhost:${env.PORT}`);
  logger.info(`Realtime (WebSocket) em ws://localhost:${env.PORT}${REALTIME_PATH}`);
});

const shutdown = (signal: string) => {
  logger.info(`${signal} recebido, encerrando...`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

export default app;
