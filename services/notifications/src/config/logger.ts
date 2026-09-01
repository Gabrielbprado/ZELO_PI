import pino from 'pino';
import { isProd } from './env';

export const logger = pino({
  name: 'notifications',
  level: isProd ? 'info' : 'debug',
  transport: isProd ? undefined : { target: 'pino/file', options: { destination: 1 } },
  redact: {
    paths: ['req.headers.authorization', 'req.headers["x-service-token"]', 'token'],
    censor: '[REDACTED]',
  },
});
