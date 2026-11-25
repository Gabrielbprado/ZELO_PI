import { ROUTING_KEYS, type DomainEvent } from '../types';
import type { EventConsumer } from './runtime';
import { onBookingCompleted, onPaymentConfirmed } from '../../services/ledger.service';

/**
 * Consumidor do ledger: transforma os eventos de domínio em movimento de dinheiro.
 * `payment.confirmed` retém em escrow; `booking.completed` liquida (pending→balance menos
 * a comissão). Roda dentro da transação idempotente do runtime — mover dinheiro e marcar
 * o evento como processado commitam juntos.
 */
export const ledgerConsumer: EventConsumer = {
  name: 'ledger',
  bindings: [ROUTING_KEYS.PAYMENT_CONFIRMED, ROUTING_KEYS.BOOKING_COMPLETED],
  async handle(event: DomainEvent, tx) {
    if (event.routingKey === ROUTING_KEYS.PAYMENT_CONFIRMED) {
      await onPaymentConfirmed(tx, event.payload.paymentId);
    } else if (event.routingKey === ROUTING_KEYS.BOOKING_COMPLETED) {
      await onBookingCompleted(tx, event.payload.bookingId);
    }
  },
};
