import request from 'supertest';
import { getApp } from './helpers';

describe('GET /api/v1/health', () => {
  it('responde 200 com status ok', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
