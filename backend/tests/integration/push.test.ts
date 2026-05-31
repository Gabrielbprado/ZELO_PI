import { getApp, createUser, authedAgent } from './helpers';
import { prisma } from '../../src/config/prisma';
import { pushToUser } from '../../src/services/notifications.service';
import { env } from '../../src/config/env';

const EXPO_TOKEN = 'ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]';

describe('Push notifications', () => {
  describe('POST/DELETE /users/me/push-token', () => {
    it('upserts the caller push token', async () => {
      const client = await authedAgent('CLIENT');
      const res = await client.post('/api/v1/users/me/push-token').send({ token: EXPO_TOKEN });
      expect(res.status).toBe(204);

      const user = await prisma.user.findUnique({ where: { id: client.user.id } });
      expect(user?.pushToken).toBe(EXPO_TOKEN);
    });

    it('drops the token on delete (logout)', async () => {
      const client = await authedAgent('CLIENT');
      await client.post('/api/v1/users/me/push-token').send({ token: EXPO_TOKEN });
      const res = await client.delete('/api/v1/users/me/push-token');
      expect(res.status).toBe(204);

      const user = await prisma.user.findUnique({ where: { id: client.user.id } });
      expect(user?.pushToken).toBeNull();
    });

    it('rejects an empty token', async () => {
      const client = await authedAgent('CLIENT');
      const res = await client.post('/api/v1/users/me/push-token').send({ token: '' });
      expect(res.status).toBe(400);
    });

    it('requires authentication', async () => {
      const app = await getApp();
      const request = (await import('supertest')).default;
      const res = await request(app).post('/api/v1/users/me/push-token').send({ token: EXPO_TOKEN });
      expect(res.status).toBe(401);
    });
  });

  describe('pushToUser() helper', () => {
    let fetchMock: jest.Mock;
    const realFetch = global.fetch;

    beforeEach(() => {
      fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
      global.fetch = fetchMock as unknown as typeof fetch;
    });
    afterEach(() => {
      global.fetch = realFetch;
    });

    it('POSTs to the Expo API for a valid native token', async () => {
      const user = await createUser({ email: `push-${Date.now()}@push.test` });
      await prisma.user.update({ where: { id: user.id }, data: { pushToken: EXPO_TOKEN } });

      await pushToUser(user.id, { title: 'Olá', body: 'corpo', data: { type: 'TEST' } });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(env.EXPO_PUSH_API_URL);
      const sent = JSON.parse((init as { body: string }).body);
      expect(sent.to).toBe(EXPO_TOKEN);
      expect(sent.title).toBe('Olá');
      expect(sent.data.type).toBe('TEST');
    });

    it('is a no-op when the user has no token', async () => {
      const user = await createUser({ email: `push2-${Date.now()}@push.test` });
      await pushToUser(user.id, { title: 'x', body: 'y' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('is a no-op for a non-Expo (web) token', async () => {
      const user = await createUser({ email: `push3-${Date.now()}@push.test` });
      await prisma.user.update({ where: { id: user.id }, data: { pushToken: 'web-session-abc' } });
      await pushToUser(user.id, { title: 'x', body: 'y' });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('respects the PUSH_ENABLED kill-switch', async () => {
      const user = await createUser({ email: `push4-${Date.now()}@push.test` });
      await prisma.user.update({ where: { id: user.id }, data: { pushToken: EXPO_TOKEN } });

      const original = env.PUSH_ENABLED;
      (env as { PUSH_ENABLED: boolean }).PUSH_ENABLED = false;
      try {
        await pushToUser(user.id, { title: 'x', body: 'y' });
        expect(fetchMock).not.toHaveBeenCalled();
      } finally {
        (env as { PUSH_ENABLED: boolean }).PUSH_ENABLED = original;
      }
    });
  });
});
