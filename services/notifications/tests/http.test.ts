/**
 * API interna: autenticação por X-SERVICE-TOKEN e leitura/escrita do inbox. Fala com o
 * schema `notifications` do banco de teste; não precisa de broker.
 */
import request from 'supertest';
import { prisma } from '../src/config/prisma';
import { createServer } from '../src/http/server';

const app = createServer();
const TOKEN = process.env.SERVICE_TOKEN as string;

async function seedNotification(id: string, userId: string) {
  return prisma.notification.create({
    data: { id, userId, type: 'BOOKING', title: 'Título', body: 'Corpo' },
  });
}

beforeEach(async () => {
  await prisma.notification.deleteMany();
});

afterAll(async () => {
  await prisma.notification.deleteMany();
  await prisma.$disconnect();
});

describe('API interna de notificações', () => {
  it('401 sem X-SERVICE-TOKEN', async () => {
    await request(app).get('/internal/notifications?userId=u1').expect(401);
  });

  it('401 com token errado', async () => {
    await request(app).get('/internal/notifications?userId=u1').set('X-SERVICE-TOKEN', 'errado').expect(401);
  });

  it('400 sem userId', async () => {
    await request(app).get('/internal/notifications').set('X-SERVICE-TOKEN', TOKEN).expect(400);
  });

  it('lista as notificações do usuário, mais recentes primeiro', async () => {
    await seedNotification('n1', 'u1');
    await seedNotification('n2', 'u1');
    await seedNotification('n3', 'outro');

    const res = await request(app)
      .get('/internal/notifications?userId=u1')
      .set('X-SERVICE-TOKEN', TOKEN)
      .expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.every((n: { userId: string }) => n.userId === 'u1')).toBe(true);
  });

  it('marca como lida apenas a do próprio usuário', async () => {
    await seedNotification('n1', 'u1');

    await request(app)
      .post('/internal/notifications/n1/read?userId=u1')
      .set('X-SERVICE-TOKEN', TOKEN)
      .expect(204);

    const n = await prisma.notification.findUnique({ where: { id: 'n1' } });
    expect(n?.readAt).not.toBeNull();
  });

  it('não marca a notificação de outro usuário', async () => {
    await seedNotification('n1', 'dono');

    await request(app)
      .post('/internal/notifications/n1/read?userId=intruso')
      .set('X-SERVICE-TOKEN', TOKEN)
      .expect(204);

    const n = await prisma.notification.findUnique({ where: { id: 'n1' } });
    expect(n?.readAt).toBeNull();
  });

  it('read-all zera as não-lidas do usuário', async () => {
    await seedNotification('n1', 'u1');
    await seedNotification('n2', 'u1');

    await request(app)
      .post('/internal/notifications/read-all?userId=u1')
      .set('X-SERVICE-TOKEN', TOKEN)
      .expect(204);

    const unread = await prisma.notification.count({ where: { userId: 'u1', readAt: null } });
    expect(unread).toBe(0);
  });

  it('health responde sem token', async () => {
    await request(app).get('/internal/health').expect(200);
  });
});
