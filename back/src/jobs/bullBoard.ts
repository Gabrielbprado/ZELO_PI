import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Router } from 'express';
import { activeQueues } from './index';

/**
 * Monta o Bull Board sobre as filas ativas e devolve seu router, ou `null` quando os jobs
 * estão desligados (sem Redis) — nesse caso não há fila para mostrar. As filas ficam
 * visíveis ao vivo na apresentação: jobs repetíveis, delayed, falhos e a opção de
 * reprocessar.
 */
export function buildBullBoardRouter(basePath: string): Router | null {
  const queues = activeQueues();
  if (queues.length === 0) return null;

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(basePath);
  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });
  return serverAdapter.getRouter() as Router;
}
