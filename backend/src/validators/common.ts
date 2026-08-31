import { z } from 'zod';

const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_ADDRESS_LENGTH = 240;
const MAX_PRICE = 1_000_000;
const MAX_COMMENT_LENGTH = 1000;
const MAX_CONTENT_LENGTH = 2000;
const MAX_QUERY_LENGTH = 80;
const MAX_CITY_LENGTH = 80;
const MAX_CATEGORY_ID_LENGTH = 40;
const MIN_TITLE_LENGTH = 3;
const MIN_RATING = 1;
const MAX_RATING = 5;
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const MAX_RADIUS_KM = 500;

export const uuidParam = z.object({
  id: z.string().uuid('ID inválido'),
});

export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const proListQuery = z.object({
  category: z.string().min(1).max(MAX_CATEGORY_ID_LENGTH).optional(),
  city: z.string().min(1).max(MAX_CITY_LENGTH).optional(),
  q: z.string().trim().min(1).max(MAX_QUERY_LENGTH).optional(),
  sort: z.enum(['rating', 'distance', 'price']).default('rating'),
  verified: z.enum(['true', 'false']).optional(),
  lat: z.coerce.number().min(MIN_LATITUDE).max(MAX_LATITUDE).optional(),
  lng: z.coerce.number().min(MIN_LONGITUDE).max(MAX_LONGITUDE).optional(),
  radiusKm: z.coerce.number().positive().max(MAX_RADIUS_KM).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const bookingCreateSchema = {
  body: z.object({
    providerId: z.string().uuid(),
    categoryId: z.string().min(1).max(MAX_CATEGORY_ID_LENGTH),
    title: z.string().trim().min(MIN_TITLE_LENGTH).max(MAX_TITLE_LENGTH),
    description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
    address: z.string().trim().min(MIN_TITLE_LENGTH).max(MAX_ADDRESS_LENGTH),
    scheduledAt: z.string().datetime().optional(),
    urgency: z.enum(['EMERGENCY', 'TODAY', 'THIS_WEEK', 'FLEXIBLE']).default('FLEXIBLE'),
    priceEstimate: z.number().int().min(0).max(MAX_PRICE).optional(),
    // Origem de recomendação: o requestId do card que levou a este booking. Opcional,
    // e sem `.uuid()` de propósito — o id do carrossel não é um UUID.
    requestId: z.string().trim().min(1).max(64).optional(),
  }),
};

export const bookingUpdateStatus = {
  body: z.object({
    status: z.enum(['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    priceFinal: z.number().int().min(0).max(MAX_PRICE).optional(),
  }),
  params: uuidParam,
};

export const reviewSchema = {
  body: z.object({
    bookingId: z.string().uuid(),
    rating: z.number().int().min(MIN_RATING).max(MAX_RATING),
    comment: z.string().trim().max(MAX_COMMENT_LENGTH).optional(),
  }),
};

export const messageSchema = {
  body: z.object({
    receiverId: z.string().uuid(),
    bookingId: z.string().uuid().optional(),
    content: z.string().trim().min(1).max(MAX_CONTENT_LENGTH),
  }),
};

export const budgetSchema = {
  body: z.object({
    categoryId: z.string().min(1).max(MAX_CATEGORY_ID_LENGTH),
    answers: z.record(z.string().min(1)),
  }),
};
