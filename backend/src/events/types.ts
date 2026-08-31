import { z } from 'zod';

/**
 * Contrato dos eventos de domínio do ZELO.
 *
 * Um lugar só define: (1) as routing keys que existem, (2) o formato do payload de
 * cada uma, via Zod. O publisher não precisa saber o formato — ele só serializa o
 * que o outbox guardou. Quem valida é o CONSUMIDOR, na borda de entrada: um payload
 * fora do contrato é tão perigoso quanto um serviço fora do ar, e a mesma disciplina
 * do `mlClient.service.ts` se aplica — melhor recusar do que processar lixo.
 *
 * As chaves seguem `dominio.fatoNoPassado`. Fato consumado, nunca comando: quem emite
 * não sabe (nem se importa com) quem vai reagir. É o que permite extrair o consumidor
 * de notificações para outro processo na Onda 3 sem tocar em nenhum service.
 */
export const ROUTING_KEYS = {
  BOOKING_CREATED: 'booking.created',
  BOOKING_ACCEPTED: 'booking.accepted',
  BOOKING_COMPLETED: 'booking.completed',
  BOOKING_CANCELLED: 'booking.cancelled',
  PAYMENT_CONFIRMED: 'payment.confirmed',
  MESSAGE_CREATED: 'message.created',
  REVIEW_CREATED: 'review.created',
} as const;

export type RoutingKey = (typeof ROUTING_KEYS)[keyof typeof ROUTING_KEYS];

// ─── Payloads ────────────────────────────────────────────────────────────────
// Só ids e o mínimo que um consumidor precisa para agir sem ter que reconsultar o
// banco no caminho comum. `providerUserId` viaja pronto (e não só `providerId`)
// porque notificação e ledger endereçam o USUÁRIO, não o perfil.

const bookingCreated = z.object({
  bookingId: z.string(),
  clientId: z.string(),
  providerId: z.string(),
  providerUserId: z.string(),
  categoryId: z.string(),
  title: z.string(),
  // Presente só quando o booking nasceu de um card de recomendação. É o que reabastece
  // o sinal de conversão (`trackBooked`) que hoje se perde por não ter quem o dispare.
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

/** Registro chave→schema. É a fonte da verdade para validar e para tipar payloads. */
export const EVENT_SCHEMAS = {
  [ROUTING_KEYS.BOOKING_CREATED]: bookingCreated,
  [ROUTING_KEYS.BOOKING_ACCEPTED]: bookingTransition,
  [ROUTING_KEYS.BOOKING_COMPLETED]: bookingTransition,
  [ROUTING_KEYS.BOOKING_CANCELLED]: bookingTransition,
  [ROUTING_KEYS.PAYMENT_CONFIRMED]: paymentConfirmed,
  [ROUTING_KEYS.MESSAGE_CREATED]: messageCreated,
  [ROUTING_KEYS.REVIEW_CREATED]: reviewCreated,
} as const satisfies Record<RoutingKey, z.ZodTypeAny>;

export type EventPayload<K extends RoutingKey> = z.infer<(typeof EVENT_SCHEMAS)[K]>;

/**
 * Envelope entregue ao handler. `id` é o id da linha do outbox. É uma UNIÃO DISCRIMINADA
 * por `routingKey`: um `switch (event.routingKey)` estreita `event.payload` para o tipo
 * exato daquele evento, sem cast.
 */
export type DomainEvent = {
  [K in RoutingKey]: { id: string; routingKey: K; payload: EventPayload<K> };
}[RoutingKey];

// ─── Topologia ───────────────────────────────────────────────────────────────
// Nomes centralizados para que publisher, topologia e consumidores concordem.
//
// O retry é POR CONSUMIDOR, não global, e a razão é concreta: `booking.created` vai
// para `notifications.q` E `analytics.q`. Se notifications falha e analytics já teve
// sucesso, um retry que voltasse pela exchange `zelo.events` reentregaria aos DOIS —
// analytics reprocessaria à toa. Com filas de espera próprias de cada consumidor, cujo
// dead-letter aponta de volta só para a fila daquele consumidor, o retry fica contido.
// A idempotência (ProcessedEvent) é a rede de segurança; isto evita acioná-la sem
// necessidade.

/** Header próprio com o número da tentativa. Determinístico — não dependemos de `x-death`. */
export const HEADER_ATTEMPTS = 'x-zelo-attempts';

/** DLQ única e compartilhada. Publicada via default exchange (routing key = nome da fila). */
export const QUEUE_DLQ = 'zelo.dlq';

/** Degraus do backoff. O nome real da fila é `${consumer}.retry.<suffix>`. */
export const RETRY_LEVELS = [
  { suffix: '5s', ttlMs: 5_000 },
  { suffix: '30s', ttlMs: 30_000 },
  { suffix: '5m', ttlMs: 300_000 },
] as const;

export const mainQueue = (consumer: string): string => `${consumer}.q`;
export const retryQueue = (consumer: string, suffix: string): string => `${consumer}.retry.${suffix}`;

/** Escolhe o degrau de espera pela tentativa (1→5s, 2→30s, 3+→5m). */
export function retryLevelFor(attempt: number): (typeof RETRY_LEVELS)[number] {
  const idx = Math.min(attempt - 1, RETRY_LEVELS.length - 1);
  return RETRY_LEVELS[Math.max(0, idx)];
}
