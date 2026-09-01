import type { ConnectionOptions } from 'bullmq';
import { env } from './env';

/**
 * Conexão e habilitação do BullMQ.
 *
 * BullMQ EXIGE `maxRetriesPerRequest: null` (usa conexões bloqueantes para o `BRPOPLPUSH`
 * do worker) — o oposto do cliente de cache (`redis.ts`), que usa `1` e fila offline
 * desligada para degradar rápido. Por isso o BullMQ ganha sua própria conexão, derivada
 * da mesma `REDIS_URL`, em vez de reusar o cliente do cache.
 *
 * Jobs são uma dependência do Redis: sem Redis, não há agendamento. É uma degradação
 * aceita — o app funciona, só não roda lembretes nem housekeeping. `JOBS_ENABLED` é um
 * kill-switch adicional por cima disso.
 */
export function jobsEnabled(): boolean {
  return env.JOBS_ENABLED && env.REDIS_ENABLED && Boolean(env.REDIS_URL);
}

/** Opções de conexão para as Queues/Workers do BullMQ, derivadas da REDIS_URL. */
export function jobsConnection(): ConnectionOptions {
  const url = new URL(env.REDIS_URL as string);
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0,
    maxRetriesPerRequest: null,
  };
}

/** Prefixo das chaves do BullMQ, separado do prefixo do cache para não se misturarem. */
export const JOBS_PREFIX = `${env.REDIS_KEY_PREFIX}:bull`;
