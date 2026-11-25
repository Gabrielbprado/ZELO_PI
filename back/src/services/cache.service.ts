import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Cache-aside sobre o Redis, com a mesma disciplina que `mlClient.service.ts` já
 * estabeleceu para o serviço de ML: **nunca lança**.
 *
 * Toda função aqui trata o Redis como best-effort. Falha de rede, timeout, cliente
 * desligado ou payload corrompido resultam em ir ao banco — nunca em erro para o
 * usuário. O cache é uma otimização; perdê-lo deixa o sistema lento, não quebrado.
 */

interface CacheStats {
  hits: number;
  misses: number;
  errors: number;
}

const stats: CacheStats = { hits: 0, misses: 0, errors: 0 };

/** Lido pelo endpoint de métricas. */
export function cacheStats(): Readonly<CacheStats> {
  return { ...stats };
}

export function resetCacheStats(): void {
  stats.hits = 0;
  stats.misses = 0;
  stats.errors = 0;
}

async function readCache<T>(key: string): Promise<T | undefined> {
  const redis = getRedis();
  if (!redis) return undefined;
  try {
    const raw = await redis.get(key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as T;
  } catch (err) {
    // Inclui JSON corrompido de propósito: um valor ilegível é indistinguível de
    // um miss para quem chama, e insistir nele só propagaria o problema.
    stats.errors++;
    logger.debug({ err, key }, 'falha ao ler do cache; seguindo para a origem');
    return undefined;
  }
}

async function writeCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    stats.errors++;
    logger.debug({ err, key }, 'falha ao gravar no cache');
  }
}

/**
 * Devolve o valor cacheado ou executa `loader` e guarda o resultado.
 *
 * `undefined` nunca é cacheado — seria indistinguível de um miss na leitura, e o
 * chamador acabaria repetindo a consulta a cada acesso achando que tem cache.
 */
export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
): Promise<T> {
  const cached = await readCache<T>(key);
  if (cached !== undefined) {
    stats.hits++;
    return cached;
  }

  stats.misses++;
  const fresh = await loader();
  if (fresh !== undefined) await writeCache(key, fresh, ttlSeconds);
  return fresh;
}

/** Invalida chaves específicas. Silencioso quando o Redis está fora. */
export async function invalidate(...keys: string[]): Promise<void> {
  const redis = getRedis();
  if (!redis || keys.length === 0) return;
  try {
    await redis.del(...keys);
  } catch (err) {
    stats.errors++;
    logger.debug({ err, keys }, 'falha ao invalidar cache');
  }
}

/**
 * Invalida tudo sob um prefixo.
 *
 * Usa SCAN, e não KEYS: `KEYS` percorre o keyspace inteiro bloqueando o servidor, o que
 * numa instância compartilhada afeta todo mundo. `UNLINK` libera a memória em background
 * em vez de bloquear no delete.
 *
 * O `keyPrefix` do ioredis é aplicado automaticamente nos comandos, mas NÃO nos padrões
 * do SCAN nem nas chaves que ele devolve — por isso ele é adicionado e removido à mão
 * aqui. Sem isso, o SCAN não acha nada e a invalidação falha em silêncio.
 */
export async function invalidatePrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const fullPrefix = `${redis.options.keyPrefix ?? ''}${prefix}`;
  try {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', `${fullPrefix}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        const unprefixed = keys.map((k) => k.slice(redis.options.keyPrefix?.length ?? 0));
        await redis.unlink(...unprefixed);
      }
    } while (cursor !== '0');
  } catch (err) {
    stats.errors++;
    logger.debug({ err, prefix }, 'falha ao invalidar prefixo do cache');
  }
}

/** Chaves em um lugar só, para que invalidação e leitura não saiam de sincronia. */
export const cacheKeys = {
  categories: 'cat:all',
  provider: (id: string) => `prov:detail:${id}`,
  providerList: (fingerprint: string) => `prov:list:${fingerprint}`,
  providerListPrefix: 'prov:list:',
  reviews: (providerId: string) => `reviews:${providerId}`,
} as const;
