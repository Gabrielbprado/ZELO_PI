import request from 'supertest';
import { getApp, createUser, tokenFor } from './helpers';

describe('GET /messages — lista de conversas', () => {
  it('devolve as conversas do usuário com prévia e não-lidas', async () => {
    const app = await getApp();
    const marina = await createUser({ email: `marina-${Date.now()}@conv.test`, name: 'Marina' });
    const carlos = await createUser({ email: `carlos-${Date.now()}@conv.test`, name: 'Carlos' });

    await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(marina)}`)
      .send({ receiverId: carlos.id, content: 'Bom dia' })
      .expect(201);

    await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(carlos)}`)
      .send({ receiverId: marina.id, content: 'Bom dia, posso ir hoje' })
      .expect(201);

    const res = await request(app)
      .get('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(marina)}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);

    const [conversa] = res.body.items;
    expect(conversa.user.id).toBe(carlos.id);
    expect(conversa.user.name).toBe('Carlos');
    expect(conversa.lastContent).toBe('Bom dia, posso ir hoje');
    // Só a mensagem recebida e ainda não lida conta.
    expect(conversa.unread).toBe(1);
  });

  it('agrupa por interlocutor, e não por mensagem', async () => {
    const app = await getApp();
    const cliente = await createUser({ email: `cli-${Date.now()}@conv.test` });
    const proA = await createUser({ email: `proa-${Date.now()}@conv.test`, name: 'Pro A' });
    const proB = await createUser({ email: `prob-${Date.now()}@conv.test`, name: 'Pro B' });

    for (const [para, texto] of [[proA, 'oi A'], [proA, 'tudo bem A?'], [proB, 'oi B']] as const) {
      await request(app)
        .post('/api/v1/messages')
        .set('Authorization', `Bearer ${tokenFor(cliente)}`)
        .send({ receiverId: para.id, content: texto })
        .expect(201);
    }

    const res = await request(app)
      .get('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(cliente)}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items.map((c: { user: { name: string } }) => c.user.name).sort()).toEqual(['Pro A', 'Pro B']);
  });

  it('devolve lista vazia para quem nunca trocou mensagem', async () => {
    const app = await getApp();
    const novo = await createUser({ email: `novo-${Date.now()}@conv.test` });

    const res = await request(app)
      .get('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(novo)}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
  });
});
