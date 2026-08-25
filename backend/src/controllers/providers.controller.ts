import type { ProviderSort } from '../services/providers.service';
import { getProviderById, listProviders } from '../services/providers.service';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { cacheKeys, withCache } from '../services/cache.service';
import { asyncHandler } from '../utils/asyncHandler';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const DEFAULT_SORT: ProviderSort = 'rating';

export const list = asyncHandler(async (req, res) => {
  // `proListQuery` already coerced/validated these, so numbers arrive as numbers.
  const q = req.query as unknown as {
    category?: string;
    city?: string;
    q?: string;
    sort?: ProviderSort;
    verified?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
    page?: number;
    perPage?: number;
  };
  const result = await listProviders({
    category: q.category,
    city: q.city,
    q: q.q,
    sort: q.sort ?? DEFAULT_SORT,
    verified: q.verified === 'true',
    lat: q.lat,
    lng: q.lng,
    radiusKm: q.radiusKm,
    page: q.page ?? DEFAULT_PAGE,
    perPage: q.perPage ?? DEFAULT_PER_PAGE,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req, res) => {
  const provider = await getProviderById(req.params.id);
  res.json(provider);
});

/**
 * Categorias mudam por deploy, não por requisição, e toda abertura da Home as pede.
 * É o cache de melhor relação ganho/risco do sistema.
 */
export const listCategories = asyncHandler(async (_req, res) => {
  const items = await withCache(cacheKeys.categories, env.CACHE_TTL_CATEGORIES_SEC, () =>
    prisma.category.findMany({ orderBy: { order: 'asc' } }),
  );
  res.json({ items });
});
