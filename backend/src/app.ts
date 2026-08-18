import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import pinoHttp from 'pino-http';
import { corsOrigins, env, isProd } from './config/env';
import { logger } from './utils/logger';
import { router } from './routes';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { generalLimiter } from './middleware/rateLimit';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet({
    contentSecurityPolicy: isProd ? undefined : false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }));

  app.use(cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      if (corsOrigins.includes('*') || corsOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origem não permitida pelo CORS: ${origin}`));
    },
    credentials: true,
    maxAge: 86400,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(hpp());

  if (process.env.NODE_ENV !== 'test') {
    app.use(pinoHttp({
      logger,
      serializers: { req: (req) => ({ method: req.method, url: req.url }) },
    }));
  }

  // Estáticos antes do limitador: um único carregamento do app web pede dezenas
  // de chunks e fontes, e esgotaria o orçamento de 200 req/15min que existe
  // para proteger a API — não o servidor de arquivos.
  const webDist = env.WEB_DIST_DIR ? path.resolve(env.WEB_DIST_DIR) : null;
  if (webDist) app.use(express.static(webDist));

  app.use(generalLimiter);
  app.use('/api/v1', router);

  // Fallback de SPA: rotas do app são resolvidas no cliente, então qualquer GET
  // que não seja da API devolve o index. Fica depois do router para que um
  // caminho de API inexistente continue virando 404 JSON, e não HTML.
  if (webDist) {
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
