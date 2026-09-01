import { Router } from 'express';
import { prisma } from '../config/prisma';
import {
  cacheHits,
  cacheMisses,
  mlCircuitState,
  outboxPending,
  register,
} from '../config/metrics';
import { cacheStats } from '../services/cache.service';
import { circuitState } from '../services/mlClient.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * Endpoint que o Prometheus raspa. As métricas "caras/assíncronas" — profundidade do
 * outbox, estado do circuito de ML — são amostradas AQUI, no momento do scrape, em vez de
 * mantidas quentes o tempo todo. Os contadores de negócio (eventos publicados/consumidos)
 * são incrementados nos seus pontos de origem; aqui só espelhamos os gauges pontuais.
 */
router.get('/', async (_req, res) => {
  try {
    mlCircuitState.set((await circuitState()) === 'open' ? 1 : 0);
    const pending = await prisma.outboxEvent.count({ where: { publishedAt: null } });
    outboxPending.set(pending);
  } catch (err) {
    // Uma dependência lenta não pode derrubar o /metrics: servimos o que temos.
    logger.debug({ err: (err as Error).message }, 'metrics: falha ao amostrar gauges');
  }
  const stats = cacheStats();
  cacheHits.set(stats.hits);
  cacheMisses.set(stats.misses);

  res.set('Content-Type', register.contentType);
  res.send(await register.metrics());
});

export default router;
