/**
 * O que estes testes protegem, sem subir banco nem broker:
 *  1. cada evento de domínio vira a notificação certa, para o usuário certo;
 *  2. `recordEvent` grava exatamente uma linha de outbox com a chave e o payload dados;
 *  3. o backoff escolhe o degrau certo por tentativa.
 */
import { recordEvent } from '../../src/events/domainBus';
import { __mapForTest as mapToInbox } from '../../src/events/consumers/notifications.consumer';
import { ROUTING_KEYS, retryLevelFor, EVENT_SCHEMAS, type DomainEvent } from '../../src/events/types';

describe('mapeamento evento → notificação', () => {
  const cases: Array<{ event: DomainEvent; userId: string; type: string }> = [
    {
      event: {
        id: 'e1',
        routingKey: ROUTING_KEYS.BOOKING_CREATED,
        payload: { bookingId: 'b1', clientId: 'cli', providerId: 'p1', providerUserId: 'prov', categoryId: 'plumb', title: 'Vazamento' },
      },
      userId: 'prov', // o pedido notifica o PROFISSIONAL
      type: 'BOOKING',
    },
    {
      event: {
        id: 'e2',
        routingKey: ROUTING_KEYS.BOOKING_ACCEPTED,
        payload: { bookingId: 'b1', clientId: 'cli', providerUserId: 'prov', title: 'Vazamento' },
      },
      userId: 'cli', // aceite notifica o CLIENTE
      type: 'BOOKING',
    },
    {
      event: {
        id: 'e3',
        routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED,
        payload: { paymentId: 'pay1', bookingId: 'b1', clientId: 'cli', providerUserId: 'prov', amount: 250 },
      },
      userId: 'prov', // pagamento notifica quem RECEBE
      type: 'SYSTEM',
    },
    {
      event: {
        id: 'e4',
        routingKey: ROUTING_KEYS.MESSAGE_CREATED,
        payload: { messageId: 'm1', senderId: 'cli', receiverId: 'prov', senderName: 'Marina', preview: 'oi' },
      },
      userId: 'prov', // mensagem notifica o DESTINATÁRIO
      type: 'MESSAGE',
    },
    {
      event: {
        id: 'e5',
        routingKey: ROUTING_KEYS.REVIEW_CREATED,
        payload: { reviewId: 'r1', bookingId: 'b1', authorId: 'cli', targetUserId: 'prov', providerId: 'p1', rating: 5 },
      },
      userId: 'prov', // avaliação notifica o AVALIADO
      type: 'REVIEW',
    },
  ];

  it.each(cases)('$event.routingKey → inbox de $userId ($type)', ({ event, userId, type }) => {
    const entry = mapToInbox(event);
    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe(userId);
    expect(entry!.type).toBe(type);
    expect(entry!.title.length).toBeGreaterThan(0);
    expect(entry!.body.length).toBeGreaterThan(0);
  });

  it('mensagem usa a prévia como corpo', () => {
    const entry = mapToInbox({
      id: 'm',
      routingKey: ROUTING_KEYS.MESSAGE_CREATED,
      payload: { messageId: 'm1', senderId: 'a', receiverId: 'b', senderName: 'Ana', preview: 'bom dia' },
    });
    expect(entry!.body).toBe('bom dia');
    expect(entry!.title).toContain('Ana');
  });
});

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

    // O consumidor vai validar com este mesmo schema; garantir aqui fecha o contrato.
    expect(EVENT_SCHEMAS[ROUTING_KEYS.PAYMENT_CONFIRMED].safeParse(saved).success).toBe(true);
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
