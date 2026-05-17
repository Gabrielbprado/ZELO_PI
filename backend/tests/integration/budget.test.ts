import request from 'supertest';
import { getApp } from './helpers';

describe('Budget estimate', () => {
  it('estima sem autenticação', async () => {
    const app = await getApp();
    const res = await request(app).post('/api/v1/budget/estimate').send({
      categoryId: 'plumb',
      answers: { service: 'leak', urgency: 'flex' },
    });
    expect(res.status).toBe(200);
    expect(res.body.estimateMin).toBeGreaterThan(0);
    expect(res.body.estimateMax).toBeGreaterThan(res.body.estimateMin);
    expect(res.body.breakdown).toHaveLength(3);
  });

  it('rejeita payload sem answers', async () => {
    const app = await getApp();
    const res = await request(app).post('/api/v1/budget/estimate').send({ categoryId: 'plumb' });
    expect(res.status).toBe(400);
  });
});
