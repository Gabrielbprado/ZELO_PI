import { ROUTING_KEYS, type DomainEvent } from './types';

/**
 * Mapeia um evento de domínio para uma entrada de inbox. Os mesmos textos alimentam a
 * linha persistida e o push — um lugar só decide "quem é notificado, com qual mensagem".
 * Retorna `null` para eventos que este serviço ouve mas que não geram notificação
 * (hoje, `user.pushtoken.set`, tratado à parte).
 */
export interface InboxEntry {
  userId: string;
  type: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
}

export function toInbox(event: DomainEvent): InboxEntry | null {
  switch (event.routingKey) {
    case ROUTING_KEYS.BOOKING_CREATED: {
      const p = event.payload;
      return {
        userId: p.providerUserId,
        type: 'BOOKING',
        title: 'Nova solicitação de serviço',
        body: `Você recebeu um pedido: ${p.title}.`,
        data: { type: 'BOOKING', bookingId: p.bookingId, status: 'REQUESTED' },
      };
    }
    case ROUTING_KEYS.BOOKING_ACCEPTED: {
      const p = event.payload;
      return {
        userId: p.clientId,
        type: 'BOOKING',
        title: 'Reserva aceita ✅',
        body: `${p.title} foi aceito pelo profissional.`,
        data: { type: 'BOOKING', bookingId: p.bookingId, status: 'ACCEPTED' },
      };
    }
    case ROUTING_KEYS.BOOKING_COMPLETED: {
      const p = event.payload;
      return {
        userId: p.clientId,
        type: 'BOOKING',
        title: 'Serviço concluído 🎉',
        body: `${p.title} foi marcado como concluído.`,
        data: { type: 'BOOKING', bookingId: p.bookingId, status: 'COMPLETED' },
      };
    }
    case ROUTING_KEYS.BOOKING_CANCELLED: {
      const p = event.payload;
      return {
        userId: p.providerUserId,
        type: 'BOOKING',
        title: 'Agendamento cancelado',
        body: `${p.title} foi cancelado.`,
        data: { type: 'BOOKING', bookingId: p.bookingId, status: 'CANCELLED' },
      };
    }
    case ROUTING_KEYS.PAYMENT_CONFIRMED: {
      const p = event.payload;
      return {
        userId: p.providerUserId,
        type: 'SYSTEM',
        title: 'Pagamento confirmado 💰',
        body: `Você recebeu um pagamento de R$ ${p.amount.toLocaleString('pt-BR')}.`,
        data: { type: 'PAYMENT', bookingId: p.bookingId, paymentId: p.paymentId },
      };
    }
    case ROUTING_KEYS.MESSAGE_CREATED: {
      const p = event.payload;
      return {
        userId: p.receiverId,
        type: 'MESSAGE',
        title: `Nova mensagem de ${p.senderName}`,
        body: p.preview,
        data: { type: 'MESSAGE', senderId: p.senderId, bookingId: p.bookingId ?? null },
      };
    }
    case ROUTING_KEYS.BOOKING_REMINDER: {
      const p = event.payload;
      const quando = p.when === '24h' ? 'amanhã' : 'em 1 hora';
      return {
        userId: p.clientId,
        type: 'BOOKING',
        title: 'Lembrete de agendamento ⏰',
        body: `${p.title} está agendado para ${quando}.`,
        data: { type: 'BOOKING', bookingId: p.bookingId, reminder: p.when },
      };
    }
    case ROUTING_KEYS.REVIEW_CREATED: {
      const p = event.payload;
      return {
        userId: p.targetUserId,
        type: 'REVIEW',
        title: 'Você recebeu uma avaliação ⭐',
        body: `Uma nova avaliação de ${p.rating} estrela(s) foi publicada no seu perfil.`,
        data: { type: 'REVIEW', reviewId: p.reviewId, bookingId: p.bookingId },
      };
    }
    default:
      return null;
  }
}
