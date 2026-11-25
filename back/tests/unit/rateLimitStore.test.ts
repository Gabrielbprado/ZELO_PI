/**
 * O risco que estes testes cobrem é de SEGURANÇA, não de performance.
 *
 * Ao mover o rate limit para o Redis, o modo de falha ingênuo é "Redis fora ⇒ store
 * quebrado ⇒ requisição liberada" — o que desligaria a proteção contra força bruta do
 * `authLimiter` exatamente durante um incidente. O comportamento correto é cair para
 * contagem em memória, que é o que o projeto tinha antes do Redis.
 */
const redisClient = {
  status: 'ready' as string,
  call: jest.fn(),
};

let redisConfigured = true;

jest.mock('../../src/config/redis', () => ({
  getRateLimitRedis: () => (redisConfigured ? redisClient : null),
}));

jest.mock('../../src/config/env', () => ({
  env: {
    REDIS_ENABLED: true,
    REDIS_URL: 'redis://localhost:6379',
    RATE_LIMIT_WINDOW_MS: 900_000,
    RATE_LIMIT_MAX: 200,
    AUTH_RATE_LIMIT_MAX: 10,
  },
}));

import type { Options, Store } from 'express-rate-limit';
import { buildStore } from '../../src/middleware/rateLimit';

const OPTIONS = { windowMs: 900_000 } as unknown as Options;

function novoStore(): Store {
  const store = buildStore('auth');
  if (!store) throw new Error('store não construído — o mock de env deveria ligar o Redis');
  store.init?.(OPTIONS);
  return store;
}

beforeEach(() => {
  jest.clearAllMocks();
  redisConfigured = true;
  redisClient.status = 'ready';
});

describe('store de rate limit', () => {
  it('conta em memória quando a conexão não está pronta, em vez de liberar', async () => {
    const store = novoStore();
    redisClient.status = 'connecting';

    // `MemoryStore.increment` devolve o próprio objeto do cliente, por referência —
    // ler `.totalHits` depois da segunda chamada mostraria o mesmo valor nas duas.
    const primeira = (await store.increment('1.2.3.4')).totalHits;
    const segunda = (await store.increment('1.2.3.4')).totalHits;

    // Contando de verdade: se estivesse liberando, o contador não subiria.
    expect(primeira).toBe(1);
    expect(segunda).toBe(2);
    expect(redisClient.call).not.toHaveBeenCalled();
  });

  it('não deixa o contador zerado quando o Redis cai no meio do comando', async () => {
    const store = novoStore();
    redisClient.status = 'ready';
    redisClient.call.mockRejectedValue(new Error('ECONNRESET'));

    const resultado = await store.increment('9.9.9.9');

    expect(resultado.totalHits).toBeGreaterThanOrEqual(1);
  });

  it('usa o Redis quando a conexão está pronta', async () => {
    const store = novoStore();
    redisClient.status = 'ready';
    // SCRIPT LOAD devolve um sha; EVALSHA devolve [hits, resetMs].
    redisClient.call.mockImplementation((cmd: string) =>
      cmd === 'SCRIPT' ? Promise.resolve('sha123') : Promise.resolve([7, 60_000]),
    );

    const resultado = await store.increment('5.5.5.5');

    expect(redisClient.call).toHaveBeenCalled();
    expect(resultado.totalHits).toBe(7);
  });
});
