import rateLimit, { MemoryStore, type Store, type Options, type IncrementResponse } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env';
import { getRateLimitRedis } from '../config/redis';
import { ErrorCode } from '../constants/http';
import { ONE_MINUTE_MS } from '../constants/time';
import { logger } from '../utils/logger';

const AUTH_WINDOW_MS = 15 * ONE_MINUTE_MS;

class RedisWithMemoryFallbackStore implements Store {
  private redisStore?: RedisStore;
  private readonly memoryStore = new MemoryStore();
  private options?: Options;

  constructor(private readonly keyPrefix: string) {}

  init(options: Options): void {
    this.options = options;
    this.memoryStore.init(options);
  }

  private resolve(): Store {
    const redis = getRateLimitRedis();
    if (!redis || redis.status !== 'ready') return this.memoryStore;

    if (!this.redisStore) {
      this.redisStore = new RedisStore({
        prefix: `rl:${this.keyPrefix}:`,
        sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
      });
      if (this.options) this.redisStore.init(this.options);

      void this.redisStore.incrementScriptSha.catch(() => undefined);
      void this.redisStore.getScriptSha.catch(() => undefined);

      logger.debug({ prefix: this.keyPrefix }, 'rate limit passou a usar o store no redis');
    }
    return this.redisStore;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const store = this.resolve();
    try {
      return await store.increment(key);
    } catch (err) {
      if (store === this.memoryStore) throw err;
      logger.debug({ err, prefix: this.keyPrefix }, 'rate limit caiu para o store em memória');
      return this.memoryStore.increment(key);
    }
  }

  async decrement(key: string): Promise<void> {
    try {
      await this.resolve().decrement(key);
    } catch {
      await this.memoryStore.decrement(key);
    }
  }

  async resetKey(key: string): Promise<void> {
    try {
      await this.resolve().resetKey(key);
    } catch {
      await this.memoryStore.resetKey(key);
    }
  }
}

export function buildStore(prefix: string): Store | undefined {
  if (!env.REDIS_ENABLED || !env.REDIS_URL) {
    logger.warn({ prefix }, 'Rate limiter usando store em memória (Redis desabilitado) — não funciona em múltiplas instâncias');
    return undefined;
  }
  return new RedisWithMemoryFallbackStore(prefix);
}

const FAIL_OPEN = { passOnStoreError: true } as const;

export const generalLimiter = rateLimit({
  ...FAIL_OPEN,
  store: buildStore('general'),
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  skip: (req) => req.path === '/api/v1/payments/webhook/asaas',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitas requisições. Tente novamente mais tarde.',
    },
  },
});

export const webhookLimiter = rateLimit({
  ...FAIL_OPEN,
  store: buildStore('webhook'),
  windowMs: ONE_MINUTE_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitos callbacks de pagamento. Tente novamente mais tarde.',
    },
  },
});

export const telemetryLimiter = rateLimit({
  ...FAIL_OPEN,
  store: buildStore('telemetry'),
  windowMs: AUTH_WINDOW_MS,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitos eventos de telemetria.',
    },
  },
});

export const authLimiter = rateLimit({
  ...FAIL_OPEN,
  store: buildStore('auth'),
  windowMs: AUTH_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitas tentativas de autenticação. Aguarde alguns minutos.',
    },
  },
});