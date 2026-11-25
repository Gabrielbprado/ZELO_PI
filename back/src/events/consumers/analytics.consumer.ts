import { ROUTING_KEYS, type DomainEvent } from '../types';
import type { EventConsumer } from './runtime';

/**
 * Consumidor de analytics. Hoje faz uma coisa só, mas uma que estava QUEBRADA: registrar
 * a conversão de recomendação.
 *
 * `trackBooked` (recommendations.service.ts) existe desde sempre e nunca teve quem a
 * chamasse — todo booking nascido de um card de recomendação perdia o sinal positivo de
 * treino (`RecEvent` type BOOKED). Agora o evento `booking.created` carrega o
 * `recRequestId` de origem, e este consumidor fecha o laço: o modelo volta a aprender
 * com conversões reais. Quando o booking não veio de uma recomendação, não há
 * `recRequestId` e nada é registrado.
 *
 * O bind é `booking.created` por enquanto; na Onda 8 a fila de analytics passa a `#`
 * para alimentar o painel de métricas a partir de todo o fluxo de eventos.
 */
export const analyticsConsumer: EventConsumer = {
  name: 'analytics',
  bindings: [ROUTING_KEYS.BOOKING_CREATED],
  async handle(event: DomainEvent, tx) {
    if (event.routingKey !== ROUTING_KEYS.BOOKING_CREATED) return;
    const p = event.payload;
    if (!p.recRequestId) return;

    await tx.recEvent.create({
      data: {
        requestId: p.recRequestId,
        userId: p.clientId,
        providerId: p.providerId,
        type: 'BOOKED',
        position: 0,
        categoryId: p.categoryId,
      },
    });
  },
};
