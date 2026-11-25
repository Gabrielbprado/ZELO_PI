import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown> | unknown;

/**
 * Wrap an async controller so any thrown error (or rejected promise)
 * is forwarded to Express's central error pipeline instead of becoming
 * an unhandled rejection.
 *
 * Controllers can drop the boilerplate `try { ... } catch (e) { next(e) }`
 * and become a single expression: the request → service mapping.
 *
 * @example
 *   export const list = asyncHandler(async (req, res) => {
 *     const items = await listMyBookings(req.user!.sub, req.user!.role);
 *     res.json({ items });
 *   });
 */
export function asyncHandler(fn: AsyncRequestHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
