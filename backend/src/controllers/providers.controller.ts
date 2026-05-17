import type { ProviderSort } from '../services/providers.service';
import { getProviderById, listProviders } from '../services/providers.service';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../utils/asyncHandler';

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const DEFAULT_SORT: ProviderSort = 'rating';

export const list = asyncHandler(async (req, res) => {
  const q = req.query as Record<string, string>;
  const result = await listProviders({
    category: q.category,
    city: q.city,
    q: q.q,
    sort: (q.sort as ProviderSort | undefined) ?? DEFAULT_SORT,
    verified: q.verified === 'true',
    page: Number(q.page) || DEFAULT_PAGE,
    perPage: Number(q.perPage) || DEFAULT_PER_PAGE,
  });
  res.json(result);
});

export const getById = asyncHandler(async (req, res) => {
  const provider = await getProviderById(req.params.id);
  res.json(provider);
});

export const listCategories = asyncHandler(async (_req, res) => {
  const items = await prisma.category.findMany({ orderBy: { order: 'asc' } });
  res.json({ items });
});
