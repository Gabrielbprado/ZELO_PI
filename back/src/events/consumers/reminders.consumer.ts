import { ROUTING_KEYS, type DomainEvent } from '../types';
import type { EventConsumer } from './runtime';
import { cancelBookingReminders, scheduleBookingReminders } from '../../jobs';

/**
 * Ponte evento → job: um `booking.accepted` agenda os lembretes delayed (BullMQ), um
 * `booking.cancelled` os remove. É o exemplo canônico de "RabbitMQ dispara, BullMQ
 * agenda" — o AMQP não faz delay de negócio, o BullMQ faz.
 *
 * O horário do agendamento não viaja no evento de transição, então o consumidor o lê do
 * booking (tem acesso ao banco, roda no backend). Bookings sem `scheduledAt` (urgência
 * imediata) simplesmente não geram lembrete.
 */
export const remindersConsumer: EventConsumer = {
  name: 'reminders',
  bindings: [ROUTING_KEYS.BOOKING_ACCEPTED, ROUTING_KEYS.BOOKING_CANCELLED],
  async handle(event: DomainEvent, tx) {
    if (event.routingKey === ROUTING_KEYS.BOOKING_ACCEPTED) {
      const booking = await tx.booking.findUnique({
        where: { id: event.payload.bookingId },
        select: { scheduledAt: true },
      });
      if (booking?.scheduledAt) {
        await scheduleBookingReminders(event.payload.bookingId, booking.scheduledAt);
      }
    } else if (event.routingKey === ROUTING_KEYS.BOOKING_CANCELLED) {
      await cancelBookingReminders(event.payload.bookingId);
    }
  },
};
