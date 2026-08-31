import { Router } from 'express';
import { prisma } from '../config/prisma';
import { redisStatus } from '../config/redis';
import { amqpStatus } from '../config/amqp';
import { circuitState, isMlConfigured } from '../services/mlClient.service';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

type CheckStatus = 'ok' | 'down' | 'disabled' | 'degraded';

interface Check {
  status: CheckStatus;
  latencyMs?: number;
  detail?: string;
}

async function timed(fn: () => Promise<unknown>): Promise<Check> {
  const started = Date.now();
  try {
    await fn();
    return { status: 'ok', latencyMs: Date.now() - started };
  } catch (err) {
    return { status: 'down', detail: err instanceof Error ? err.message : 'erro desconhecido' };
  }
}

const router = Router();

/**
 * Liveness. Não toca em dependência nenhuma, de propósito.
 *
 * É este o caminho que o `healthCheckPath` do Render e o HEALTHCHECK do Dockerfile
 * consultam. Se ele checasse Redis ou banco, uma oscilação de dependência faria o
 * orquestrador matar um processo que estava perfeitamente vivo — trocando uma
 * degradação por uma indisponibilidade.
 */
router.get('/', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

/**
 * Readiness. Aqui sim as dependências são consultadas.
 *
 * Só o Postgres derruba a resposta para 503: sem ele não há produto. Redis e serviço de
 * ML fora do ar produzem `degraded` com **HTTP 200**, porque o sistema de fato continua
 * servindo — o cache vira passthrough e o ranking cai para ordenação por avaliação.
 * Responder 503 nesse caso seria mentir e ainda causar um apagão auto-infligido.
 */
router.get('/ready', asyncHandler(async (_req, res) => {
  const [postgres, ml] = await Promise.all([
    timed(() => prisma.$queryRaw`SELECT 1`),
    (async (): Promise<Check> => {
      if (!isMlConfigured()) return { status: 'disabled' };
      const state = await circuitState();
      return state === 'open' ? { status: 'degraded', detail: 'circuito aberto' } : { status: 'ok' };
    })(),
  ]);

  const redis: Check = { status: redisStatus() === 'ready' ? 'ok' : redisStatus() === 'disabled' ? 'disabled' : 'down' };
  // RabbitMQ fora do ar é `degraded`, não `down`: os eventos ficam represados no outbox
  // e são entregues quando ele volta — o produto segue de pé. Mesma regra do Redis.
  const rabbitmq: Check = ((): Check => {
    const s = amqpStatus();
    if (s === 'disabled') return { status: 'disabled' };
    return s === 'ready' ? { status: 'ok' } : { status: 'degraded', detail: 'broker inacessível; outbox represado' };
  })();

  const checks = { postgres, redis, rabbitmq, ml };
  const healthy = postgres.status === 'ok';
  const degraded = Object.values(checks).some((c) => c.status === 'down' || c.status === 'degraded');

  res.status(healthy ? HttpStatus.OK : HttpStatus.INTERNAL_SERVER_ERROR).json({
    status: !healthy ? 'down' : degraded ? 'degraded' : 'ok',
    env: env.NODE_ENV,
    checks,
  });
}));

export default router;
