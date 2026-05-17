import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, STRONG_PASSWORD, createUser } from './helpers';

describe('Auth', () => {
  it('registra novo usuário com sucesso', async () => {
    const app = await getApp();
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Marina',
      email: 'marina@zero.test',
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe('marina@zero.test');
    expect(res.body.user.role).toBe('CLIENT');
    // jamais devolve hash de senha
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/i);
  });

  it('rejeita registro com senha fraca', async () => {
    const app = await getApp();
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Test',
      email: 't@zero.test',
      password: 'senha',
    });
    expect(res.status).toBe(400);
  });

  it('rejeita registro com e-mail duplicado', async () => {
    const app = await getApp();
    await createUser({ email: 'dup@zero.test' });
    const res = await request(app).post('/api/v1/auth/register').send({
      name: 'Dup',
      email: 'dup@zero.test',
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('login bem-sucedido retorna access + refresh', async () => {
    const app = await getApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'Login Ok',
      email: 'ok@zero.test',
      password: STRONG_PASSWORD,
    });
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'ok@zero.test',
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
  });

  it('login falha com senha errada', async () => {
    const app = await getApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'X', email: 'x@zero.test', password: STRONG_PASSWORD,
    });
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'x@zero.test',
      password: 'errada',
    });
    expect(res.status).toBe(401);
  });

  it('login com credencial inexistente não revela diferença vs. senha errada', async () => {
    const app = await getApp();
    const a = await request(app).post('/api/v1/auth/login').send({
      email: 'inexistente@zero.test', password: STRONG_PASSWORD,
    });
    expect(a.status).toBe(401);
    expect(a.body.error.message).not.toMatch(/inexistente|não encontrado/i);
  });

  it('bloqueia conta após 6 falhas seguidas', async () => {
    const app = await getApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'Lock', email: 'lock@zero.test', password: STRONG_PASSWORD,
    });
    for (let i = 0; i < 6; i++) {
      await request(app).post('/api/v1/auth/login').send({ email: 'lock@zero.test', password: 'wrong' });
    }
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'lock@zero.test',
      password: STRONG_PASSWORD,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toMatch(/bloqueada/i);
  });

  it('refresh rotaciona o token e invalida o antigo', async () => {
    const app = await getApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'R', email: 'r@zero.test', password: STRONG_PASSWORD,
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'r@zero.test', password: STRONG_PASSWORD });
    const firstRefresh = login.body.refreshToken;

    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: firstRefresh });
    expect(refresh.status).toBe(200);
    expect(refresh.body.refreshToken).not.toBe(firstRefresh);

    // Reuso do refresh antigo deve falhar
    const reuse = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: firstRefresh });
    expect(reuse.status).toBe(401);
  });

  it('reuso de refresh revogado invalida toda a árvore', async () => {
    const app = await getApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'Tree', email: 'tree@zero.test', password: STRONG_PASSWORD,
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'tree@zero.test', password: STRONG_PASSWORD });
    const t1 = login.body.refreshToken;
    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: t1 });
    const t2 = r1.body.refreshToken;

    // Reuso do t1 (já rotacionado): revoga toda a cadeia
    await request(app).post('/api/v1/auth/refresh').send({ refreshToken: t1 });

    // t2 também não funciona mais
    const r2 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: t2 });
    expect(r2.status).toBe(401);
  });

  it('GET /auth/me sem token retorna 401', async () => {
    const app = await getApp();
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('GET /auth/me com token válido retorna usuário', async () => {
    const app = await getApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'Me', email: 'me@zero.test', password: STRONG_PASSWORD,
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'me@zero.test', password: STRONG_PASSWORD });
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@zero.test');
  });

  it('logout revoga o refresh token', async () => {
    const app = await getApp();
    await request(app).post('/api/v1/auth/register').send({
      name: 'Out', email: 'out@zero.test', password: STRONG_PASSWORD,
    });
    const login = await request(app).post('/api/v1/auth/login').send({ email: 'out@zero.test', password: STRONG_PASSWORD });
    const logout = await request(app).post('/api/v1/auth/logout').send({ refreshToken: login.body.refreshToken });
    expect(logout.status).toBe(204);

    const refresh = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: login.body.refreshToken });
    expect(refresh.status).toBe(401);
  });

  it('rejeita token JWT adulterado', async () => {
    const app = await getApp();
    const fake = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1Iiwicm9sZSI6IkNMSUVOVCJ9.invalid';
    const res = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${fake}`);
    expect(res.status).toBe(401);
  });
});
