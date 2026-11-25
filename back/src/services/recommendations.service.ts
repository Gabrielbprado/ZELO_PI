import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import {
  ANCHOR_HISTORY,
  CANDIDATE_RADIUS_KM,
  DEFAULT_REC_LIMIT,
  REC_REASON_COPY,
  type RecReasonCode,
  type RecStrategy,
} from '../constants/recommendations';
import { LIST_PROVIDER_INCLUDE, listProviders, serializeProvider } from './providers.service';
import { rankProviders } from './mlClient.service';
import { logger } from '../utils/logger';

export interface ForYouOptions {
  userId: string;
  categoryId?: string;
  limit?: number;
  lat?: number;
  lng?: number;
}

interface CandidateRow {
  id: string;
  price_from: number;
  years_exp: number;
  rating_avg: number;
  rating_count: number;
  verified: boolean;
  available: boolean;
  tenure_days: number;
  distance_km: number | null;
  same_neighborhood: boolean;
  same_city: boolean;
  category_ids: string[];
  completed_count: number;
  cancelled_count: number;
  accepted_count: number;
  requested_count: number;
  median_response_hours: number | null;
  prior_bookings_with_client: number;
  prior_completed_with_client: number;
  days_since_last_with_client: number | null;
  service_median_price: number | null;
}

/**
 * Monta o carrossel "Para você".
 *
 * Contrato de resiliência: esta função SEMPRE devolve uma lista utilizável.
 * Se o serviço de ML estiver fora, lento ou devolver lixo, ela cai na
 * ordenação por avaliação e marca `strategy: 'fallback'` — o app renderiza
 * normalmente e apenas deixa de exibir explicações de personalização.
 */
export async function getForYou(opts: ForYouOptions) {
  const limit = opts.limit ?? DEFAULT_REC_LIMIT;
  const requestId = randomUUID();

  const [profile, anchor] = await Promise.all([
    buildClientProfile(opts.userId),
    resolveAnchor(opts),
  ]);

  const candidates = await fetchCandidates({
    userId: opts.userId,
    categoryId: opts.categoryId,
    anchor,
    limit: env.ML_CANDIDATE_LIMIT,
  });

  if (candidates.length === 0) {
    return fallback(opts, limit, requestId, 'sem candidatos');
  }

  const ranked = await rankProviders({
    request_id: requestId,
    client: {
      id: opts.userId,
      city: profile.city,
      neighborhood: profile.neighborhood,
      booking_count: profile.bookingCount,
      distinct_categories: profile.distinctCategories,
      avg_ticket: profile.avgTicket,
      days_since_last_booking: profile.daysSinceLastBooking,
      category_counts: profile.categoryCounts,
    },
    context: {
      category_id: opts.categoryId ?? null,
      urgency: null,
      at: new Date().toISOString(),
      limit,
    },
    candidates: candidates.map(toMlCandidate),
  });

  if (!ranked) {
    return fallback(opts, limit, requestId, 'serviço de ML indisponível');
  }

  const byId = new Map(candidates.map((c) => [c.id, c]));
  const ordered = ranked.items.filter((item) => byId.has(item.provider_id));
  const hydrated = await hydrate(ordered.map((i) => i.provider_id));

  const items = ordered
    .map((item) => {
      const provider = hydrated.get(item.provider_id);
      if (!provider) return null;
      return {
        ...serializeProvider(provider, byId.get(item.provider_id)?.distance_km ?? undefined),
        score: item.score,
        reasons: item.reasons.map((r) => ({
          code: r.code as RecReasonCode,
          label: REC_REASON_COPY[r.code as RecReasonCode](r.value ?? null),
          value: r.value ?? null,
        })),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);

  return {
    items,
    strategy: ranked.strategy as RecStrategy,
    modelVersion: ranked.model_version,
    requestId,
  };
}

/**
 * Caminho de degradação: a ordenação por avaliação que o app já usa hoje.
 *
 * Sem motivos de personalização — não temos como justificar honestamente uma
 * escolha que não foi personalizada, e o app suprime o selo quando a estratégia
 * é `fallback`.
 */
async function fallback(opts: ForYouOptions, limit: number, requestId: string, reason: string) {
  logger.info({ reason }, 'recomendação degradada para ordenação por avaliação');
  const result = await listProviders({
    category: opts.categoryId,
    sort: 'rating',
    page: 1,
    perPage: limit,
  });
  return {
    items: result.items.map((p) => ({ ...p, score: null, reasons: [] })),
    strategy: 'fallback' as RecStrategy,
    modelVersion: null,
    requestId,
  };
}

async function hydrate(ids: string[]) {
  if (ids.length === 0) return new Map<string, Awaited<ReturnType<typeof findMany>>[number]>();
  const rows = await findMany(ids);
  return new Map(rows.map((r) => [r.id, r]));
}

function findMany(ids: string[]) {
  return prisma.providerProfile.findMany({
    where: { id: { in: ids } },
    include: LIST_PROVIDER_INCLUDE,
  });
}

// ── Perfil do cliente ─────────────────────────────────────────────────────

async function buildClientProfile(userId: string) {
  const [user, grouped, aggregate] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { city: true, neighborhood: true },
    }),
    prisma.booking.groupBy({
      by: ['categoryId'],
      where: { clientId: userId },
      _count: { _all: true },
    }),
    prisma.booking.aggregate({
      where: { clientId: userId },
      _count: { _all: true },
      _avg: { priceFinal: true },
      _max: { createdAt: true },
    }),
  ]);

  const categoryCounts: Record<string, number> = {};
  for (const row of grouped) categoryCounts[row.categoryId] = row._count._all;

  const last = aggregate._max.createdAt;
  return {
    city: user?.city ?? null,
    neighborhood: user?.neighborhood ?? null,
    bookingCount: aggregate._count._all,
    distinctCategories: grouped.length,
    avgTicket: aggregate._avg.priceFinal ?? null,
    daysSinceLastBooking: last ? (Date.now() - last.getTime()) / 86_400_000 : null,
    categoryCounts,
  };
}

