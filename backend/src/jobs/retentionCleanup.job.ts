import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Retenção de dados de eventos e auditoria.
 *
 * As três tabelas tocadas aqui crescem sem limite com o uso natural do sistema:
 *   - OutboxEvent      — cada mudança de domínio emite 1 evento. Depois do relay publicar,
 *                        o registro vira histórico. Arquivar após N dias é seguro.
 *   - ProcessedEvent   — tabela de deduplicação por consumidor. A janela útil é o tempo
 *                        em que um broker pode reenviar o mesmo eventId (Asaas reenvia
 *                        webhook por até ~7 dias). Além disso, vira ruído.
 *   - AuditLog         — trilha legal/operacional. Prazo conservador (365 dias) para
 *                        cobrir auditoria financeira. Produto/legal podem exigir mais.
 *
 * Segurança operacional (por que `enabled` começa em `false`):
 *   Este job FAZ DELETE em tabelas com dados sensíveis/legais. Nunca ligue antes de:
 *     1) ter backup diário validado (restore testado);
 *     2) ter revisado os prazos com produto/legal;
 *     3) ter medido o volume atual das tabelas e dimensionado o batch.
 *   Quando ligar, o primeiro ciclo pode encontrar um backlog grande — o BATCH_SIZE
 *   limita quantos registros morrem por ciclo para não travar a tabela em lock.
 */

interface RetentionResult {
  outboxPublished: number;
  processedEvents: number;
  auditLogs: number;
  skipped: boolean;
  reason?: string;
}

// Limite por ciclo. Cycle = 1x/dia; backlog grande é limpo gradualmente ao longo
// de vários dias em vez de um lock longo. 5000 é conservador — Prisma faz DELETE
// em lote em uma única statement, mas o Postgres ainda escreve WAL para cada linha.
const BATCH_SIZE = 5000;

function cutoff(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function runRetentionCleanup(): Promise<RetentionResult> {
  if (!env.RETENTION_CLEANUP_ENABLED) {
    return { outboxPublished: 0, processedEvents: 0, auditLogs: 0, skipped: true, reason: 'disabled' };
  }

  const result: RetentionResult = {
    outboxPublished: 0,
    processedEvents: 0,
    auditLogs: 0,
    skipped: false,
  };

  // OutboxEvent — só registros que o relay JÁ publicou. Um evento ainda não publicado
  // é trabalho pendente; apagar seria perder uma entrega. A guarda em publishedAt é
  // obrigatória.
  try {
    const outboxCutoff = cutoff(env.RETENTION_OUTBOX_DAYS);
    const outboxIds = await prisma.outboxEvent.findMany({
      where: {
        publishedAt: { not: null, lt: outboxCutoff },
      },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (outboxIds.length > 0) {
      const { count } = await prisma.outboxEvent.deleteMany({
        where: { id: { in: outboxIds.map((r) => r.id) } },
      });
      result.outboxPublished = count;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'retention: falha em OutboxEvent');
  }

  // ProcessedEvent — tabela de dedup. Sem publishedAt; a coluna é `processedAt`.
  try {
    const processedCutoff = cutoff(env.RETENTION_PROCESSED_EVENT_DAYS);
    const { count } = await prisma.processedEvent.deleteMany({
      where: { processedAt: { lt: processedCutoff } },
    });
    result.processedEvents = count;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'retention: falha em ProcessedEvent');
  }

  // AuditLog — janela conservadora. Em vez de limitar por take+deleteMany (o Prisma não
  // combina os dois em uma só statement), coletamos ids e apagamos por id — mantém o
  // batch sob controle.
  try {
    const auditCutoff = cutoff(env.RETENTION_AUDIT_LOG_DAYS);
    const auditIds = await prisma.auditLog.findMany({
      where: { createdAt: { lt: auditCutoff } },
      select: { id: true },
      take: BATCH_SIZE,
    });
    if (auditIds.length > 0) {
      const { count } = await prisma.auditLog.deleteMany({
        where: { id: { in: auditIds.map((r) => r.id) } },
      });
      result.auditLogs = count;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'retention: falha em AuditLog');
  }

  logger.info(
    {
      outboxPublished: result.outboxPublished,
      processedEvents: result.processedEvents,
      auditLogs: result.auditLogs,
      windows: {
        outboxDays: env.RETENTION_OUTBOX_DAYS,
        processedDays: env.RETENTION_PROCESSED_EVENT_DAYS,
        auditDays: env.RETENTION_AUDIT_LOG_DAYS,
      },
    },
    'retention: ciclo concluído',
  );

  return result;
}

// Exposto para teste unitário (sem efeitos colaterais quando desligado).
export const __test__ = {
  cutoff,
  BATCH_SIZE,
} as const;

// Suprime warning de "Prisma não usado" em paths onde o mock substitui o client.
void Prisma;
