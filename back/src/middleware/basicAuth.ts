import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env';

/**
 * HTTP Basic auth para a UI de filas (Bull Board). Basic — e não o JWT Bearer das rotas de
 * API — porque a UI faz polling no navegador, que reenvia a credencial Basic a cada
 * request; um header Bearer não sobreviveria às chamadas de asset e de polling.
 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function adminBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header?.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString();
    const sep = decoded.indexOf(':');
    const user = decoded.slice(0, sep);
    const pass = decoded.slice(sep + 1);
    if (safeEqual(user, env.ADMIN_UI_USER) && safeEqual(pass, env.ADMIN_UI_PASSWORD)) {
      next();
      return;
    }
  }
  res.set('WWW-Authenticate', 'Basic realm="ZELO admin", charset="UTF-8"').status(401).end();
}
