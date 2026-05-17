import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors';
import { ErrorCode, HttpStatus } from '../constants/http';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

function send(res: Response, status: number, body: ErrorBody): Response {
  return res.status(status).json(body);
}

export function notFoundHandler(_req: Request, res: Response) {
  send(res, HttpStatus.NOT_FOUND, {
    error: { code: ErrorCode.NOT_FOUND, message: 'Rota não encontrada' },
  });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return send(res, err.statusCode, {
      error: { code: err.code, message: err.message, details: err.details },
    });
  }

  if (err instanceof ZodError) {
    return send(res, HttpStatus.BAD_REQUEST, {
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: 'Dados inválidos',
        details: err.flatten().fieldErrors,
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'campo';
      return send(res, HttpStatus.CONFLICT, {
        error: { code: ErrorCode.CONFLICT, message: `Valor duplicado: ${target}` },
      });
    }
    if (err.code === 'P2025') {
      return send(res, HttpStatus.NOT_FOUND, {
        error: { code: ErrorCode.NOT_FOUND, message: 'Registro não encontrado' },
      });
    }
  }

  logger.error({ err }, 'Erro não tratado');

  send(res, HttpStatus.INTERNAL_SERVER_ERROR, {
    error: {
      code: ErrorCode.INTERNAL_ERROR,
      message: isProd ? 'Erro interno do servidor' : (err as Error)?.message ?? 'Erro interno',
    },
  });
}
