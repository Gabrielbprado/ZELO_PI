import { z } from 'zod';

const cardSchema = z.object({
  holderName: z.string().min(2).max(80),
  number: z.string().regex(/^\d{13,19}$/, 'Número do cartão inválido'),
  expiryMonth: z.string().regex(/^(0[1-9]|1[0-2])$/, 'Mês inválido'),
  expiryYear: z.string().regex(/^\d{4}$/, 'Ano inválido (AAAA)'),
  ccv: z.string().regex(/^\d{3,4}$/, 'CVV inválido'),
});

const cardHolderInfoSchema = z.object({
  postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'CEP inválido'),
  addressNumber: z.string().min(1).max(10),
  phone: z.string().regex(/^\d{10,11}$/, 'Telefone inválido (apenas dígitos, com DDD)'),
});

export const paymentCreateSchema = {
  body: z.object({
    bookingId: z.string().uuid(),
    method: z.enum(['pix', 'cash', 'credit_card', 'debit_card']),
    installments: z.number().int().min(1).max(12).optional(),
    card: cardSchema.optional(),
    cardHolderInfo: cardHolderInfoSchema.optional(),
    idempotencyKey: z.string().uuid().optional(),
  }).superRefine((data, ctx) => {
    if (data.method === 'credit_card' || data.method === 'debit_card') {
      if (!data.card) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['card'], message: 'card é obrigatório para pagamento com cartão' });
      }
      if (!data.cardHolderInfo) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cardHolderInfo'], message: 'cardHolderInfo é obrigatório para pagamento com cartão' });
      }
      if (!data.installments) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['installments'], message: 'installments é obrigatório para pagamento com cartão' });
      }
    }
  }),
};

export const bookingIdParam = z.object({
  bookingId: z.string().uuid(),
});
