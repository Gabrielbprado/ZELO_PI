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
      // Coordenadas de rastreamento — nunca devem aparecer em log, mesmo por acidente
      // (ex.: alguém loga `req.body` de `POST /travel/location`). O Pino segue dot-path
      // e wildcard para profundidade arbitrária.
      'latitude',
      'longitude',
      'lat',
      'lng',
      '*.latitude',
      '*.longitude',
      '*.lat',
      '*.lng',
      // PII financeira/documental que também não deve chegar aos logs.
      'cpf',
      'cpfCnpj',
      'card.number',
      'card.ccv',
      '*.cpf',
      '*.cpfCnpj',
    ],
    censor: '[REDACTED]',
  },
});
