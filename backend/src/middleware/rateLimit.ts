import rateLimit, { MemoryStore, type Store, type Options, type IncrementResponse } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { env } from '../config/env';
import { getRateLimitRedis } from '../config/redis';
import { ErrorCode } from '../constants/http';
import { ONE_MINUTE_MS } from '../constants/time';
import { logger } from '../utils/logger';

const AUTH_WINDOW_MS = 15 * ONE_MINUTE_MS;

/**
 * Store de rate limit com Redis quando disponível e memória quando não.
 *
 * Três propriedades precisam valer ao mesmo tempo, e ingenuamente elas se atropelam:
 *
 * 1. **Com o Redis fora, a API não pode ficar mais lenta.** Sem cuidado, cada
 *    requisição espera o `commandTimeout` inteiro antes de ser liberada — medido em
 *    ~500ms por requisição, degradação pior do que nunca ter tido Redis.
 * 2. **Com o Redis fora, a API precisa SUBIR.** O `RedisStore` do `rate-limit-redis`
 *    dispara `SCRIPT LOAD` dentro do próprio construtor, que roda no import do módulo,
 *    e guarda a promessa sem ninguém aguardá-la. Se esse comando rejeitar de imediato,
 *    o Node encerra o processo por unhandled rejection — a API entra em loop de restart
 *    por causa de uma dependência que deveria ser opcional.
 * 3. **Com o Redis fora, o limite não pode simplesmente sumir.** Deixar passar tudo
 *    desligaria a proteção contra força bruta do `authLimiter` justamente durante um
 *    incidente. Cair para contagem em memória devolve exatamente o comportamento que o
 *    projeto tinha antes do Redis: menos preciso entre instâncias, mas presente.
 *
 * Daí a construção tardia e o fallback explícito: o `RedisStore` real só nasce no
 * primeiro `increment`, quando já há requisição em voo (e o `retryableIncrement` do
 * pacote envolve tudo em try/catch); enquanto ele não existe, quem conta é a memória.
 */
class RedisWithMemoryFallbackStore implements Store {
  private redisStore?: RedisStore;
  private readonly memoryStore = new MemoryStore();
  private options?: Options;

  constructor(private readonly keyPrefix: string) {}

  init(options: Options): void {
    this.options = options;
    this.memoryStore.init(options);
  }

  /** Devolve o store do Redis se a conexão estiver de pé; senão, o de memória. */
  private resolve(): Store {
    const redis = getRateLimitRedis();
    if (!redis || redis.status !== 'ready') return this.memoryStore;

    if (!this.redisStore) {
      this.redisStore = new RedisStore({
        prefix: `rl:${this.keyPrefix}:`,
        sendCommand: (...args: string[]) => redis.call(...(args as [string, ...string[]])) as Promise<never>,
      });
      if (this.options) this.redisStore.init(this.options);

      // `rate-limit-redis` dispara `SCRIPT LOAD` no construtor e guarda as promessas
      // em campos públicos sem aguardá-las. Se o Redis cair entre a checagem de status
      // acima e o comando, essas rejeições sobem como unhandled e derrubam o processo.
      // O catch vazio não altera o fluxo — o pacote recarrega o script sozinho no
      // primeiro erro de EVALSHA — apenas impede o crash.
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
      // Redis caiu no meio do comando: conta em memória em vez de liberar.
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

/**
 * Exportada para teste: o `express-rate-limit` não expõe o store no middleware que
 * devolve, e o comportamento de fallback é justamente o que precisa de cobertura.
 */
export function buildStore(prefix: string): Store | undefined {
  // Sem Redis configurado, o padrão do express-rate-limit (MemoryStore) já basta —
  // não há motivo para embrulhar.
  if (!env.REDIS_ENABLED || !env.REDIS_URL) return undefined;
  return new RedisWithMemoryFallbackStore(prefix);
}

/**
 * Rede de segurança final: se nem o fallback em memória responder, a requisição passa.
 * Um contador indisponível não justifica derrubar a API.
 */
const FAIL_OPEN = { passOnStoreError: true } as const;

export const generalLimiter = rateLimit({
  ...FAIL_OPEN,
  store: buildStore('general'),
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitas requisições. Tente novamente mais tarde.',
    },
  },
});

/**
 * Limite próprio para a telemetria de recomendação.
 *
 * Impressões são tagarelas: um usuário rolando a Home gera várias por sessão.
 * Sem um limite dedicado, esses eventos consumiriam o orçamento do
 * `generalLimiter` (200/15min) e o app passaria a receber 429 em requisições
 * que realmente importam.
 */
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
