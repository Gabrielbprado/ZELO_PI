/**
 * A propriedade que importa não é "o gateway lê o inbox" — é "o gateway NUNCA quebra o
 * app". Serviço fora do ar, timeout, corpo malformado: tudo vira lista vazia (leitura)
 * ou no-op (escrita), jamais uma exceção que viraria 500 em GET /notifications.
 */
import {
  listNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../../src/services/notificationsClient.service';

const realFetch = global.fetch;

afterEach(() => {
  global.fetch = realFetch;
  jest.restoreAllMocks();
});

describe('listNotifications', () => {
  it('devolve os itens quando o serviço responde no contrato', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [
            { id: 'n1', userId: 'u1', type: 'BOOKING', title: 'Oi', body: 'corpo', createdAt: '2026-01-01T00:00:00.000Z' },
          ],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const items = await listNotifications('u1');
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('n1');
  });

  it('serviço fora do ar → lista vazia, sem lançar', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(listNotifications('u1')).resolves.toEqual([]);
  });

  it('5xx → lista vazia', async () => {
    global.fetch = jest.fn().mockResolvedValue(new Response('erro', { status: 503 })) as unknown as typeof fetch;
    await expect(listNotifications('u1')).resolves.toEqual([]);
  });

  it('corpo fora do contrato → lista vazia', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ items: [{ nope: true }] }), { status: 200 }),
    ) as unknown as typeof fetch;
    await expect(listNotifications('u1')).resolves.toEqual([]);
  });

  it('envia o X-SERVICE-TOKEN e o userId', async () => {
    const spy = jest
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ items: [] }), { status: 200 }));
    global.fetch = spy as unknown as typeof fetch;

    await listNotifications('u42');

    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toContain('userId=u42');
    expect((init.headers as Record<string, string>)['X-SERVICE-TOKEN']).toBe('service_token_com_16_chars_ok');
  });
});

describe('escrita best-effort', () => {
  it('markRead engole falha do serviço', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    await expect(markNotificationRead('u1', 'n1')).resolves.toBeUndefined();
  });

  it('markAllRead engole falha do serviço', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('down')) as unknown as typeof fetch;
    await expect(markAllNotificationsRead('u1')).resolves.toBeUndefined();
  });
});