/**
 * Âncora geográfica: coordenadas do dispositivo quando o app as envia, senão o
 * centróide dos últimos bookings localizados do cliente.
 *
 * Usar o histórico é o que permite recomendar bem mesmo sem permissão de
 * localização — que boa parte dos usuários nega.
 */
async function resolveAnchor(opts: ForYouOptions): Promise<{ lat: number; lng: number } | null> {
  if (opts.lat !== undefined && opts.lng !== undefined) {
    return { lat: opts.lat, lng: opts.lng };
  }

  const rows = await prisma.$queryRaw<Array<{ lat: number | null; lng: number | null }>>(
    Prisma.sql`
      SELECT ST_Y(ST_Centroid(ST_Collect(loc))::geometry) AS lat,
             ST_X(ST_Centroid(ST_Collect(loc))::geometry) AS lng
        FROM (
          SELECT b."location"::geometry AS loc
            FROM "Booking" b
           WHERE b."clientId" = ${opts.userId}
             AND b."location" IS NOT NULL
           ORDER BY b."createdAt" DESC
           LIMIT ${ANCHOR_HISTORY}
        ) recentes
    `,
  );

  const row = rows[0];
  if (!row || row.lat === null || row.lng === null) return null;
  return { lat: row.lat, lng: row.lng };
}

// ── Geração de candidatos ─────────────────────────────────────────────────

/**
 * Uma consulta só, no mesmo estilo de composição de `listProvidersByDistance`.
 *
 * `available = true` NÃO é opcional: o modelo foi treinado num conjunto de
 * candidatos que só contém profissionais disponíveis, e alimentá-lo com
 * indisponíveis reintroduziria exatamente o desalinhamento treino/produção que
 * distorceu a primeira rodada de treino.
 */
