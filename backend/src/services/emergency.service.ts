import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors';

export interface EmergencyMatchInput {
  categoryId: string;
  city?: string;
  neighborhood?: string;
}

const MAX_CANDIDATES = 5;
const ETA_BASE_MIN = 12;
const ETA_JITTER_MIN = 20;
const DISTANCE_BASE_KM = 1;
const DISTANCE_JITTER_KM = 4;
const DISTANCE_PRECISION = 1;

const EMERGENCY_INCLUDE = {
  user: {
    select: { id: true, name: true, avatarHue: true, city: true, neighborhood: true },
  },
  categories: { include: { category: true } },
} as const satisfies Prisma.ProviderProfileInclude;

type EmergencyCandidate = Prisma.ProviderProfileGetPayload<{ include: typeof EMERGENCY_INCLUDE }>;

/**
 * Pick the highest-rated verified, available provider for an emergency.
 * In production this would also consider real distance (PostGIS) and
 * historical response time. Here we use city/neighbourhood as a proxy.
 */
export async function findEmergencyMatch(opts: EmergencyMatchInput) {
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
