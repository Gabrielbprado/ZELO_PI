import { Queue, Worker, type Job } from 'bullmq';
import { jobsConnection, jobsEnabled, JOBS_PREFIX } from '../config/jobs';
import { logger } from '../utils/logger';
import {
  cleanupExpiredRefreshTokens,
  expireStaleBookings,
  recomputeAdminOverview,
  sendBookingReminder,
} from './processors';

/**
 * Camada de jobs (BullMQ).
 *
 * Por que BullMQ ALÉM do RabbitMQ (a banca vai perguntar): responsabilidades distintas.
 * RabbitMQ carrega *integration events* entre serviços (fan-out, pub/sub, o publicador
 * não sabe quem consome). BullMQ roda *jobs* dentro de um serviço: delay nativo, jobs
 * repetíveis (cron), backoff por tentativa e uma UI (Bull Board). O AMQP só faz delay com
 * a gambiarra de TTL+DLX — que é o que usamos para RETRY, não para agendamento de negócio.
 */

export const QUEUE_NAMES = ['housekeeping', 'bookings', 'metrics', 'reminders'] as const;
export type QueueName = (typeof QUEUE_NAMES)[number];

const REMINDER_OFFSETS: Array<{ when: '24h' | '1h'; ms: number }> = [
  { when: '24h', ms: 24 * 60 * 60 * 1000 },
  { when: '1h', ms: 60 * 60 * 1000 },
];

const queues = new Map<QueueName, Queue>();
const workers: Worker[] = [];

function connOpts() {
  return { connection: jobsConnection(), prefix: JOBS_PREFIX };
}

/** Fila (lazy). `null` quando os jobs estão desligados (sem Redis). */
export function getQueue(name: QueueName): Queue | null {
  if (!jobsEnabled()) return null;
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, connOpts());
    queues.set(name, q);
  }
  return q;
}

/** Devolve todas as filas ativas — usado pelo Bull Board. */
export function activeQueues(): Queue[] {
  return QUEUE_NAMES.map((n) => getQueue(n)).filter((q): q is Queue => q !== null);
}

// ─── Agendamento de lembretes (delayed jobs) ─────────────────────────────────

/** Agenda os lembretes 24h/1h antes do horário do booking. jobId estável → idempotente. */
export async function scheduleBookingReminders(bookingId: string, scheduledAt: Date): Promise<void> {
  const q = getQueue('reminders');
  if (!q) return;
  const now = Date.now();
  for (const { when, ms } of REMINDER_OFFSETS) {
    const delay = scheduledAt.getTime() - ms - now;
    if (delay <= 0) continue; // a janela já passou; não agenda
    await q.add(
      'reminder',
      { bookingId, when },
      { delay, jobId: `reminder:${bookingId}:${when}`, removeOnComplete: true, removeOnFail: 200 },
    );
  }
}

/** Cancela os lembretes de um booking (ex.: quando é cancelado). Idempotente. */
export async function cancelBookingReminders(bookingId: string): Promise<void> {
  const q = getQueue('reminders');
  if (!q) return;
  for (const { when } of REMINDER_OFFSETS) {
    const job = await q.getJob(`reminder:${bookingId}:${when}`);
    if (job) await job.remove().catch(() => undefined);
  }
}

// ─── Ciclo de vida ───────────────────────────────────────────────────────────

async function registerRepeatables(): Promise<void> {
  // upsertJobScheduler é idempotente: reiniciar o processo não duplica o cron.
  await getQueue('housekeeping')?.upsertJobScheduler(
    'cleanup-refresh-tokens',
    { pattern: '0 * * * *' }, // toda hora
    { name: 'cleanup-refresh-tokens', opts: { removeOnComplete: 50, removeOnFail: 50 } },
  );
  await getQueue('bookings')?.upsertJobScheduler(
    'expire-stale',
    { pattern: '*/15 * * * *' }, // a cada 15 min
    { name: 'expire-stale', opts: { removeOnComplete: 50, removeOnFail: 50 } },
  );
  await getQueue('metrics')?.upsertJobScheduler(
    'recompute-overview',
    { pattern: '*/5 * * * *' }, // a cada 5 min
    { name: 'recompute-overview', opts: { removeOnComplete: 50, removeOnFail: 50 } },
  );
}

async function process(queue: QueueName, job: Job): Promise<unknown> {
  switch (job.name) {
    case 'cleanup-refresh-tokens':
      return cleanupExpiredRefreshTokens();
    case 'expire-stale':
      return expireStaleBookings();
    case 'recompute-overview':
      return recomputeAdminOverview();
    case 'reminder':
      return sendBookingReminder(job.data.bookingId, job.data.when);
    default:
      logger.warn({ queue, name: job.name }, 'job desconhecido; ignorado');
      return undefined;
  }
}

/** Sobe workers e registra os jobs repetíveis. No-op sem Redis. */
export async function startJobs(): Promise<void> {
  if (!jobsEnabled()) {
    logger.info('jobs desligados (sem Redis ou JOBS_ENABLED=false)');
    return;
  }
  for (const name of QUEUE_NAMES) {
    const worker = new Worker(name, (job) => process(name, job), { ...connOpts(), concurrency: 5 });
    worker.on('failed', (job, err) => logger.warn({ queue: name, id: job?.id, err: err.message }, 'job falhou'));
    workers.push(worker);
  }
  await registerRepeatables();
  logger.info({ queues: QUEUE_NAMES }, 'jobs iniciados');
}

export async function stopJobs(): Promise<void> {
  await Promise.all(workers.map((w) => w.close().catch(() => undefined)));
  workers.length = 0;
  await Promise.all([...queues.values()].map((q) => q.close().catch(() => undefined)));
  queues.clear();
}
