import { z } from 'zod';
import { uuidParam } from './common';

const DOC_TYPES = ['CPF', 'RG', 'CNH', 'ADDRESS_PROOF', 'CERTIFICATE'] as const;
const REPORT_REASONS = ['INAPPROPRIATE', 'FRAUD', 'NO_SHOW', 'SAFETY', 'OTHER'] as const;
const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED'] as const;

export const documentSchema = {
  body: z.object({
    type: z.enum(DOC_TYPES),
    // Referência ao arquivo (URL/chave de storage). O upload em si é externo.
    fileKey: z.string().trim().min(1).max(500),
  }),
};

export const rejectSchema = {
  params: uuidParam,
  body: z.object({ reason: z.string().trim().min(3).max(300) }),
};

export const reportCreateSchema = {
  body: z.object({
    targetUserId: z.string().uuid(),
    reason: z.enum(REPORT_REASONS),
    description: z.string().trim().max(1000).optional(),
    bookingId: z.string().uuid().optional(),
  }),
};

export const reportStatusSchema = {
  params: uuidParam,
  body: z.object({ status: z.enum(REPORT_STATUSES) }),
};

export const reportListQuery = {
  query: z.object({ status: z.enum(REPORT_STATUSES).optional() }),
};
