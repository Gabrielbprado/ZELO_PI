import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';
import { register } from '../config/metrics';

const NOTIFICATIONS_LIMIT = 100;

function asyncHandler(fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };
}

/**
 * API interna, não pública. Só o backend-gateway a chama, autenticado pelo
 * `X-SERVICE-TOKEN` — mesmo esquema do `X-ML-Token` do serviço de recomendação. Sem o
 * token certo, 401 e nada mais.
 */
function requireServiceToken(req: Request, res: Response, next: NextFunction): void {
  const token = req.header('X-SERVICE-TOKEN');
  if (token !== env.SERVICE_TOKEN) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
  next();
}

function requireUserId(req: Request, res: Response): string | null {
  const userId = req.query.userId;
  if (typeof userId !== 'string' || userId.length === 0) {
    res.status(400).json({ error: 'userId é obrigatório' });
    return null;
  }
  return userId;
}

export function createServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Liveness — sem token, sem dependência. É o que o healthcheck do contêiner consulta.
  app.get('/internal/health', (_req, res) => res.json({ status: 'ok', service: 'notifications' }));

  // /metrics também sem token: o Prometheus raspa, e não há segredo aqui.
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.send(await register.metrics());
  });

  app.use(requireServiceToken);

  app.get(
    '/internal/notifications',
    asyncHandler(async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      const items = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: NOTIFICATIONS_LIMIT,
      });
      res.json({ items });
    }),
  );

  app.post(
    '/internal/notifications/read-all',
    asyncHandler(async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      await prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
      res.status(204).end();
    }),
  );

  app.post(
    '/internal/notifications/:id/read',
    asyncHandler(async (req, res) => {
      const userId = requireUserId(req, res);
      if (!userId) return;
      // Escopo pelo userId: um usuário não marca a notificação de outro como lida.
      await prisma.notification.updateMany({
        where: { id: req.params.id, userId, readAt: null },
        data: { readAt: new Date() },
      });
      res.status(204).end();
    }),
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err: err.message }, 'erro não tratado na API interna');
    res.status(500).json({ error: 'internal_error' });
  });

  return app;
}
