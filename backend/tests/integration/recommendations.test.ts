import { prisma } from '../../src/config/prisma';
import { authedAgent, createProvider, getApp } from './helpers';
import request from 'supertest';
import { resetCircuit } from '../../src/services/mlClient.service';

/**
 * A garantia mais importante coberta aqui: `/for-you` responde 200 com uma
 * lista utilizável mesmo sem serviço de ML nenhum. O ambiente de teste não
 * define `ML_SERVICE_URL`, então o caminho padrão de todos estes testes já É o
 * caminho degradado — que é exatamente como a maioria dos deploys vai começar.
 */

const fetchOriginal = global.fetch;

/** Estado padrão: serviço de ML fora do ar. Os testes que precisam dele o mockam. */
beforeEach(async () => {
  await resetCircuit();
  global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
});

afterEach(async () => {
  global.fetch = fetchOriginal;
  await resetCircuit();
});

describe('GET /recommendations/for-you', () => {
  it('exige autenticação', async () => {
    const app = await getApp();
    await request(app).get('/api/v1/recommendations/for-you').expect(401);
  });

  it('sem serviço de ML, degrada para ordenação por avaliação', async () => {
    await createProvider();
    const agent = await authedAgent('CLIENT');

    const res = await agent.get('/api/v1/recommendations/for-you?limit=5').expect(200);

    expect(res.body.strategy).toBe('fallback');
    expect(res.body.modelVersion).toBeNull();
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('no fallback não inventa motivos de personalização', async () => {
    await createProvider();
    const agent = await authedAgent('CLIENT');
    const res = await agent.get('/api/v1/recommendations/for-you').expect(200);
    for (const item of res.body.items) {
      expect(item.reasons).toEqual([]);
      expect(item.score).toBeNull();
    }
  });

  it('itens têm o mesmo shape de GET /providers', async () => {
    await createProvider();
    const agent = await authedAgent('CLIENT');

    const rec = await agent.get('/api/v1/recommendations/for-you?limit=3').expect(200);
    const lista = await request(await getApp())
      .get('/api/v1/providers?sort=rating&perPage=3')
      .expect(200);

    if (rec.body.items.length === 0) return;
    const camposLista = Object.keys(lista.body.items[0]).sort();
    const camposRec = Object.keys(rec.body.items[0]);
    // O app estende o tipo Provider em vez de bifurcá-lo.
    for (const campo of camposLista) expect(camposRec).toContain(campo);
  });

  it('rejeita limit acima do máximo', async () => {
    const agent = await authedAgent('CLIENT');
    await agent.get('/api/v1/recommendations/for-you?limit=99').expect(400);
  });

  it('aceita filtro por categoria', async () => {
    await createProvider({ category: 'plumb' });
    const agent = await authedAgent('CLIENT');
    await agent.get('/api/v1/recommendations/for-you?categoryId=plumb').expect(200);
  });

  it('usa a ordem devolvida pelo serviço de ML quando ele responde', async () => {
    const a = await createProvider({ category: 'plumb' });
    const b = await createProvider({ category: 'plumb' });
    const agent = await authedAgent('CLIENT');

    // Inverte a ordem natural para provar que a resposta segue o ML.
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        model_version: 'v-teste',
        strategy: 'ranker',
        latency_ms: 3,
        items: [
          { provider_id: b.provider.id, score: 0.91, rank: 1, reasons: [{ code: 'NEARBY', value: 1.4 }] },
          { provider_id: a.provider.id, score: 0.42, rank: 2, reasons: [{ code: 'VERIFIED', value: null }] },
        ],
      }),
    }) as unknown as typeof fetch;

    const res = await agent.get('/api/v1/recommendations/for-you?limit=5').expect(200);

    expect(res.body.strategy).toBe('ranker');
    expect(res.body.modelVersion).toBe('v-teste');
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([b.provider.id, a.provider.id]);
    // Código vira texto em pt-BR na fronteira do Node.
    expect(res.body.items[0].reasons[0].label).toBe('a 1,4 km');
    expect(res.body.items[1].reasons[0].label).toBe('Identidade verificada');
  });

  it('serviço de ML fora do ar não quebra o endpoint', async () => {
    await createProvider();
    const agent = await authedAgent('CLIENT');

    // `beforeEach` já deixou o fetch rejeitando: o serviço está fora.
    const res = await agent.get('/api/v1/recommendations/for-you').expect(200);
    expect(res.body.strategy).toBe('fallback');
  });
});

describe('POST /recommendations/events', () => {
  it('exige autenticação', async () => {
    const app = await getApp();
    await request(app)
      .post('/api/v1/recommendations/events')
      .send({ requestId: '11111111-1111-1111-1111-111111111111', events: [] })
      .expect(401);
  });

  it('persiste impressões e cliques e responde 202', async () => {
    const { provider } = await createProvider();
    const agent = await authedAgent('CLIENT');
    const requestId = '11111111-1111-1111-1111-111111111111';

    await agent
      .post('/api/v1/recommendations/events')
      .send({
        requestId,
        events: [
          { providerId: provider.id, type: 'IMPRESSION', position: 0, score: 0.8, modelVersion: 'v1', strategy: 'ranker' },
          { providerId: provider.id, type: 'CLICK', position: 0, score: 0.8, modelVersion: 'v1', strategy: 'ranker' },
        ],
      })
      .expect(202);

    const eventos = await prisma.recEvent.findMany({ where: { requestId } });
    expect(eventos).toHaveLength(2);
    expect(eventos.map((e) => e.type).sort()).toEqual(['CLICK', 'IMPRESSION']);
    expect(eventos[0].userId).toBe(agent.user.id);
  });

  it('rejeita BOOKED vindo do cliente', async () => {
    // Conversão é emitida pelo servidor; aceitar do cliente permitiria
    // envenenar os dados de treino.
    const { provider } = await createProvider();
    const agent = await authedAgent('CLIENT');
    await agent
      .post('/api/v1/recommendations/events')
      .send({
        requestId: '11111111-1111-1111-1111-111111111111',
        events: [{ providerId: provider.id, type: 'BOOKED', position: 0 }],
      })
      .expect(400);
  });

  it('rejeita lote acima do limite', async () => {
    const { provider } = await createProvider();
    const agent = await authedAgent('CLIENT');
    await agent
      .post('/api/v1/recommendations/events')
      .send({
        requestId: '11111111-1111-1111-1111-111111111111',
        events: Array.from({ length: 21 }, (_, i) => ({
          providerId: provider.id,
          type: 'IMPRESSION',
          position: i,
        })),
      })
      .expect(400);
  });

  it('ignora silenciosamente profissional inexistente', async () => {
    const agent = await authedAgent('CLIENT');
    const requestId = '22222222-2222-2222-2222-222222222222';
    await agent
      .post('/api/v1/recommendations/events')
      .send({
        requestId,
        events: [
          { providerId: '33333333-3333-3333-3333-333333333333', type: 'IMPRESSION', position: 0 },
        ],
      })
      .expect(202);

    // Sem violação de FK derrubando a requisição.
    expect(await prisma.recEvent.count({ where: { requestId } })).toBe(0);
  });
});
