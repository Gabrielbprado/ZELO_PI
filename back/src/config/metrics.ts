import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Registro de métricas Prometheus do backend.
 *
 * Um Registry DEDICADO (em vez do global) mantém os testes isolados e deixa explícito o
 * conjunto que este processo expõe. Além das métricas de HTTP, há métricas de NEGÓCIO —
 * eventos publicados/consumidos, profundidade do outbox, estado do circuito de ML — que
 * são o que conta a história de arquitetura num painel do Grafana.
 */
export const register = new Registry();
register.setDefaultLabels({ service: 'backend' });
collectDefaultMetrics({ register });

export const httpDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [register],
});

export const cacheHits = new Gauge({
  name: 'cache_hits_total',
  help: 'Acertos de cache acumulados',
  registers: [register],
});

export const cacheMisses = new Gauge({
  name: 'cache_misses_total',
  help: 'Faltas de cache acumuladas',
  registers: [register],
});

export const mlCircuitState = new Gauge({
  name: 'ml_circuit_state',
  help: 'Estado do circuit breaker do ML (0=fechado, 1=aberto)',
  registers: [register],
});

export const outboxPending = new Gauge({
  name: 'outbox_pending',
  help: 'Eventos no outbox ainda não publicados',
  registers: [register],
});

export const eventsPublished = new Counter({
  name: 'events_published_total',
  help: 'Eventos publicados pelo relay',
  labelNames: ['routing_key'] as const,
  registers: [register],
});

export const eventsConsumed = new Counter({
  name: 'events_consumed_total',
  help: 'Eventos consumidos',
  labelNames: ['consumer', 'result'] as const,
  registers: [register],
});

export const eventProcessing = new Histogram({
  name: 'event_processing_duration_seconds',
  help: 'Duração do processamento de um evento pelo consumidor',
  labelNames: ['consumer'] as const,
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});
