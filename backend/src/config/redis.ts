import Redis, { type RedisOptions } from 'ioredis';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Cliente Redis compartilhado.
 *
 * O Redis aqui é uma dependência OPCIONAL, e essa decisão molda toda a configuração
 * abaixo. Cache, rate limit distribuído e estado do circuit breaker são melhorias — o
 * sistema já funcionava sem nenhum deles, e precisa continuar funcionando se o Redis
 * cair no meio de uma apresentação.
 *
 * `enableOfflineQueue: false` é a linha que faz isso valer na prática. Com o padrão
 * (`true`), o ioredis ENFILEIRA comandos em memória enquanto está desconectado, e cada
 * request fica pendurada até estourar o timeout — trocando "sem cache" por "API lenta e
 * depois quebrada", que é bem pior. Com a fila desligada, o comando falha na hora e o
 * chamador degrada para o banco.
 */
function buildOptions(): RedisOptions {
  return {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: 1_000,
    keyPrefix: `${env.REDIS_KEY_PREFIX}:`,
    // Reconecta com backoff, mas nunca desiste: um Redis que volta depois de 10
    // minutos deve voltar a ser usado sem reiniciar a API.
    retryStrategy: (times) => Math.min(times * 200, 5_000),
  };
}

let client: Redis | null = null;
let rateLimitClient: Redis | null = null;

/**
 * Devolve o cliente, ou `null` quando o Redis está desligado por configuração.
 * Chamadores nunca devem assumir que ele existe.
 */
export function getRedis(): Redis | null {
  if (!env.REDIS_ENABLED || !env.REDIS_URL) return null;
  if (client) return client;

  client = new Redis(env.REDIS_URL, buildOptions());

  // Sem um handler de 'error' o ioredis emite um erro não tratado e derruba o
  // processo — exatamente o oposto do que "dependência opcional" significa.
  client.on('error', (err) => logger.warn({ err: err.message }, 'redis indisponível'));
  client.on('ready', () => logger.info('redis conectado'));

  client.connect().catch((err) => {
    logger.warn({ err: err.message }, 'redis não conectou no boot; seguindo sem cache');
  });

  return client;
}

/**
 * Cliente separado para o rate limit.
 *
 * O `rate-limit-redis` carrega seus scripts Lua no CONSTRUTOR, que roda no import do
 * módulo — antes de qualquer conexão existir. Com a fila offline desligada, esse
 * primeiro comando falha na hora e gera uma rejeição não tratada no boot. Aqui a fila
 * fica LIGADA justamente para absorver esse instante, e `commandTimeout` garante que
 * nenhum comando de rate limit fique pendurado numa requisição real.
 *
 * Vale a pena o cliente extra: são duas conexões, e a alternativa era ligar a fila
 * offline no cliente do cache, onde ela transformaria "sem cache" em "requisição
 * travada" — a troca que `enableOfflineQueue: false` existe para evitar.
 */
export function getRateLimitRedis(): Redis | null {
  if (!env.REDIS_ENABLED || !env.REDIS_URL) return null;
  if (rateLimitClient) return rateLimitClient;

  rateLimitClient = new Redis(env.REDIS_URL, {
    ...buildOptions(),
    lazyConnect: false,
    enableOfflineQueue: true,
    commandTimeout: 200,
  });
  rateLimitClient.on('error', (err) => logger.debug({ err: err.message }, 'redis do rate limit indisponível'));

  return rateLimitClient;
}

/** Estado para o health check. Não faz I/O — só lê o que o ioredis já sabe. */
export function redisStatus(): 'disabled' | 'ready' | 'down' {
  if (!env.REDIS_ENABLED) return 'disabled';
  return client?.status === 'ready' ? 'ready' : 'down';
}

export async function disconnectRedis(): Promise<void> {
  const clients = [client, rateLimitClient].filter((c): c is Redis => c !== null);
  client = null;
  rateLimitClient = null;
  await Promise.all(clients.map(async (c) => {
    try {
      await c.quit();
    } catch {
      c.disconnect();
    }
  }));
}
