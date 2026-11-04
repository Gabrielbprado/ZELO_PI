import * as Sentry from '@sentry/node';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Sentry para erros em produção.
 *
 * Totalmente gated por `SENTRY_DSN`: sem a variável, `initSentry()` não faz nada,
 * `captureException()` é no-op e nenhum middleware HTTP é injetado. Isso garante:
 *   - dev local sem conta Sentry continua subindo sem passo extra;
 *   - teste de integração não contamina o projeto Sentry real;
 *   - Sentry ligado em staging/prod separadamente via SENTRY_ENVIRONMENT.
 *
 * Sanitização: `beforeSend` tira cabeçalhos de auth e o body da requisição antes
 * do envio. O Sentry captura HTTP automaticamente com o integration padrão — não
 * podemos permitir que ele leve JWT / token do Asaas / senha para o backend deles.
 */

let initialized = false;

const SENSITIVE_HEADERS = new Set([
  'authorization',
  'cookie',
  'x-service-token',
  'x-ml-token',
  'asaas-access-token',
]);

interface SentryRequestShape {
  headers?: Record<string, string | string[] | undefined>;
  data?: unknown;
  cookies?: unknown;
}

function sanitize<T extends { request?: SentryRequestShape | unknown }>(event: T): T {
  const req = event.request as SentryRequestShape | undefined;
  if (req) {
    if (req.headers) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        out[k] = SENSITIVE_HEADERS.has(k.toLowerCase()) ? '[Filtered]' : String(v);
      }
      req.headers = out;
    }
    // Body pode conter senha, cartão, CPF — não mandamos para o Sentry nunca.
    req.data = '[Filtered]';
    req.cookies = undefined;
  }
  return event;
}

export function initSentry(): void {
  if (initialized) return;
  if (!env.SENTRY_DSN) {
    logger.debug('sentry: SENTRY_DSN ausente; captura remota desligada');
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
    // `release` idealmente injetado pelo deploy. Sem isso, o Sentry agrupa por
    // last commit do processo — menos acionável, mas funciona como fallback.
    beforeSend: sanitize,
  });

  initialized = true;
  logger.info({ env: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV }, 'sentry: inicializado');
}

/**
 * Captura manual — útil em paths onde o erro é tratado localmente (ex.: log de
 * degradação) mas ainda queremos saber que aconteceu.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialized) return;
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

/** Flush antes de shutdown — garante que o último lote saia antes do processo morrer. */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialized) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch {
    /* fail-open: não impedimos o shutdown por conta do Sentry */
  }
}
