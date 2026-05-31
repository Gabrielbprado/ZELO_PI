import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors';

export type ProviderSort = 'rating' | 'price' | 'distance';

export interface ListProvidersOptions {
  category?: string;
  city?: string;
  verified?: boolean;
  sort?: ProviderSort;
  q?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
  page: number;
  perPage: number;
}

const KM_IN_METERS = 1000;
const DISTANCE_PRECISION = 2;

const LIST_PROVIDER_INCLUDE = {
  user: {
    select: { id: true, name: true, avatarHue: true, city: true, neighborhood: true },
  },
  categories: { include: { category: true } },
} as const;

const DETAIL_PROVIDER_INCLUDE = {
  ...LIST_PROVIDER_INCLUDE,
  services: true,
  portfolio: true,
} as const;

export async function listProviders(opts: ListProvidersOptions) {
  if (opts.sort === 'distance' && opts.lat !== undefined && opts.lng !== undefined) {
    return listProvidersByDistance({ ...opts, lat: opts.lat, lng: opts.lng });
  }

  const where = buildProviderListWhere(opts);
  const orderBy: Prisma.ProviderProfileOrderByWithRelationInput =
    opts.sort === 'price' ? { priceFrom: 'asc' } : { ratingAvg: 'desc' };

  const [items, total] = await Promise.all([
    prisma.providerProfile.findMany({
      where,
      orderBy,
      skip: (opts.page - 1) * opts.perPage,
      take: opts.perPage,
      include: LIST_PROVIDER_INCLUDE,
    }),
    prisma.providerProfile.count({ where }),
  ]);

  return {
    items: items.map((p) => serializeProvider(p)),
    total,
    page: opts.page,
    perPage: opts.perPage,
  };
}

/**
 * Rank providers by real distance from the requester using PostGIS.
 *
 * `location` is a `geography(Point, 4326)` column that Prisma cannot select,
 * so we run a raw query to get the ordered ids + distance, then hydrate the
 * full rows with the normal client and re-apply the ordering. `ST_DWithin`
 * (when a radius is given) is index-accelerated by the GiST index.
 */
async function listProvidersByDistance(
  opts: ListProvidersOptions & { lat: number; lng: number },
) {
  const point = Prisma.sql`ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)`;
  const where = buildDistanceWhere(opts, point);

  const offset = (opts.page - 1) * opts.perPage;
  const [rows, countRows] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; distance_m: number }>>(Prisma.sql`
      SELECT p.id, ST_DistanceSphere(p."location"::geometry, ${point}) AS distance_m
        FROM "ProviderProfile" p
        JOIN "User" u ON u.id = p."userId"
       WHERE ${where}
       ORDER BY distance_m ASC
       LIMIT ${opts.perPage} OFFSET ${offset}
    `),
    prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
      SELECT COUNT(*)::int AS count
        FROM "ProviderProfile" p
        JOIN "User" u ON u.id = p."userId"
       WHERE ${where}
    `),
  ]);

  const found = await prisma.providerProfile.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    include: LIST_PROVIDER_INCLUDE,
  });
  const byId = new Map(found.map((p) => [p.id, p]));

  const items = rows
    .map((r) => {
      const provider = byId.get(r.id);
      return provider ? serializeProvider(provider, metersToKm(r.distance_m)) : undefined;
    })
    .filter((p): p is ReturnType<typeof serializeProvider> => p !== undefined);

  return {
    items,
    total: countRows[0]?.count ?? items.length,
    page: opts.page,
    perPage: opts.perPage,
  };
}

function buildDistanceWhere(opts: ListProvidersOptions, point: Prisma.Sql): Prisma.Sql {
  const filters: Prisma.Sql[] = [
    Prisma.sql`p."location" IS NOT NULL`,
    Prisma.sql`u."isActive" = true`,
  ];
  if (opts.city) filters.push(Prisma.sql`u."city" = ${opts.city}`);
  if (opts.verified) filters.push(Prisma.sql`p."kycStatus" = 'VERIFIED'`);
  if (opts.category) {
    filters.push(Prisma.sql`EXISTS (
      SELECT 1 FROM "ProviderCategory" pc
       WHERE pc."providerId" = p.id AND pc."categoryId" = ${opts.category}
    )`);
  }
  if (opts.radiusKm !== undefined) {
    filters.push(
      Prisma.sql`ST_DWithin(p."location", ${point}::geography, ${opts.radiusKm * KM_IN_METERS})`,
    );
  }
  return Prisma.join(filters, ' AND ');
}

export async function getProviderById(id: string) {
  const provider = await prisma.providerProfile.findUnique({
    where: { id },
    include: DETAIL_PROVIDER_INCLUDE,
  });
  if (!provider) throw new NotFoundError('Profissional não encontrado');
  return serializeProvider(provider);
}

function buildProviderListWhere(opts: ListProvidersOptions): Prisma.ProviderProfileWhereInput {
  const query = opts.q?.trim();
  return {
    user: {
      isActive: true,
      ...(opts.city && { city: opts.city }),
      ...(query && { name: { contains: query, mode: 'insensitive' } }),
    },
    ...(opts.verified && { kycStatus: 'VERIFIED' }),
    ...(opts.category && { categories: { some: { categoryId: opts.category } } }),
    ...(query &&
      !opts.category && {
        OR: [
          { user: { name: { contains: query, mode: 'insensitive' } } },
          { bio: { contains: query, mode: 'insensitive' } },
          { categories: { some: { category: { name: { contains: query, mode: 'insensitive' } } } } },
          { services: { some: { title: { contains: query, mode: 'insensitive' } } } },
        ],
      }),
  };
}

function metersToKm(meters: number): number {
  return Number((meters / KM_IN_METERS).toFixed(DISTANCE_PRECISION));
}

type ProviderRow = Prisma.ProviderProfileGetPayload<{
  include: typeof LIST_PROVIDER_INCLUDE;
}> & {
  services?: Prisma.ProviderServiceGetPayload<true>[];
  portfolio?: Prisma.PortfolioItemGetPayload<true>[];
};

function serializeProvider(p: ProviderRow, distanceKm?: number) {
  return {
    id: p.id,
    userId: p.userId,
    name: p.user.name,
    avatarHue: p.user.avatarHue,
    city: p.user.city,
    neighborhood: p.user.neighborhood,
    bio: p.bio,
    yearsExp: p.yearsExp,
    jobsDone: p.jobsDone,
    rating: p.ratingAvg,
    reviews: p.ratingCount,
    verified: p.kycStatus === 'VERIFIED',
    available: p.available,
    priceFrom: p.priceFrom,
    distanceKm: distanceKm ?? null,
    categories: p.categories.map((c) => c.category),
    services: p.services,
    portfolio: p.portfolio,
  };
}
