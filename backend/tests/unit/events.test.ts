/**
 * O que estes testes protegem, sem subir banco nem broker:
 *  1. `recordEvent` grava exatamente uma linha de outbox com a chave e o payload dados;
 *  2. o payload gravado satisfaz o schema do próprio evento (contrato ida-e-volta);
 *  3. o backoff escolhe o degrau certo por tentativa.
 *
 * (O mapeamento evento→notificação migrou para o microserviço de notificações, junto do
 * consumidor; a cobertura dele agora vive em services/notifications/tests.)
 */
import { recordEvent } from '../../src/events/domainBus';
import { ROUTING_KEYS, retryLevelFor, EVENT_SCHEMAS } from '../../src/events/types';

describe('recordEvent', () => {
  it('grava uma linha de outbox com a routing key e o payload', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { outboxEvent: { create } } as never;

    await recordEvent(tx, ROUTING_KEYS.BOOKING_CREATED, {
      bookingId: 'b1',
      clientId: 'cli',
      providerId: 'p1',
      providerUserId: 'prov',
      categoryId: 'plumb',
      title: 'Vazamento',
      recRequestId: null,
    });

    expect(create).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledWith({
      data: {
        routingKey: 'booking.created',
        payload: expect.objectContaining({ bookingId: 'b1', providerUserId: 'prov' }),
      },
    });
  });

  it('o payload gravado satisfaz o schema do próprio evento (contrato ida-e-volta)', async () => {
    let saved: unknown;
    const tx = { outboxEvent: { create: jest.fn(async ({ data }) => { saved = data.payload; }) } } as never;

    await recordEvent(tx, ROUTING_KEYS.PAYMENT_CONFIRMED, {
      paymentId: 'pay1',
      bookingId: 'b1',
      clientId: 'cli',
      providerUserId: 'prov',
      amount: 250,
    });

    expect(EVENT_SCHEMAS[ROUTING_KEYS.PAYMENT_CONFIRMED].safeParse(saved).success).toBe(true);
  });

  it('grava user.pushtoken.set com o token (ou null)', async () => {
    const create = jest.fn().mockResolvedValue({});
    const tx = { outboxEvent: { create } } as never;

    await recordEvent(tx, ROUTING_KEYS.USER_PUSHTOKEN_SET, { userId: 'u1', pushToken: null });

    expect(create).toHaveBeenCalledWith({
      data: { routingKey: 'user.pushtoken.set', payload: expect.objectContaining({ userId: 'u1', pushToken: null }) },
    });
  });
});

describe('backoff de retry', () => {
  it('escala 1→5s, 2→30s, 3→5m e satura em 5m', () => {
    expect(retryLevelFor(1).suffix).toBe('5s');
    expect(retryLevelFor(2).suffix).toBe('30s');
    expect(retryLevelFor(3).suffix).toBe('5m');
    expect(retryLevelFor(9).suffix).toBe('5m');
  });
});
