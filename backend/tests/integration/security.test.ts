import request from 'supertest';
import { getApp } from './helpers';

describe('headers de segurança e CORS', () => {
  it('inclui headers do Helmet (X-Content-Type-Options, X-Frame-Options)', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
  });

  it('não vaza X-Powered-By', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('libera origem do CORS_ORIGINS', async () => {
    const app = await getApp();
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://localhost:8081');
    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  it('bloqueia origens fora da allowlist', async () => {
    const app = await getApp();
    const res = await request(app)
      .get('/api/v1/health')
      .set('Origin', 'http://malicioso.example');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('payload acima do limite retorna 413', async () => {
    const app = await getApp();
    const big = 'x'.repeat(2 * 1024 * 1024);
    const res = await request(app)
      .post('/api/v1/auth/register')
      .set('Content-Type', 'application/json')
      .send(`{"a":"${big}"}`);
    expect([400, 413]).toContain(res.status);
  });

  it('rota inexistente retorna 404 com formato padrão', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/inexistente');
    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('NOT_FOUND');
  });
});
