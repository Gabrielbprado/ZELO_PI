import { z } from 'zod';
import { MAX_REC_EVENTS_PER_BATCH, MAX_REC_LIMIT } from '../constants/recommendations';

export const forYouQuery = z.object({
  categoryId: z.string().min(1).max(40).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_REC_LIMIT).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

export const recEventsSchema = {
  body: z.object({
    requestId: z.string().uuid(),
    events: z
      .array(
        z.object({
          providerId: z.string().uuid(),
          // `BOOKED` é emitido pelo servidor; o cliente só reporta o que ele
          // realmente observa (o que apareceu e o que foi tocado).
          type: z.enum(['IMPRESSION', 'CLICK']),
          position: z.number().int().min(0).max(100),
          score: z.number().nullable().optional(),
          modelVersion: z.string().max(80).nullable().optional(),
          strategy: z.string().max(40).nullable().optional(),
          categoryId: z.string().max(40).nullable().optional(),
        }),
      )
      .min(1)
      .max(MAX_REC_EVENTS_PER_BATCH),
  }),
};
