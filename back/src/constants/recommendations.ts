/**
 * Constantes e textos do recomendador.
 *
 * O serviço Python devolve apenas CÓDIGOS de motivo e números — a cópia em
 * pt-BR mora aqui. Assim a internacionalização fica numa camada só e o app pode
 * mapear código → ícone sem depender do texto.
 */

export const REC_REASON_CODES = [
  'REHIRE',
  'SAME_CATEGORY_HISTORY',
  'NEARBY',
  'TOP_RATED',
  'SIMILAR_CLIENTS',
  'PRICE_FIT',
  'VERIFIED',
  'FAST_RESPONSE',
  'NEW_TALENT',
] as const;

export type RecReasonCode = (typeof REC_REASON_CODES)[number];

/** Estratégia efetivamente usada para montar a lista. */
export type RecStrategy =
  | 'ranker'
  | 'cold_start_popularity'
  | 'heuristic_fallback'
  | 'fallback';

const formatKm = (value?: number | null): string =>
  value === undefined || value === null
    ? 'perto de você'
    : value < 1
      ? 'a menos de 1 km'
      : `a ${value.toFixed(1).replace('.', ',')} km`;

export const REC_REASON_COPY: Record<RecReasonCode, (value?: number | null) => string> = {
  REHIRE: (v) =>
    !v || v <= 1 ? 'Você já contratou' : `Você já contratou ${v} vezes`,
  SAME_CATEGORY_HISTORY: () => 'Do tipo que você costuma contratar',
  NEARBY: (v) => formatKm(v),
  TOP_RATED: (v) => (v ? `Bem avaliado (${v.toFixed(1).replace('.', ',')})` : 'Bem avaliado'),
  SIMILAR_CLIENTS: () => 'Escolhido por clientes parecidos',
  PRICE_FIT: () => 'Dentro da sua faixa de preço',
  VERIFIED: () => 'Identidade verificada',
  FAST_RESPONSE: () => 'Costuma responder rápido',
  NEW_TALENT: () => 'Novo por aqui',
};

export const DEFAULT_REC_LIMIT = 8;
export const MAX_REC_LIMIT = 20;

/** Raio da geração de candidatos. DEVE bater com `CANDIDATE_RADIUS_KM` do treino. */
export const CANDIDATE_RADIUS_KM = 25;

/** Quantos bookings recentes formam a âncora geográfica do cliente. */
export const ANCHOR_HISTORY = 10;

/** TTL do cache em memória dos contadores por profissional. */
export const PROVIDER_AGG_CACHE_TTL_MS = 60_000;

/** Telemetria é conversa fiada: lote pequeno, limite próprio. */
export const MAX_REC_EVENTS_PER_BATCH = 20;
