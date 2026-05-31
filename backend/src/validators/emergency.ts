import { z } from 'zod';

const MAX_CATEGORY_ID_LENGTH = 40;
const MAX_LOCATION_LENGTH = 80;
const MIN_LATITUDE = -90;
const MAX_LATITUDE = 90;
const MIN_LONGITUDE = -180;
const MAX_LONGITUDE = 180;
const MAX_RADIUS_KM = 500;

export const emergencyMatchSchema = {
  body: z.object({
    categoryId: z.string().min(1).max(MAX_CATEGORY_ID_LENGTH),
    city: z.string().trim().max(MAX_LOCATION_LENGTH).optional(),
    neighborhood: z.string().trim().max(MAX_LOCATION_LENGTH).optional(),
    lat: z.number().min(MIN_LATITUDE).max(MAX_LATITUDE).optional(),
    lng: z.number().min(MIN_LONGITUDE).max(MAX_LONGITUDE).optional(),
    radiusKm: z.number().positive().max(MAX_RADIUS_KM).optional(),
  }),
};
