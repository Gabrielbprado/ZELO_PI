import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Run the provided Zod schemas against the corresponding `req` slices.
 *
 * Each successful parse *replaces* `req.body` / `req.query` / `req.params`
 * with the parsed value, so downstream handlers operate on the coerced and
 * stripped data instead of the raw input — this is what stops mass-assignment.
 *
 * Validation failures are forwarded to the global error handler, which
 * formats them as `VALIDATION_ERROR` responses.
 */
export function validate(schemas: ValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.body) req.body = await schemas.body.parseAsync(req.body);
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as Request['query'];
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as Request['params'];
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
