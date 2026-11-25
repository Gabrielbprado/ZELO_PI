/**
 * Mapeamento evento → inbox, sem banco nem broker. Cobre "quem é notificado, com qual
 * texto" para cada rota — a cobertura que antes vivia no backend e migrou junto do
 * consumidor.
 */
import { toInbox } from '../src/events/mapper';
import { ROUTING_KEYS, type DomainEvent } from '../src/events/types';

const singleEntryCases: Array<{ event: DomainEvent; userId: string; type: string }> = [
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
  it.each(singleEntryCases)('$event.routingKey → inbox de $userId ($type)', ({ event, userId, type }) => {
    const entries = toInbox(event);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.userId).toBe(userId);
    expect(entry.type).toBe(type);
    expect(entry.title.length).toBeGreaterThan(0);
    expect(entry.body.length).toBeGreaterThan(0);
  });

  it('payment.confirmed notifica cliente e profissional', () => {
    const entries = toInbox({
      id: 'e3',
      routingKey: ROUTING_KEYS.PAYMENT_CONFIRMED,
      payload: { paymentId: 'pay1', bookingId: 'b1', clientId: 'cli', providerUserId: 'prov', amount: 250 },
    });
    expect(entries).toHaveLength(2);

    const client = entries.find((e) => e.userId === 'cli');
    const provider = entries.find((e) => e.userId === 'prov');
    expect(client).toBeDefined();
    expect(provider).toBeDefined();
    // Sufixo distinto garante id único por Notification e evita colisão na PK ao persistir.
    expect(client!.suffix).toBe('c');
    expect(provider!.suffix).toBe('p');
    expect(client!.type).toBe('SYSTEM');
    expect(provider!.type).toBe('SYSTEM');
    expect(client!.body).toMatch(/pagamento|liberado/i);
    expect(provider!.body).toMatch(/liberado|recebi|confirmad/i);
  });

  it('message usa a prévia como corpo', () => {
    const [entry] = toInbox({
      id: 'm',
      routingKey: ROUTING_KEYS.MESSAGE_CREATED,
      payload: { messageId: 'm1', senderId: 'a', receiverId: 'b', senderName: 'Ana', preview: 'bom dia' },
    });
    expect(entry.body).toBe('bom dia');
    expect(entry.title).toContain('Ana');
  });

  it('user.pushtoken.set não gera notificação', () => {
    const entries = toInbox({
      id: 'p',
      routingKey: ROUTING_KEYS.USER_PUSHTOKEN_SET,
      payload: { userId: 'u1', pushToken: 'ExponentPushToken[x]' },
    });
    expect(entries).toEqual([]);
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
        const entries = toInbox({ id: 'e', routingKey: ROUTING_KEYS.MODERATION_ACTIONED, payload: { ...base, type } });
        expect(entries).toHaveLength(1);
        const entry = entries[0];
        expect(entry.userId).toBe('alvo');
        expect(entry.type).toBe('SYSTEM');
        expect(entry.body).toContain('Fraude');
      }
    });

    it('suspensão informa o prazo', () => {
      const entries = toInbox({
        id: 'e',
        routingKey: ROUTING_KEYS.MODERATION_ACTIONED,
        payload: { ...base, type: 'SUSPEND', expiresAt: '2026-10-05T12:00:00.000Z' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].body).toContain('05/10/2026');
    });

    it('decisão automática se identifica como tal — a pessoa precisa saber para contestar', () => {
      const entries = toInbox({
        id: 'e',
        routingKey: ROUTING_KEYS.MODERATION_ACTIONED,
        payload: { ...base, type: 'BLOCK', automated: true },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].body).toContain('automática');
    });

    it('pedido de informações vai para quem DENUNCIOU, não para o alvo', () => {
      const entries = toInbox({
        id: 'e',
        routingKey: ROUTING_KEYS.MODERATION_ACTIONED,
        payload: { ...base, type: 'REQUEST_INFO', notifyUserId: 'denunciante' },
      });
      expect(entries).toHaveLength(1);
      expect(entries[0].userId).toBe('denunciante');
    });

    it('aceitar/rejeitar não notificam ninguém — contar seria entregar a denúncia', () => {
      for (const type of ['ACCEPT', 'REJECT'] as const) {
        expect(toInbox({ id: 'e', routingKey: ROUTING_KEYS.MODERATION_ACTIONED, payload: { ...base, type } })).toEqual([]);
      }
    });
  });
});
