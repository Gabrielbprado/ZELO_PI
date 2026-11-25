import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors';

export interface EmergencyMatchInput {
  categoryId: string;
  city?: string;
  neighborhood?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}

const MAX_CANDIDATES = 5;
const ETA_BASE_MIN = 12;
const ETA_JITTER_MIN = 20;
const DISTANCE_BASE_KM = 1;
const DISTANCE_JITTER_KM = 4;
const DISTANCE_PRECISION = 1;
const KM_IN_METERS = 1000;

// When we know the real distance, estimate ETA from an urban average speed
// plus a fixed dispatch buffer instead of a random jitter.
const URBAN_SPEED_KMH = 28;
const DISPATCH_BUFFER_MIN = 6;
const MIN_ETA_MIN = 5;

const EMERGENCY_INCLUDE = {
  user: {
    select: { id: true, name: true, avatarHue: true, city: true, neighborhood: true },
  },
  categories: { include: { category: true } },
} as const satisfies Prisma.ProviderProfileInclude;

type EmergencyCandidate = Prisma.ProviderProfileGetPayload<{ include: typeof EMERGENCY_INCLUDE }>;

/**
 * Pick the best verified, available provider for an emergency.
 *
 * When the caller supplies coordinates we rank by REAL distance using PostGIS
 * (`ST_DistanceSphere`, optionally bounded by `radiusKm` via the GiST-indexed
 * `ST_DWithin`). Without coordinates — or when no geolocated provider is in
 * range — we fall back to the previous city/neighbourhood + rating heuristic.
 */
export async function findEmergencyMatch(opts: EmergencyMatchInput) {
  if (opts.lat !== undefined && opts.lng !== undefined) {
    const geoMatch = await findClosestByDistance({ ...opts, lat: opts.lat, lng: opts.lng });
    if (geoMatch) return geoMatch;
  }
  return findByRatingProxy(opts);
}

async function findClosestByDistance(
  opts: EmergencyMatchInput & { lat: number; lng: number },
) {
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)`;
  const radiusFilter =
    opts.radiusKm !== undefined
      ? Prisma.sql`AND ST_DWithin(p."location", ${point}::geography, ${opts.radiusKm * KM_IN_METERS})`
      : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ id: string; distance_m: number }>>(Prisma.sql`
    SELECT p.id, ST_DistanceSphere(p."location"::geometry, ${point}) AS distance_m
      FROM "ProviderProfile" p
      JOIN "User" u ON u.id = p."userId"
     WHERE p."location" IS NOT NULL
       AND p."kycStatus" = 'VERIFIED'
       AND p."available" = true
       AND u."isActive" = true
       AND EXISTS (
         SELECT 1 FROM "ProviderCategory" pc
          WHERE pc."providerId" = p.id AND pc."categoryId" = ${opts.categoryId}
       )
       ${radiusFilter}
     ORDER BY distance_m ASC
     LIMIT ${MAX_CANDIDATES}
  `);

  if (rows.length === 0) return null;

  const closest = rows[0];
  const provider = await prisma.providerProfile.findUnique({
    where: { id: closest.id },
    include: EMERGENCY_INCLUDE,
  });
  if (!provider) return null;

  const distanceKm = Number((closest.distance_m / KM_IN_METERS).toFixed(DISTANCE_PRECISION));
  return {
    provider: serializeEmergencyProvider(provider),
    etaMin: estimateEtaMin(distanceKm),
    distanceKm,
    nearbyCount: rows.length,
  };
}

function estimateEtaMin(distanceKm: number): number {
  const travel = (distanceKm / URBAN_SPEED_KMH) * 60;
  return Math.max(MIN_ETA_MIN, Math.round(travel + DISPATCH_BUFFER_MIN));
}

async function findByRatingProxy(opts: EmergencyMatchInput) {
  const candidates = await prisma.providerProfile.findMany({
    where: {
      kycStatus: 'VERIFIED',
      available: true,
      categories: { some: { categoryId: opts.categoryId } },
      user: {
        isActive: true,
        ...(opts.city && { city: opts.city }),
      },
    },
    orderBy: [{ ratingAvg: 'desc' }, { jobsDone: 'desc' }],
    take: MAX_CANDIDATES,
    include: EMERGENCY_INCLUDE,
  });

  if (candidates.length === 0) {
    throw new NotFoundError('Sem profissionais disponíveis para emergência no momento');
  }

  const best = preferNeighborhoodMatch(candidates, opts.neighborhood) ?? candidates[0];
  return {
    provider: serializeEmergencyProvider(best),
    etaMin: ETA_BASE_MIN + Math.floor(Math.random() * ETA_JITTER_MIN),
    distanceKm: Number(
      (DISTANCE_BASE_KM + Math.random() * DISTANCE_JITTER_KM).toFixed(DISTANCE_PRECISION),
    ),
    nearbyCount: candidates.length,
  };
}

function preferNeighborhoodMatch(
  candidates: EmergencyCandidate[],
  neighborhood?: string,
): EmergencyCandidate | undefined {
  if (!neighborhood) return undefined;
  return candidates.find((p) => p.user.neighborhood === neighborhood);
}

function serializeEmergencyProvider(p: EmergencyCandidate) {
  return {
    id: p.id,
    userId: p.user.id,
    name: p.user.name,
    avatarHue: p.user.avatarHue,
    neighborhood: p.user.neighborhood,
    rating: p.ratingAvg,
    jobsDone: p.jobsDone,
    priceFrom: p.priceFrom,
    categories: p.categories.map((c) => c.category),
    verified: true,
  };
}
