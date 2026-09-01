import pino from 'pino';
import { isProd } from '../config/env';
import { getRequestId } from './requestContext';

export const logger = pino({
  level: isProd ? 'info' : 'debug',
  // Injeta o requestId do contexto em CADA linha de log emitida durante uma request —
  // inclusive as dos services, que não conhecem o id. Fora de uma request, é no-op.
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
  transport: isProd
    ? undefined
    : {
        target: 'pino/file',
        options: { destination: 1 },
      },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'token',
      'refreshToken',
    ],
    censor: '[REDACTED]',
  },
});
