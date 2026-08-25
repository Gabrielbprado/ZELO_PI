import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors';
import { ErrorCode, HttpStatus } from '../constants/http';
import { logger } from '../utils/logger';
import { isProd } from '../config/env';

/**
 * Erros do `express.json()` não são `AppError` nem `ZodError`: o body-parser lança
 * objetos com `type` e `status` próprios. Sem tratá-los, um corpo acima de 1 MB ou um
 * JSON malformado — os dois erros de CLIENTE mais banais — respondiam 500 e ainda
 * entravam no log como "Erro não tratado", escondendo falhas de servidor de verdade
 * no meio de ruído.
 */
interface BodyParserError extends Error {
  type: string;
  status?: number;
  statusCode?: number;
}

const BODY_PARSER_MESSAGES: Readonly<Record<string, string>> = {
  'entity.too.large':     'Corpo da requisição acima do limite permitido',
  'entity.parse.failed':  'JSON inválido',
  'charset.unsupported':  'Charset não suportado',
  'encoding.unsupported': 'Codificação não suportada',
  'request.aborted':      'Requisição interrompida pelo cliente',
};

function asBodyParserError(err: unknown): BodyParserError | null {
  if (!(err instanceof Error)) return null;
  const candidate = err as BodyParserError;
  if (typeof candidate.type !== 'string') return null;
  const status = candidate.status ?? candidate.statusCode;
  // Só assume o erro se ele já se declara um 4xx — qualquer outra coisa com um
  // campo `type` é coincidência e merece o caminho de 500.
  if (typeof status !== 'number' || status < 400 || status >= 500) return null;
  return candidate;
}

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

  const bodyParserError = asBodyParserError(err);
  if (bodyParserError) {
    const status = bodyParserError.status ?? bodyParserError.statusCode ?? HttpStatus.BAD_REQUEST;
    return send(res, status, {
      error: {
        code: status === HttpStatus.PAYLOAD_TOO_LARGE ? ErrorCode.PAYLOAD_TOO_LARGE : ErrorCode.BAD_REQUEST,
        message: BODY_PARSER_MESSAGES[bodyParserError.type] ?? 'Requisição malformada',
      },
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
