import { z } from 'zod';

/**
 * Contrato dos eventos que ESTE serviço consome. É uma cópia do contrato publicado pelo
 * backend — a duplicação é o preço (aceito) de um serviço de verdade em vez de um módulo
 * compartilhado. Se o contrato divergir, o consumidor recusa o payload e ele vai para a
 * DLQ, em vez de processar lixo silenciosamente. Num monorepo maior isto viraria um
 * pacote `@zelo/contracts`; para o escopo do PI, a cópia versionada basta.
 */
export const ROUTING_KEYS = {
  BOOKING_CREATED: 'booking.created',
  BOOKING_ACCEPTED: 'booking.accepted',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  MESSAGE_CREATED: 'message.created',
  REVIEW_CREATED: 'review.created',
  BOOKING_REMINDER: 'booking.reminder',
  USER_PUSHTOKEN_SET: 'user.pushtoken.set',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

const bookingCreated = z.object({
  bookingId: z.string(),
  clientId: z.string(),
  providerId: z.string(),
  providerUserId: z.string(),
  categoryId: z.string(),
  title: z.string(),
  recRequestId: z.string().nullable().optional(),
});

const bookingTransition = z.object({
  bookingId: z.string(),
  clientId: z.string(),
  providerUserId: z.string(),
  title: z.string(),
});

const paymentConfirmed = z.object({
  paymentId: z.string(),
  bookingId: z.string(),
  clientId: z.string(),
  providerUserId: z.string(),
  amount: z.number(),
});

const messageCreated = z.object({
  messageId: z.string(),
  senderId: z.string(),
  receiverId: z.string(),
  senderName: z.string(),
  preview: z.string(),
  bookingId: z.string().nullable().optional(),
});

const reviewCreated = z.object({
  reviewId: z.string(),
  bookingId: z.string(),
  authorId: z.string(),
  targetUserId: z.string(),
  providerId: z.string(),
  rating: z.number(),
});

const bookingReminder = z.object({
  bookingId: z.string(),
  clientId: z.string(),
  providerUserId: z.string(),
  title: z.string(),
  when: z.enum(['24h', '1h']),
});

const pushTokenSet = z.object({
  userId: z.string(),
  pushToken: z.string().nullable(),
});

export const EVENT_SCHEMAS = {
  [ROUTING_KEYS.BOOKING_CREATED]: bookingCreated,
  [ROUTING_KEYS.BOOKING_ACCEPTED]: bookingTransition,
  [ROUTING_KEYS.BOOKING_COMPLETED]: bookingTransition,
  [ROUTING_KEYS.BOOKING_CANCELLED]: bookingTransition,
  [ROUTING_KEYS.PAYMENT_CONFIRMED]: paymentConfirmed,
  [ROUTING_KEYS.MESSAGE_CREATED]: messageCreated,
  [ROUTING_KEYS.REVIEW_CREATED]: reviewCreated,
  [ROUTING_KEYS.BOOKING_REMINDER]: bookingReminder,
  [ROUTING_KEYS.USER_PUSHTOKEN_SET]: pushTokenSet,
} as const satisfies Record<RoutingKey, z.ZodTypeAny>;

export type EventPayload<K extends RoutingKey> = z.infer<(typeof EVENT_SCHEMAS)[K]>;

export type DomainEvent = {
  [K in RoutingKey]: { id: string; routingKey: K; payload: EventPayload<K> };
}[RoutingKey];

/** Todos os eventos que o serviço quer ouvir. */
export const CONSUMED_KEYS: readonly RoutingKey[] = Object.values(ROUTING_KEYS);

// ─── Topologia ───────────────────────────────────────────────────────────────

export const CONSUMER = 'notifications';
export const MAIN_QUEUE = `${CONSUMER}.q`;
export const QUEUE_DLQ = 'zelo.dlq';
export const HEADER_ATTEMPTS = 'x-zelo-attempts';

export const RETRY_LEVELS = [
  { suffix: '5s', ttlMs: 5_000 },
  { suffix: '30s', ttlMs: 30_000 },
  { suffix: '5m', ttlMs: 300_000 },
] as const;

export const retryQueue = (suffix: string): string => `${CONSUMER}.retry.${suffix}`;

export function retryLevelFor(attempt: number): (typeof RETRY_LEVELS)[number] {
  const idx = Math.min(attempt - 1, RETRY_LEVELS.length - 1);
  return RETRY_LEVELS[Math.max(0, idx)];
}
