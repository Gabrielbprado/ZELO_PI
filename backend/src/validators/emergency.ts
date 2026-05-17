import { z } from 'zod';

const MAX_CATEGORY_ID_LENGTH = 40;
const MAX_LOCATION_LENGTH = 80;

export const emergencyMatchSchema = {
  body: z.object({
    categoryId: z.string().min(1).max(MAX_CATEGORY_ID_LENGTH),
    city: z.string().trim().max(MAX_LOCATION_LENGTH).optional(),
    neighborhood: z.string().trim().max(MAX_LOCATION_LENGTH).optional(),
  }),
};
