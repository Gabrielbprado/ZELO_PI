import { z } from 'zod';
import { uuidParam } from './common';

const MINUTES_IN_DAY = 1440;

export const setAvailabilitySchema = {
  body: z.object({
    rules: z
      .array(
        z.object({
          weekday: z.number().int().min(0).max(6),
          startMinute: z.number().int().min(0).max(MINUTES_IN_DAY),
          endMinute: z.number().int().min(0).max(MINUTES_IN_DAY),
        }),
      )
      .max(50),
  }),
};

export const timeOffSchema = {
  body: z.object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(200).optional(),
  }),
};

export const slotsSchema = {
  params: uuidParam,
  query: z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD') }),
};
