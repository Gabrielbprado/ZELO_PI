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
  page: number;
  perPage: number;
}

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
    items: items.map(serializeProvider),
    total,
    page: opts.page,
    perPage: opts.perPage,
  };
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

type ProviderRow = Prisma.ProviderProfileGetPayload<{
  include: typeof LIST_PROVIDER_INCLUDE;
}> & {
  services?: Prisma.ProviderServiceGetPayload<true>[];
  portfolio?: Prisma.PortfolioItemGetPayload<true>[];
};

function serializeProvider(p: ProviderRow) {
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
    categories: p.categories.map((c) => c.category),
    services: p.services,
    portfolio: p.portfolio,
  };
}
