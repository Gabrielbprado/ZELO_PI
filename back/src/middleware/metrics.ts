import type { NextFunction, Request, Response } from 'express';
import { httpDuration } from '../config/metrics';

/**
 * Cronometra cada request e registra no histograma. O rótulo `route` usa o CAMINHO do
 * router (`/:id`), não a URL concreta — senão cada id viraria uma série nova e a
 * cardinalidade explodiria. Requests que não casam com rota nenhuma (estáticos, SPA)
 * caem em `other`.
 */
export function httpMetrics(req: Request, res: Response, next: NextFunction): void {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    const routePath = req.route?.path ?? '';
    const route = `${req.baseUrl}${routePath}` || 'other';
    end({ method: req.method, route, status: String(res.statusCode) });
  });
  next();
}
