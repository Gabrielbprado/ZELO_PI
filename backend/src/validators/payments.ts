import { z } from 'zod';

export const paymentCreateSchema = {
  body: z.object({
    bookingId: z.string().uuid(),
    method: z.enum(['pix', 'card']),
  }),
};

export const bookingIdParam = z.object({
  bookingId: z.string().uuid(),
});
