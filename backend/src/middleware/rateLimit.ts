import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { ErrorCode } from '../constants/http';
import { ONE_MINUTE_MS } from '../constants/time';

const AUTH_WINDOW_MS = 15 * ONE_MINUTE_MS;

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitas requisições. Tente novamente mais tarde.',
    },
  },
});

/**
 * Limite próprio para a telemetria de recomendação.
 *
 * Impressões são tagarelas: um usuário rolando a Home gera várias por sessão.
 * Sem um limite dedicado, esses eventos consumiriam o orçamento do
 * `generalLimiter` (200/15min) e o app passaria a receber 429 em requisições
 * que realmente importam.
 */
export const telemetryLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitos eventos de telemetria.',
    },
  },
});

export const authLimiter = rateLimit({
  windowMs: AUTH_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    error: {
      code: ErrorCode.TOO_MANY_REQUESTS,
      message: 'Muitas tentativas de autenticação. Aguarde alguns minutos.',
    },
  },
});
