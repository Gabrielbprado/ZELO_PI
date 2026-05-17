import request from 'supertest';
import { authedAgent, createProvider, getApp, tokenFor, createUser } from './helpers';

describe('Bookings + RBAC', () => {
  it('exige autenticação para criar booking', async () => {
    const app = await getApp();
    const res = await request(app).post('/api/v1/bookings').send({});
    expect(res.status).toBe(401);
  });

  it('cliente cria booking com sucesso', async () => {
    const { provider, category } = await createProvider();
    const client = await authedAgent('CLIENT');
    const res = await client.post('/api/v1/bookings').send({
      providerId: provider.id,
      categoryId: category.id,
      title: 'Reparo de torneira',
      address: 'Rua A, 1',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('REQUESTED');
  });

  it('lista somente bookings do próprio cliente', async () => {
    const { provider, category } = await createProvider();
    const c1 = await authedAgent('CLIENT');
    const c2 = await authedAgent('CLIENT');
    await c1.post('/api/v1/bookings').send({ providerId: provider.id, categoryId: category.id, title: 'A', address: 'A' });
    await c2.post('/api/v1/bookings').send({ providerId: provider.id, categoryId: category.id, title: 'B', address: 'B' });
    const list = await c1.get('/api/v1/bookings/mine');
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].title).toBe('A');
  });

  it('cliente não consegue ACEITAR um booking (apenas prestador)', async () => {
    const { provider, category, user: providerUser } = await createProvider();
    const client = await authedAgent('CLIENT');
    const create = await client.post('/api/v1/bookings').send({
      providerId: provider.id, categoryId: category.id, title: 'X', address: 'X',
    });

    const app = await getApp();
    // O cliente tenta aceitar — proibido
    const forbidden = await client.patch(`/api/v1/bookings/${create.body.id}/status`).send({ status: 'ACCEPTED' });
    expect(forbidden.status).toBe(403);

    // O prestador aceita — permitido
    const ok = await request(app)
      .patch(`/api/v1/bookings/${create.body.id}/status`)
      .set('Authorization', `Bearer ${tokenFor({ id: providerUser.id, role: 'PROVIDER', email: providerUser.email })}`)
      .send({ status: 'ACCEPTED' });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('ACCEPTED');
  });

  it('terceiro (cliente diferente) recebe 403 ao acessar booking alheio', async () => {
    const { provider, category } = await createProvider();
    const c1 = await authedAgent('CLIENT');
    const c2 = await authedAgent('CLIENT');
    const create = await c1.post('/api/v1/bookings').send({
      providerId: provider.id, categoryId: category.id, title: 'X', address: 'X',
    });
    const res = await c2.get(`/api/v1/bookings/${create.body.id}`);
    expect(res.status).toBe(403);
  });

  it('valida payload de criação (categoria inexistente)', async () => {
    const { provider } = await createProvider();
    const client = await authedAgent('CLIENT');
    const res = await client.post('/api/v1/bookings').send({
      providerId: provider.id, categoryId: 'inexistente', title: 'X', address: 'X',
    });
    expect(res.status).toBe(404);
  });

  it('rejeita providerId não-UUID via Zod (400)', async () => {
    const client = await authedAgent('CLIENT');
    const res = await client.post('/api/v1/bookings').send({
      providerId: 'not-a-uuid', categoryId: 'plumb', title: 'X', address: 'X',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
