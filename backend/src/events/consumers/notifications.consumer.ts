import type { NotificationType, Prisma } from '@prisma/client';
import { ROUTING_KEYS, type DomainEvent } from '../types';
import type { EventConsumer } from './runtime';

/**
 * Consumidor de notificações — e o primeiro ESCRITOR que a tabela `Notification` tem.
 * Ela existia desde o início do projeto e nunca foi preenchida: `GET /notifications`
 * sempre devolvia lista vazia. Agora cada evento de domínio relevante vira uma linha no
 * inbox do usuário certo.
 *
 * Nesta onda o push OS-level continua saindo inline dos services (o app se comporta
 * igual); o que muda é só o inbox passar a existir. Na Onda 3 este consumidor sai para o
 * microserviço de notificações e absorve também o envio do push, com retry e DLQ.
 */

interface InboxEntry {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data: Prisma.InputJsonValue;
}

/** Mapeia um evento para uma entrada de inbox, ou `null` quando não gera notificação. */
function toInbox(event: DomainEvent): InboxEntry | null {
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

export const notificationsConsumer: EventConsumer = {
  name: 'notifications',
  bindings: [
    ROUTING_KEYS.BOOKING_CREATED,
    ROUTING_KEYS.BOOKING_ACCEPTED,
    ROUTING_KEYS.BOOKING_COMPLETED,
    ROUTING_KEYS.BOOKING_CANCELLED,
    ROUTING_KEYS.PAYMENT_CONFIRMED,
    ROUTING_KEYS.MESSAGE_CREATED,
    ROUTING_KEYS.REVIEW_CREATED,
  ],
  async handle(event, tx) {
    const entry = toInbox(event);
    if (!entry) return;
    await tx.notification.create({ data: entry });
  },
};

// Exporto o mapeador para o unit test cobrir cada rota sem subir broker nenhum.
export const __mapForTest = toInbox;
