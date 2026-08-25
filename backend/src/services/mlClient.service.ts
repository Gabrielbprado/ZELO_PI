import { z } from 'zod';
import { env } from '../config/env';
import { getRedis } from '../config/redis';
import { REC_REASON_CODES } from '../constants/recommendations';
import { logger } from '../utils/logger';

/**
 * Único módulo que fala com o serviço Python.
 *
 * Disciplina central, igual à do `pushToUser`: **nunca lança**. Qualquer falha
 * — timeout, 5xx, corpo malformado, DNS — vira `null`, e quem chama degrada
 * para a ordenação por avaliação. A Home do app não pode quebrar porque um
 * serviço de ML está hibernando no plano free do Render.
 *
 * O circuit breaker existe porque o modo de falha real ali não é "erro rápido",
 * é "lentidão": um dyno acordando leva 30-60s. Sem o breaker, toda requisição
 * pagaria o timeout inteiro antes de cair no fallback. Com ele, a primeira
 * falha custa o timeout e as seguintes custam zero até o cooldown expirar.
 */

const reasonSchema = z.object({
  code: z.enum(REC_REASON_CODES),
  value: z.number().nullable().optional(),
});

const rankResponseSchema = z.object({
  model_version: z.string().nullable(),
  strategy: z.enum(['ranker', 'cold_start_popularity', 'heuristic_fallback']),
  latency_ms: z.number(),
  items: z.array(
    z.object({
      provider_id: z.string(),
      score: z.number(),
      rank: z.number().int(),
      // Um código desconhecido (serviço mais novo que o backend) é descartado
      // em vez de derrubar a resposta inteira.
      reasons: z.array(reasonSchema.catch({ code: 'VERIFIED', value: null })).default([]),
    }),
  ),
});

export type MlRankResponse = z.infer<typeof rankResponseSchema>;

export interface MlRankPayload {
  request_id: string;
  client: Record<string, unknown>;
  context: Record<string, unknown>;
  candidates: Array<Record<string, unknown>>;
}

/**
 * Estado do breaker.
 *
 * Vive no Redis quando ele existe, e em memória quando não. A diferença importa mais do
 * que parece: com estado por processo, N instâncias abrem N circuitos independentes, e
 * cada uma precisa pagar o timeout inteiro por conta própria antes de proteger o seu
 * tráfego. Um serviço de ML hibernando no free tier — que é o caso comum aqui — leva
 * 30-60s para responder, então o custo dessa duplicação recai direto na Home.
 *
 * O estado local é mantido em paralelo, e não substituído: se o Redis cair, o breaker
 * continua funcionando com o comportamento anterior em vez de sumir junto.
 */
const circuit = { failures: 0, openedAt: 0 };

const CIRCUIT_OPEN_KEY = 'ml:circuit:open';
const CIRCUIT_FAILURES_KEY = 'ml:circuit:failures';

function isOpenLocally(): boolean {
  if (circuit.failures < env.ML_CIRCUIT_FAILURE_THRESHOLD) return false;
  if (Date.now() - circuit.openedAt >= env.ML_CIRCUIT_COOLDOWN_MS) {
    // Cooldown vencido: deixa uma requisição passar para sondar a recuperação.
    circuit.failures = 0;
    return false;
  }
  return true;
}

async function isOpen(): Promise<boolean> {
  const redis = getRedis();
  if (redis) {
    try {
      // O TTL da chave É o cooldown: quando ela expira, a próxima requisição
      // naturalmente sonda o serviço. Não há relógio a sincronizar entre instâncias.
      const open = await redis.exists(CIRCUIT_OPEN_KEY);
      if (open === 1) return true;
    } catch {
      // Redis fora: cai no estado local, que é a garantia mínima.
    }
  }
  return isOpenLocally();
}

async function recordFailure(): Promise<void> {
  circuit.failures += 1;
  if (circuit.failures === env.ML_CIRCUIT_FAILURE_THRESHOLD) {
    circuit.openedAt = Date.now();
    logger.warn(
      { cooldownMs: env.ML_CIRCUIT_COOLDOWN_MS },
      'circuito do serviço de ML aberto; servindo ranking por avaliação',
    );
  }

  const redis = getRedis();
  if (!redis) return;
  try {
    const cooldownSec = Math.ceil(env.ML_CIRCUIT_COOLDOWN_MS / 1000);
    const failures = await redis.incr(CIRCUIT_FAILURES_KEY);
    // A janela de contagem expira junto com o cooldown: falhas esparsas ao longo de
    // horas não devem somar até abrir o circuito.
    if (failures === 1) await redis.expire(CIRCUIT_FAILURES_KEY, cooldownSec);
    if (failures >= env.ML_CIRCUIT_FAILURE_THRESHOLD) {
      await redis.set(CIRCUIT_OPEN_KEY, '1', 'EX', cooldownSec);
      await redis.del(CIRCUIT_FAILURES_KEY);
    }
  } catch {
    // Estado compartilhado é melhor-esforço; o local já registrou a falha.
  }
}

async function recordSuccess(): Promise<void> {
  circuit.failures = 0;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(CIRCUIT_FAILURES_KEY);
  } catch {
    // idem
  }
}

/** Reseta o breaker nos dois planos. Usado pelos testes; inofensivo em produção. */
export async function resetCircuit(): Promise<void> {
  circuit.failures = 0;
  circuit.openedAt = 0;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(CIRCUIT_OPEN_KEY, CIRCUIT_FAILURES_KEY);
  } catch {
    // idem
  }
}

/** Estado legível para o health check e para as métricas. */
export async function circuitState(): Promise<'closed' | 'open'> {
  return (await isOpen()) ? 'open' : 'closed';
}

export function isMlConfigured(): boolean {
  return env.ML_ENABLED && Boolean(env.ML_SERVICE_URL && env.ML_SERVICE_TOKEN);
}

export async function rankProviders(payload: MlRankPayload): Promise<MlRankResponse | null> {
  if (!isMlConfigured() || (await isOpen())) return null;

  try {
    const res = await fetch(`${env.ML_SERVICE_URL}/v1/rank`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ML-Token': env.ML_SERVICE_TOKEN as string,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(env.ML_TIMEOUT_MS),
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'serviço de ML respondeu com status não-2xx');
      await recordFailure();
      return null;
    }

    const parsed = rankResponseSchema.safeParse(await res.json());
    if (!parsed.success) {
      // Corpo inesperado é tão ruim quanto serviço fora do ar: o contrato
      // divergiu e ranquear com dado malformado seria pior que degradar.
      logger.warn({ issues: parsed.error.issues }, 'resposta do serviço de ML fora do contrato');
      await recordFailure();
      return null;
    }

    await recordSuccess();
    return parsed.data;
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    logger.warn({ err: timedOut ? 'timeout' : err }, 'chamada ao serviço de ML falhou');
    await recordFailure();
    return null;
  }
}
