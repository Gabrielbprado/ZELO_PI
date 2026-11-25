import { z } from 'zod';
import { uuidParam } from './common';

const DOC_TYPES = ['CPF', 'RG', 'CNH', 'ADDRESS_PROOF', 'CERTIFICATE'] as const;
const REPORT_REASONS = ['INAPPROPRIATE', 'FRAUD', 'NO_SHOW', 'SAFETY', 'OTHER'] as const;
const REPORT_STATUSES = ['OPEN', 'REVIEWING', 'AWAITING_INFO', 'RESOLVED', 'DISMISSED'] as const;
const REPORT_TARGETS = ['USER', 'SERVICE', 'CONVERSATION'] as const;
/** Decisões que um admin aplica. `AI_CLASSIFIED` fica de fora: é registro, não ação. */
const MODERATION_ACTIONS = ['ACCEPT', 'REJECT', 'REQUEST_INFO', 'WARN', 'SUSPEND', 'BLOCK', 'UNBLOCK'] as const;
const MAX_EVIDENCE = 5;
const MAX_SUSPEND_DAYS = 365;

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
  body: z
    .object({
      targetType: z.enum(REPORT_TARGETS).default('USER'),
      targetUserId: z.string().uuid().optional(),
      serviceId: z.string().uuid().optional(),
      reason: z.enum(REPORT_REASONS),
      description: z.string().trim().max(1000).optional(),
      bookingId: z.string().uuid().optional(),
      // Referências/links das evidências, como no KYC — o upload é externo. O limite
      // existe para que a denúncia não vire um vetor de despejo de texto.
      evidence: z.array(z.string().trim().min(1).max(500)).max(MAX_EVIDENCE).optional(),
    })
    .refine((v) => (v.targetType === 'SERVICE' ? Boolean(v.serviceId) : Boolean(v.targetUserId)), {
      message: 'Informe serviceId ao denunciar um serviço, ou targetUserId nos demais casos',
    }),
};

export const moderationActionSchema = {
  params: uuidParam,
  body: z
    .object({
      action: z.enum(MODERATION_ACTIONS),
      reason: z.string().trim().max(500).optional(),
      days: z.number().int().positive().max(MAX_SUSPEND_DAYS).optional(),
    })
    // Suspensão com prazo absurdo é bloqueio disfarçado — e bloqueio tem nome próprio,
    // texto próprio para o usuário e caminho de reversão próprio.
    .refine((v) => v.action === 'SUSPEND' || v.days === undefined, {
      message: '`days` só se aplica a SUSPEND',
    }),
};

export const reportStatusSchema = {
  params: uuidParam,
  body: z.object({ status: z.enum(REPORT_STATUSES) }),
};

export const reportListQuery = {
  query: z.object({ status: z.enum(REPORT_STATUSES).optional() }),
};
