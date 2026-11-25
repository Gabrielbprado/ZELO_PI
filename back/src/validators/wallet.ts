import { z } from 'zod';

export const payoutSchema = {
  body: z.object({
    amountCents: z.number().int().positive().max(100_000_000),
    pixKey: z.string().trim().min(1).max(140),
  }),
};

export const statementQuery = {
  query: z.object({ cursor: z.string().uuid().optional() }),
};