async function fetchCandidates(params: {
  userId: string;
  categoryId?: string;
  anchor: { lat: number; lng: number } | null;
  limit: number;
}): Promise<CandidateRow[]> {
  const { userId, categoryId, anchor, limit } = params;

  const point = anchor
    ? Prisma.sql`ST_SetSRID(ST_MakePoint(${anchor.lng}, ${anchor.lat}), 4326)`
    : null;

  const distanceSelect = point
    ? Prisma.sql`(ST_DistanceSphere(p."location"::geometry, ${point}) / 1000.0)`
    : Prisma.sql`NULL::double precision`;

  const filters: Prisma.Sql[] = [
    Prisma.sql`u."isActive" = true`,
    Prisma.sql`p."available" = true`,
  ];
  if (categoryId) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ProviderCategory" pc
       WHERE pc."providerId" = p."id" AND pc."categoryId" = ${categoryId}
    )`);
  }
  if (point) {
    // Índice GiST acelera o filtro; quem não tem coordenada continua elegível
    // para não sumir do catálogo por falta de cadastro.
    filters.push(Prisma.sql`(
      p."location" IS NULL
      OR ST_DWithin(p."location", ${point}::geography, ${CANDIDATE_RADIUS_KM * 1000})
    )`);
  }

  const ordering = point
    ? Prisma.sql`ORDER BY p."location" IS NULL, ${distanceSelect} ASC`
    : Prisma.sql`ORDER BY p."ratingAvg" DESC`;

  return prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    SELECT
      p."id"                                        AS id,
      p."priceFrom"                                 AS price_from,
      p."yearsExp"                                  AS years_exp,
      p."ratingAvg"                                 AS rating_avg,
      p."ratingCount"                               AS rating_count,
      (p."kycStatus" = 'VERIFIED')                  AS verified,
      p."available"                                 AS available,
      EXTRACT(EPOCH FROM (now() - p."createdAt")) / 86400.0 AS tenure_days,
      ${distanceSelect}                             AS distance_km,
      (u."neighborhood" IS NOT NULL AND u."neighborhood" = cli."neighborhood") AS same_neighborhood,
      (u."city" IS NOT NULL AND u."city" = cli."city")                         AS same_city,
      COALESCE(cats.ids, ARRAY[]::text[])           AS category_ids,
      COALESCE(agg.completed, 0)                    AS completed_count,
      COALESCE(agg.cancelled, 0)                    AS cancelled_count,
      COALESCE(agg.accepted, 0)                     AS accepted_count,
      COALESCE(agg.requested, 0)                    AS requested_count,
      agg.median_response_hours                     AS median_response_hours,
      COALESCE(pair.bookings, 0)                    AS prior_bookings_with_client,
      COALESCE(pair.completed, 0)                   AS prior_completed_with_client,
      pair.days_since_last                          AS days_since_last_with_client,
      svc.median_price                              AS service_median_price
    FROM "ProviderProfile" p
    JOIN "User" u   ON u."id" = p."userId"
    CROSS JOIN (
      SELECT "city", "neighborhood" FROM "User" WHERE "id" = ${userId}
    ) cli
    LEFT JOIN LATERAL (
      SELECT ARRAY_AGG(pc."categoryId" ORDER BY pc."categoryId") AS ids
        FROM "ProviderCategory" pc WHERE pc."providerId" = p."id"
    ) cats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE b."status" = 'COMPLETED')::int AS completed,
        COUNT(*) FILTER (WHERE b."status" = 'CANCELLED')::int AS cancelled,
        COUNT(*) FILTER (WHERE b."status" IN ('ACCEPTED','IN_PROGRESS','COMPLETED'))::int AS accepted,
        COUNT(*)::int AS requested,
        PERCENTILE_CONT(0.5) WITHIN GROUP (
          ORDER BY EXTRACT(EPOCH FROM (b."updatedAt" - b."createdAt")) / 3600.0
        ) FILTER (WHERE b."status" IN ('ACCEPTED','IN_PROGRESS','COMPLETED'))::double precision
          AS median_response_hours
      FROM "Booking" b WHERE b."providerId" = p."id"
    ) agg ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS bookings,
        COUNT(*) FILTER (WHERE b."status" = 'COMPLETED')::int AS completed,
        EXTRACT(EPOCH FROM (now() - MAX(b."createdAt"))) / 86400.0 AS days_since_last
      FROM "Booking" b
      WHERE b."providerId" = p."id" AND b."clientId" = ${userId}
    ) pair ON TRUE
    LEFT JOIN LATERAL (
      SELECT PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY s."priceMin")::double precision AS median_price
        FROM "ProviderService" s WHERE s."providerId" = p."id"
    ) svc ON TRUE
    WHERE ${Prisma.join(filters, ' AND ')}
    ${ordering}
    LIMIT ${limit}
  `);
}

