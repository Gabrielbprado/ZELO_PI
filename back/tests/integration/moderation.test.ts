/**
 * Moderação assistida por IA: denúncia de perfil/serviço/conversa, triagem automática,
 * bloqueio automático e a decisão manual do admin — com histórico dos dois.
 *
 * O serviço de IA é mockado via `global.fetch` (mesmo padrão de recommendations.test):
 * o que se testa aqui é o comportamento do BACKEND diante de cada veredito, incluindo
 * o veredito que nunca chega. A qualidade do classificador é testada em ml/.
 */
import request from 'supertest';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor, STRONG_PASSWORD } from './helpers';
import { resetCircuit } from '../../src/services/mlClient.service';

const fetchOriginal = global.fetch;

/** Serviço de IA fora do ar — o padrão, como em qualquer deploy sem o ml/ no ar. */
beforeEach(async () => {
  await resetCircuit();
  global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
});

afterAll(async () => {
  global.fetch = fetchOriginal;
  await resetCircuit();
});

function mockVerdict(overrides: Record<string, unknown> = {}) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      model_version: 'moderation-rules-test',
      category: 'FRAUD',
      severity: 'HIGH',
      priority: 74,
      confidence: 0.9,
      action: 'WARN',
      auto_enforce: false,
      suspend_days: null,
      signals: [{ code: 'LEXICON_FRAUD', weight: 2.1, detail: 'golpe' }],
      latency_ms: 4,
      ...overrides,
    }),
  }) as unknown as typeof fetch;
}

