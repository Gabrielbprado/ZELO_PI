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
    case ROUTING_KEYS.MODERATION_ACTIONED: {
      const p = event.payload;
      const entry = MODERATION_TEXT[p.type];
      if (!entry) return null;
      const prazo = p.expiresAt
        ? ` Prazo até ${new Date(p.expiresAt).toLocaleDateString('pt-BR')}.`
        : '';
      // Quem foi punido tem direito de saber POR QUE e por QUEM — inclusive quando quem
      // decidiu foi a máquina. Omitir isso transformaria a moderação automática numa
      // caixa-preta que a pessoa não tem como contestar.
      const motivo = p.reason ? ` Motivo: ${p.reason}.` : '';
      const autor = p.automated ? ' (análise automática — você pode contestar pelo suporte)' : '';
      return {
        userId: p.notifyUserId,
        type: 'SYSTEM',
        title: entry.title,
        body: `${entry.body}${prazo}${motivo}${autor}`,
        data: { type: 'MODERATION', actionId: p.actionId, action: p.type, reportId: p.reportId },
      };
    }
    default:
      return null;
  }
}

/** Ações sem entrada aqui (ACCEPT/REJECT) não notificam o alvo: o resultado da análise
 *  de uma denúncia contra você não é seu — contar seria entregar a denúncia. */
const MODERATION_TEXT: Record<string, { title: string; body: string } | undefined> = {
  WARN: {
    title: 'Advertência da moderação ⚠️',
    body: 'Sua conta recebeu uma advertência por violar as regras da comunidade.',
  },
  SUSPEND: {
    title: 'Conta suspensa temporariamente',
    body: 'Sua conta foi suspensa e o acesso está bloqueado até o fim do prazo.',
  },
  BLOCK: {
    title: 'Conta bloqueada',
    body: 'Sua conta foi bloqueada por violação das regras da comunidade.',
  },
  UNBLOCK: {
    title: 'Conta reativada ✅',
    body: 'A restrição da sua conta foi removida. Bem-vindo de volta.',
  },
  REQUEST_INFO: {
    title: 'Precisamos de mais informações',
    body: 'A moderação pediu detalhes adicionais sobre uma denúncia que você abriu.',
  },
};
