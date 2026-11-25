import request from 'supertest';
import { getApp, createProvider } from './helpers';

describe('Providers', () => {
  it('lista categorias (rota pública)', async () => {
    const app = await getApp();
    await createProvider();
    const res = await request(app).get('/api/v1/providers/categories');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('lista profissionais com filtro de verificados', async () => {
    const app = await getApp();
    await createProvider();
    const res = await request(app).get('/api/v1/providers?verified=true');
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBe(1);
    expect(res.body.items[0].verified).toBe(true);
  });

  it('detalha um profissional pelo id', async () => {
    const app = await getApp();
    const { provider } = await createProvider();
    const res = await request(app).get(`/api/v1/providers/${provider.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(provider.id);
    expect(res.body.rating).toBe(4.8);
  });

  it('retorna 404 ao buscar profissional inexistente', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/providers/00000000-0000-0000-0000-000000000000');
    expect(res.status).toBe(404);
  });

  it('rejeita id inválido com 400', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/providers/abc');
    expect(res.status).toBe(400);
  });
});
