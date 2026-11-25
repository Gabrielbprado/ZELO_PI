import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { runWithRequestContext } from '../utils/requestContext';

/**
 * Lê o `x-request-id` de entrada (ou gera um) e abre o contexto da request. Devolve o id
 * no header da resposta para o cliente correlacionar, e todo o resto do processamento —
 * logs, eventos gravados no outbox — herda esse id via AsyncLocalStorage.
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && incoming.length <= 200 ? incoming : randomUUID();
  res.setHeader('x-request-id', requestId);
  runWithRequestContext({ requestId }, () => next());
}