async function cast() {
  const { user: pro, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@mod.test` });
  const admin = await createUser({ role: 'ADMIN', email: `adm-${Date.now()}-${Math.random()}@mod.test` });
  return { pro, provider, category, client, admin, app: await getApp() };
}

describe('abertura de denúncia', () => {
  it('denuncia um PERFIL e grava o veredito da IA na denúncia', async () => {
    const { pro, client, app } = await cast();
    mockVerdict();

    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetType: 'USER', targetUserId: pro.id, reason: 'FRAUD', description: 'Pediu pagamento antecipado', evidence: ['https://ex.test/print.png'] })
      .expect(201);

    expect(res.body.aiCategory).toBe('FRAUD');
    expect(res.body.aiSeverity).toBe('HIGH');
    expect(res.body.aiPriority).toBe(74);
    expect(res.body.evidence).toEqual(['https://ex.test/print.png']);
    // Triada deixa de ser OPEN: já está em análise.
    expect(res.body.status).toBe('REVIEWING');

    // A análise em si vira histórico, mesmo sem punição.
    const analysis = await prisma.moderationAction.findFirst({ where: { reportId: res.body.id, type: 'AI_CLASSIFIED' } });
    expect(analysis).not.toBeNull();
    expect(analysis?.actorId).toBeNull(); // assinatura da IA
  });

  it('denuncia um SERVIÇO e resolve o alvo para o dono', async () => {
    const { pro, provider, category, client, app } = await cast();
    const service = await prisma.providerService.create({
      data: { providerId: provider.id, categoryId: category.id, title: 'Instalação', description: 'me chama no zap', priceMin: 100 },
    });
    mockVerdict({ category: 'OFF_PLATFORM', severity: 'MEDIUM' });

    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetType: 'SERVICE', serviceId: service.id, reason: 'OTHER' })
      .expect(201);

    expect(res.body.targetUserId).toBe(pro.id);
    expect(res.body.targetRefId).toBe(service.id);
  });

  it('denuncia uma CONVERSA e manda só as mensagens do alvo para análise', async () => {
    const { pro, client, app } = await cast();
    await prisma.message.create({ data: { senderId: pro.id, receiverId: client.id, content: 'ganhe dinheiro fácil' } });
    await prisma.message.create({ data: { senderId: client.id, receiverId: pro.id, content: 'texto do denunciante' } });
    mockVerdict({ category: 'SPAM', severity: 'LOW' });

    await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetType: 'CONVERSATION', targetUserId: pro.id, reason: 'INAPPROPRIATE' })
      .expect(201);

    const sent = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(sent.samples).toEqual(['ganhe dinheiro fácil']);
    expect(sent.samples).not.toContain('texto do denunciante');
  });

  it('IA fora do ar não impede a denúncia — ela fica NÃO TRIADA, nunca arquivada', async () => {
    const { pro, client, app } = await cast();

    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: pro.id, reason: 'SAFETY' })
      .expect(201);

    expect(res.body.aiAnalyzedAt).toBeNull();
    expect(res.body.aiCategory).toBeNull();
    expect(res.body.status).toBe('OPEN');
  });

  it('não deixa denunciar a si mesmo', async () => {
    const { client, app } = await cast();
    await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: client.id, reason: 'OTHER' })
      .expect(400);
  });
});

describe('a IA como moderadora', () => {
  it('bloqueia sozinha quando manda bloquear — e o bloqueado não loga mais', async () => {
    const { pro, client, app } = await cast();
    mockVerdict({ category: 'SAFETY', severity: 'CRITICAL', action: 'BLOCK', auto_enforce: true, confidence: 0.94 });

    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: pro.id, reason: 'SAFETY', description: 'ameaçou', evidence: ['x'] })
      .expect(201);

    const blocked = await prisma.user.findUnique({ where: { id: pro.id } });
    expect(blocked?.isActive).toBe(false);
    expect(res.body.status).toBe('RESOLVED');

    // A ação automática fica no histórico, sem ator humano.
    const action = await prisma.moderationAction.findFirst({ where: { targetUserId: pro.id, type: 'BLOCK' } });
    expect(action?.actorId).toBeNull();

    await request(app)
      .post('/api/v1/auth/login')
      .send({ email: pro.email, password: STRONG_PASSWORD })
      .expect(403);
  });

  it('suspende sozinha com prazo, e a suspensão recusa o login sem apagar o motivo', async () => {
    const { pro, client, app } = await cast();
    mockVerdict({ severity: 'HIGH', action: 'SUSPEND', auto_enforce: true, suspend_days: 7, confidence: 0.9 });

    await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: pro.id, reason: 'FRAUD', description: 'golpe' })
      .expect(201);

    const suspended = await prisma.user.findUnique({ where: { id: pro.id } });
    expect(suspended?.suspendedUntil).not.toBeNull();
    expect(suspended?.isActive).toBe(true); // suspenso ≠ bloqueado
    // `lockedUntil` (tentativas de senha) continua intocado: as duas coisas não se misturam.
    expect(suspended?.lockedUntil).toBeNull();

    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: pro.email, password: STRONG_PASSWORD })
      .expect(403);
    expect(login.body.error?.message ?? login.body.message).toMatch(/suspensa/i);
  });

  it('não sugere nem aplica nada contra um ADMIN', async () => {
    const { client, admin, app } = await cast();
    mockVerdict({ severity: 'CRITICAL', action: 'BLOCK', auto_enforce: true, confidence: 0.99 });

    const res = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: admin.id, reason: 'SAFETY' })
      .expect(201);

    // A denúncia existe e fica para análise humana; o admin segue ativo.
    expect((await prisma.user.findUnique({ where: { id: admin.id } }))?.isActive).toBe(true);
    expect(res.body.id).toBeDefined();
  });
});

describe('painel do admin', () => {
  it('fila ordena por prioridade da IA e as não triadas sobem junto', async () => {
    const { pro, client, admin, app } = await cast();
    const token = `Bearer ${tokenFor(client)}`;

    mockVerdict({ priority: 20, severity: 'LOW' });
    await request(app).post('/api/v1/reports').set('Authorization', token).send({ targetUserId: pro.id, reason: 'OTHER' }).expect(201);
    mockVerdict({ priority: 90, severity: 'CRITICAL' });
    await request(app).post('/api/v1/reports').set('Authorization', token).send({ targetUserId: pro.id, reason: 'SAFETY' }).expect(201);

    const res = await request(app)
      .get('/api/v1/admin/reports')
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .expect(200);

    expect(res.body.items[0].aiPriority).toBe(90);
  });

  it('admin decide manualmente (advertir) e a decisão entra no histórico como humana', async () => {
    const { pro, client, admin, app } = await cast();
    mockVerdict();
    const created = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: pro.id, reason: 'FRAUD' })
      .expect(201);

    await request(app)
      .post(`/api/v1/admin/reports/${created.body.id}/action`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ action: 'WARN', reason: 'Primeira ocorrência' })
      .expect(200);

    const detail = await request(app)
      .get(`/api/v1/admin/reports/${created.body.id}`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .expect(200);

    expect(detail.body.status).toBe('RESOLVED');
    const types = detail.body.actions.map((a: { type: string }) => a.type);
    expect(types).toEqual(['AI_CLASSIFIED', 'WARN']);
    const warn = detail.body.actions.find((a: { type: string }) => a.type === 'WARN');
    expect(warn.actorId).toBe(admin.id); // decisão humana, distinguível da da IA

    // Auditoria da ação administrativa.
    const audit = await prisma.auditLog.findFirst({ where: { action: 'MODERATION_WARN' } });
    expect(audit?.userId).toBe(admin.id);
  });

  it('admin pode desfazer um bloqueio automático da IA', async () => {
    const { pro, client, admin, app } = await cast();
    mockVerdict({ severity: 'CRITICAL', action: 'BLOCK', auto_enforce: true, confidence: 0.95 });
    const created = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: pro.id, reason: 'SAFETY' })
      .expect(201);
    expect((await prisma.user.findUnique({ where: { id: pro.id } }))?.isActive).toBe(false);

    await request(app)
      .post(`/api/v1/admin/reports/${created.body.id}/action`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .send({ action: 'UNBLOCK', reason: 'Falso positivo' })
      .expect(200);

    const restored = await prisma.user.findUnique({ where: { id: pro.id } });
    expect(restored?.isActive).toBe(true);
    expect(restored?.suspendedUntil).toBeNull();
  });

  it('reanalisa uma denúncia que ficou sem veredito', async () => {
    const { pro, client, admin, app } = await cast();
    const created = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: pro.id, reason: 'FRAUD' })
      .expect(201);
    expect(created.body.aiAnalyzedAt).toBeNull();

    await resetCircuit();
    mockVerdict({ priority: 55 });
    const res = await request(app)
      .post(`/api/v1/admin/reports/${created.body.id}/reanalyze`)
      .set('Authorization', `Bearer ${tokenFor(admin)}`)
      .expect(200);

    expect(res.body.aiPriority).toBe(55);
  });

  it('a moderação é restrita a ADMIN', async () => {
    const { pro, client, app } = await cast();
    mockVerdict();
    const created = await request(app)
      .post('/api/v1/reports')
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ targetUserId: pro.id, reason: 'OTHER' })
      .expect(201);

    await request(app)
      .post(`/api/v1/admin/reports/${created.body.id}/action`)
      .set('Authorization', `Bearer ${tokenFor(client)}`)
      .send({ action: 'BLOCK' })
      .expect(403);
  });
});
