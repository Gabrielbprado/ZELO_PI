import { z } from 'zod';
import { uuidParam } from './common';

const MAX_BIO_LENGTH = 2000;
const MAX_YEARS_EXP = 80;
const MAX_PRICE = 1_000_000;
const MAX_CATEGORIES = 20;
const MAX_TITLE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_UNIT_LENGTH = 40;
const MAX_CATEGORY_ID_LENGTH = 40;
const MIN_TITLE_LENGTH = 2;
const LATITUDE_RANGE = [-90, 90] as const;
const LONGITUDE_RANGE = [-180, 180] as const;

export const profileUpdateSchema = {
  body: z.object({
    bio: z.string().trim().max(MAX_BIO_LENGTH).optional().or(z.literal('')),
    yearsExp: z.number().int().min(0).max(MAX_YEARS_EXP).optional(),
    priceFrom: z.number().int().min(0).max(MAX_PRICE).optional(),
    available: z.boolean().optional(),
    latitude: z.number().min(LATITUDE_RANGE[0]).max(LATITUDE_RANGE[1]).optional(),
    longitude: z.number().min(LONGITUDE_RANGE[0]).max(LONGITUDE_RANGE[1]).optional(),
    categoryIds: z
      .array(z.string().min(1).max(MAX_CATEGORY_ID_LENGTH))
      .max(MAX_CATEGORIES)
      .optional(),
  }),
};

const serviceBodySchema = z.object({
  title: z.string().trim().min(MIN_TITLE_LENGTH).max(MAX_TITLE_LENGTH),
  description: z.string().trim().max(MAX_DESCRIPTION_LENGTH).optional(),
  categoryId: z.string().min(1).max(MAX_CATEGORY_ID_LENGTH),
  priceMin: z.number().int().min(0).max(MAX_PRICE),
  priceMax: z.number().int().min(0).max(MAX_PRICE).optional(),
  unit: z.string().trim().min(1).max(MAX_UNIT_LENGTH).optional(),
});

export const serviceCreateSchema = { body: serviceBodySchema };

export const serviceUpdateSchema = {
  body: serviceBodySchema.partial(),
  params: uuidParam,
};