function toMlCandidate(c: CandidateRow): Record<string, unknown> {
  return {
    provider_id: c.id,
    category_ids: c.category_ids ?? [],
    price_from: Number(c.price_from) || 0,
    years_exp: Number(c.years_exp) || 0,
    jobs_done: Number(c.completed_count) || 0,
    rating_avg: Number(c.rating_avg) || 0,
    rating_count: Number(c.rating_count) || 0,
    verified: Boolean(c.verified),
    available: Boolean(c.available),
    tenure_days: Number(c.tenure_days) || 0,
    distance_km: c.distance_km === null ? null : Number(c.distance_km),
    same_neighborhood: Boolean(c.same_neighborhood),
    same_city: Boolean(c.same_city),
    completed_count: Number(c.completed_count) || 0,
    cancelled_count: Number(c.cancelled_count) || 0,
    accepted_count: Number(c.accepted_count) || 0,
    requested_count: Number(c.requested_count) || 0,
    median_response_hours:
      c.median_response_hours === null ? null : Number(c.median_response_hours),
    prior_bookings_with_client: Number(c.prior_bookings_with_client) || 0,
    prior_completed_with_client: Number(c.prior_completed_with_client) || 0,
    days_since_last_with_client:
      c.days_since_last_with_client === null ? null : Number(c.days_since_last_with_client),
    service_median_price:
      c.service_median_price === null ? null : Number(c.service_median_price),
  };
}

// ── Telemetria ────────────────────────────────────────────────────────────

export interface RecEventInput {
  providerId: string;
  type: 'IMPRESSION' | 'CLICK';
  position: number;
  score?: number | null;
  modelVersion?: string | null;
  strategy?: string | null;
  categoryId?: string | null;
}

/**
 * Registra impressões e cliques do carrossel.
 *
 * Note que `BOOKED` NÃO entra por aqui: conversão é emitida pelo servidor, no
 * fluxo de criação de booking. Confiar no cliente para reportar conversão seria
 * abrir a porta para envenenar os dados de treino.
 */
export async function trackEvents(
  userId: string,
  requestId: string,
  events: RecEventInput[],
): Promise<number> {
  if (events.length === 0) return 0;

  const providerIds = [...new Set(events.map((e) => e.providerId))];
  const existentes = await prisma.providerProfile.findMany({
    where: { id: { in: providerIds } },
    select: { id: true },
  });
  const validos = new Set(existentes.map((p) => p.id));

  const result = await prisma.recEvent.createMany({
    data: events
      .filter((e) => validos.has(e.providerId))
      .map((e) => ({
        requestId,
        userId,
        providerId: e.providerId,
        type: e.type,
        position: e.position,
        score: e.score ?? null,
        modelVersion: e.modelVersion ?? null,
        strategy: e.strategy ?? null,
        categoryId: e.categoryId ?? null,
      })),
  });
  return result.count;
}

/** Conversão, emitida pelo servidor quando um booking nasce de uma recomendação. */
export async function trackBooked(params: {
  userId: string;
  providerId: string;
  requestId: string;
  categoryId?: string | null;
}): Promise<void> {
  try {
    await prisma.recEvent.create({
      data: {
        requestId: params.requestId,
        userId: params.userId,
        providerId: params.providerId,
        type: 'BOOKED',
        position: 0,
        categoryId: params.categoryId ?? null,
      },
    });
  } catch (err) {
    // Telemetria nunca pode derrubar a criação de um booking.
    logger.warn({ err }, 'falha ao registrar conversão de recomendação');
  }
}
