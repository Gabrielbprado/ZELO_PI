import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createProvider } from './helpers';
import { env } from '../../src/config/env';
import { getRedis, disconnectRedis, redisStatus } from '../../src/config/redis';
import { cacheKeys, invalidatePrefix } from '../../src/services/cache.service';

/**
 * O comportamento sob teste é a DEGRADAÇÃO, não a aceleração.
 *
 * A suíte roda nos dois mundos: quando há um Redis alcançável (o do compose, no CI o
 * service container), verifica que o cache realmente guarda e invalida; quando não há,
 * verifica que a API responde igual. Nenhum dos dois cenários pode falhar — é isso que
 * torna o Redis uma dependência opcional de verdade, e não de fachada.
 */
const redisConfigured = env.REDIS_ENABLED && Boolean(env.REDIS_URL);

async function redisReachable(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}

describe('cache de leitura', () => {
  afterAll(async () => {
    await disconnectRedis();
  });

  it('a API responde normalmente independentemente do estado do Redis', async () => {
    const app = await getApp();
    await createProvider();

    const primeira = await request(app).get('/api/v1/providers');
    const segunda = await request(app).get('/api/v1/providers');

    expect(primeira.status).toBe(200);
    expect(segunda.status).toBe(200);
    expect(segunda.body.items).toEqual(primeira.body.items);
  });

  it('categorias respondem igual com e sem cache', async () => {
    const app = await getApp();
    await createProvider();

    const res = await request(app).get('/api/v1/providers/categories');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('/health/ready reporta o estado real das dependências sem derrubar a resposta', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/health/ready');

    // Postgres está no ar nos testes, então nunca é 503 — mesmo com Redis ou ML fora.
    expect(res.status).toBe(200);
    expect(res.body.checks.postgres.status).toBe('ok');
    expect(['ok', 'down', 'disabled']).toContain(res.body.checks.redis.status);
    // O ML aponta para um host inexistente na configuração de teste.
    expect(['disabled', 'ok', 'degraded']).toContain(res.body.checks.ml.status);
  });

  it('/health continua sem tocar em dependência (liveness)', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// Só faz sentido quando existe um Redis alcançável; sem ele o bloco é pulado em vez
// de falhar, para que `npm test` continue verde numa máquina sem Redis.
const descrebeSeRedis = redisConfigured ? describe : describe.skip;

descrebeSeRedis('cache com Redis alcançável', () => {
  let disponivel = false;

  beforeAll(async () => {
    disponivel = await redisReachable();
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it('guarda o detalhe do profissional e invalida quando ele muda', async () => {
    if (!disponivel) return;
    const app = await getApp();
    const { provider } = await createProvider();
    const redis = getRedis()!;

    await request(app).get(`/api/v1/providers/${provider.id}`).expect(200);
    expect(await redis.exists(cacheKeys.provider(provider.id))).toBe(1);

    // Uma escrita do prestador precisa derrubar a chave; senão o app serviria o
    // preço antigo até o TTL vencer.
    await prisma.providerProfile.update({ where: { id: provider.id }, data: { priceFrom: 999 } });
    const { invalidateProviderCaches } = await import('../../src/services/providers.service');
    await invalidateProviderCaches(provider.id);

    expect(await redis.exists(cacheKeys.provider(provider.id))).toBe(0);

    const depois = await request(app).get(`/api/v1/providers/${provider.id}`).expect(200);
    expect(depois.body.priceFrom).toBe(999);
  });

  it('não cacheia busca textual — cardinalidade ilimitada envenenaria o keyspace', async () => {
    if (!disponivel) return;
    const app = await getApp();
    await createProvider();
    const redis = getRedis()!;

    await invalidatePrefix(cacheKeys.providerListPrefix);
    await request(app).get('/api/v1/providers?q=encanador').expect(200);

    const [, chaves] = await redis.scan('0', 'MATCH', `${redis.options.keyPrefix}${cacheKeys.providerListPrefix}*`, 'COUNT', 100);
    expect(chaves).toHaveLength(0);
  });

  it('redisStatus reflete a conexão viva', async () => {
    if (!disponivel) return;
    expect(redisStatus()).toBe('ready');
  });
});
