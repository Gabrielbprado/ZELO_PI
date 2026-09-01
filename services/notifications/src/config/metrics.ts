import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

/**
 * Métricas Prometheus do serviço de notificações. Além das de processo, expõe as de
 * negócio que importam aqui: quantos eventos consumiu, quanto demorou, quantos inbox
 * persistiu e quantos pushes saíram. É o que o painel do Grafana usa para mostrar o
 * serviço extraído funcionando ao vivo.
 */
export const register = new Registry();
register.setDefaultLabels({ service: 'notifications' });
collectDefaultMetrics({ register });

export const eventsConsumed = new Counter({
  name: 'events_consumed_total',
  help: 'Eventos consumidos',
  labelNames: ['result'] as const,
  registers: [register],
});

export const eventProcessing = new Histogram({
  name: 'event_processing_duration_seconds',
  help: 'Duração do processamento de um evento',
  buckets: [0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [register],
});

export const notificationsPersisted = new Counter({
  name: 'notifications_persisted_total',
  help: 'Notificações persistidas no inbox',
  registers: [register],
});

export const pushSent = new Counter({
  name: 'push_sent_total',
  help: 'Pushes enviados (tentativas que chegaram ao envio)',
  registers: [register],
});
