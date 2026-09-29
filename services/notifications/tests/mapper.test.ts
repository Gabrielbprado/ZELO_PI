/**
 * Mapeamento evento → inbox, sem banco nem broker. Cobre "quem é notificado, com qual
 * texto" para cada rota — a cobertura que antes vivia no backend e migrou junto do
 * consumidor.
 */
import { toInbox } from '../src/events/mapper';
import { ROUTING_KEYS, type DomainEvent } from '../src/events/types';

const cases: Array<{ event: DomainEvent; userId: string; type: string }> = [
  {
    event: {
      id: 'e1',
      routingKey: ROUTING_KEYS.BOOKING_CREATED,
      payload: { bookingId: 'b1', clientId: 'cli', providerId: 'p1', providerUserId: 'prov', categoryId: 'plumb', title: 'Vazamento' },
    },
    userId: 'prov',
    type: 'BOOKING',
  },
  {
    event: {
      id: 'e2',
      routingKey: ROUTING_KEYS.BOOKING_ACCEPTED,
      payload: { bookingId: 'b1', clientId: 'cli', providerUserId: 'prov', title: 'Vazamento' },
    },
    userId: 'cli',
    type: 'BOOKING',
  },
  {
    event: {
      id: 'e3',
      routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED,
      payload: { paymentId: 'pay1', bookingId: 'b1', clientId: 'cli', providerUserId: 'prov', amount: 250 },
    },
    userId: 'prov',
    type: 'SYSTEM',
  },
  {
    event: {
      id: 'e4',
      routingKey: ROUTING_KEYS.MESSAGE_CREATED,
      payload: { messageId: 'm1', senderId: 'cli', receiverId: 'prov', senderName: 'Marina', preview: 'oi' },
    },
    userId: 'prov',
    type: 'MESSAGE',
  },
  {
    event: {
      id: 'e5',
      routingKey: ROUTING_KEYS.REVIEW_CREATED,
      payload: { reviewId: 'r1', bookingId: 'b1', authorId: 'cli', targetUserId: 'prov', providerId: 'p1', rating: 5 },
    },
    userId: 'prov',
    type: 'REVIEW',
  },
  {
    event: {
      id: 'e6',
      routingKey: ROUTING_KEYS.BOOKING_REMINDER,
      payload: { bookingId: 'b1', clientId: 'cli', providerUserId: 'prov', title: 'Faxina', when: '24h' },
    },
    userId: 'cli', // o lembrete é para o CLIENTE
    type: 'BOOKING',
  },
];

describe('toInbox', () => {
  it.each(cases)('$event.routingKey → inbox de $userId ($type)', ({ event, userId, type }) => {
    const entry = toInbox(event);
    expect(entry).not.toBeNull();
    expect(entry!.userId).toBe(userId);
    expect(entry!.type).toBe(type);
    expect(entry!.title.length).toBeGreaterThan(0);
    expect(entry!.body.length).toBeGreaterThan(0);
  });

  it('message usa a prévia como corpo', () => {
    const entry = toInbox({
      id: 'm',
      routingKey: ROUTING_KEYS.MESSAGE_CREATED,
      payload: { messageId: 'm1', senderId: 'a', receiverId: 'b', senderName: 'Ana', preview: 'bom dia' },
    });
    expect(entry!.body).toBe('bom dia');
    expect(entry!.title).toContain('Ana');
  });

  it('user.pushtoken.set não gera notificação', () => {
    const entry = toInbox({
      id: 'p',
      routingKey: ROUTING_KEYS.USER_PUSHTOKEN_SET,
      payload: { userId: 'u1', pushToken: 'ExponentPushToken[x]' },
    });
    expect(entry).toBeNull();
  });

  describe('moderação', () => {
    const base = {
      actionId: 'a1',
      reportId: 'r1',
      targetUserId: 'alvo',
      notifyUserId: 'alvo',
      reason: 'Fraude',
      expiresAt: null,
      automated: false,
    };

    it('advertência e bloqueio avisam o alvo', () => {
      for (const type of ['WARN', 'BLOCK', 'UNBLOCK'] as const) {
        const entry = toInbox({ id: 'e', routingKey: ROUTING_KEYS.MODERATION_ACTIONED, payload: { ...base, type } });
        expect(entry!.userId).toBe('alvo');
        expect(entry!.type).toBe('SYSTEM');
        expect(entry!.body).toContain('Fraude');
      }
    });

    it('suspensão informa o prazo', () => {
      const entry = toInbox({
        id: 'e',
        routingKey: ROUTING_KEYS.MODERATION_ACTIONED,
        payload: { ...base, type: 'SUSPEND', expiresAt: '2026-10-05T12:00:00.000Z' },
      });
      expect(entry!.body).toContain('05/10/2026');
    });

    it('decisão automática se identifica como tal — a pessoa precisa saber para contestar', () => {
      const entry = toInbox({
        id: 'e',
        routingKey: ROUTING_KEYS.MODERATION_ACTIONED,
        payload: { ...base, type: 'BLOCK', automated: true },
      });
      expect(entry!.body).toContain('automática');
    });

    it('pedido de informações vai para quem DENUNCIOU, não para o alvo', () => {
      const entry = toInbox({
        id: 'e',
        routingKey: ROUTING_KEYS.MODERATION_ACTIONED,
        payload: { ...base, type: 'REQUEST_INFO', notifyUserId: 'denunciante' },
      });
      expect(entry!.userId).toBe('denunciante');
    });

    it('aceitar/rejeitar não notificam ninguém — contar seria entregar a denúncia', () => {
      for (const type of ['ACCEPT', 'REJECT'] as const) {
        expect(toInbox({ id: 'e', routingKey: ROUTING_KEYS.MODERATION_ACTIONED, payload: { ...base, type } })).toBeNull();
      }
    });
  });
});
