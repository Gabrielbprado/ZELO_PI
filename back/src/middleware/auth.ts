import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken, AccessTokenPayload } from '../utils/tokens';
import { ForbiddenError, UnauthorizedError } from '../errors';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

const BEARER_PREFIX = 'Bearer ';

function extractBearerToken(header?: string): string | null {
  if (!header || !header.startsWith(BEARER_PREFIX)) return null;
  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
}

/** Require a valid access token and attach the decoded payload to `req.user`. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return next(new UnauthorizedError('Token de acesso ausente'));

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(new UnauthorizedError('Token de acesso inválido ou expirado'));
  }
}

/** Restrict the route to the supplied roles. Assumes `authenticate` ran first. */
export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!roles.includes(req.user.role)) {
      return next(new ForbiddenError('Acesso restrito a outros papéis'));
    }
    next();
  };
}

/** Accept the request whether or not a token is present; if present, decode it. */
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return next();
  try {
    req.user = verifyAccessToken(token);
  } catch {
    // Token presente mas inválido — segue como não autenticado.
  }
  next();
}
