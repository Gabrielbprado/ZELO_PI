import { ErrorCode, ErrorCodeName, HttpStatus, HttpStatusCode } from '../constants/http';

/**
 * Base class for every expected (operational) error raised by the
 * service layer. The HTTP error handler relies on `instanceof AppError`
 * to translate these into a stable response envelope.
 *
 * Sub-classes should *only* fix `statusCode` and `code` so callers can
 * say `throw new NotFoundError('Profissional não encontrado')` and
 * forget about HTTP semantics.
 */
export class AppError extends Error {
  public readonly statusCode: HttpStatusCode;
  public readonly code: ErrorCodeName;
  public readonly details?: unknown;

  constructor(
    statusCode: HttpStatusCode,
    code: ErrorCodeName,
    message: string,
    details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message: string, details?: unknown) {
    super(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autenticado') {
    super(HttpStatus.UNAUTHORIZED, ErrorCode.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Não encontrado') {
    super(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(HttpStatus.CONFLICT, ErrorCode.CONFLICT, message);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Muitas tentativas') {
    super(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.TOO_MANY_REQUESTS, message);
  }
}
