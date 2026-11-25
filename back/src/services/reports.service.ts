import type { Prisma, Report, ReportReason, ReportStatus, ReportTargetType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../errors';
import { ONE_DAY_MS } from '../constants/time';
import { logger } from '../utils/logger';
import { writeAudit } from './audit.service';
import { moderateReport, type MlModerationVerdict } from './mlClient.service';
import { applyAction } from './moderation.service';

/**
 * Denúncias de perfis, serviços e conversas — abertura, triagem pela IA e a fila do admin.
 *
 * Fluxo de uma denúncia:
 *   1. alguém denuncia (perfil, serviço ou conversa) com motivo, descrição e evidências;
 *   2. o backend junta o CONTEXTO (trechos do que foi denunciado + contadores de
 *      comportamento) e pede o veredito ao serviço de IA;
 *   3. o veredito fica gravado NA denúncia — categoria, gravidade, prioridade, confiança
 *      e os sinais que levaram até ele;
 *   4. se a IA estiver confiante o bastante, ela mesma aplica a consequência;
 *   5. de um jeito ou de outro, um admin vê tudo em /admin/reports e pode decidir
 *      diferente. A decisão humana sempre pode sobrescrever a da máquina.
 *
 * O passo 2 é onde mora o cuidado com privacidade: só o texto do que foi denunciado
 * cruza para o serviço Python (é o objeto da análise), e nunca nome, e-mail, telefone
 * ou endereço de ninguém.
 */

const REPORT_WINDOW_MS = 30 * ONE_DAY_MS;
const REPORTER_WINDOW_MS = 7 * ONE_DAY_MS;
/** Quantas mensagens do alvo viajam para análise numa denúncia de conversa. */
const CONVERSATION_SAMPLE = 20;

export interface CreateReportInput {
  targetType?: ReportTargetType;
  targetUserId?: string;
  /** Id do serviço denunciado. Obrigatório (e só válido) em `targetType: 'SERVICE'`. */
  serviceId?: string;
  reason: ReportReason;
  description?: string;
  bookingId?: string;
  evidence?: string[];
}

/**
 * Resolve QUEM é o alvo da ação e O QUE a IA vai ler.
 *
 * O alvo de uma denúncia é sempre um usuário — é quem se adverte, suspende ou bloqueia.
 * Denunciar um serviço ou uma conversa muda de onde a denúncia partiu e qual texto
 * analisar, não contra quem ela corre.
 */
async function resolveTarget(
  reporterId: string,
  input: CreateReportInput,
): Promise<{ targetUserId: string; targetRefId: string | null; samples: string[] }> {
  const targetType = input.targetType ?? 'USER';

  if (targetType === 'SERVICE') {
    if (!input.serviceId) throw new BadRequestError('serviceId é obrigatório ao denunciar um serviço');
    const service = await prisma.providerService.findUnique({
      where: { id: input.serviceId },
      select: { id: true, title: true, description: true, provider: { select: { userId: true } } },
    });
    if (!service) throw new NotFoundError('Serviço não encontrado');
    return {
      targetUserId: service.provider.userId,
      targetRefId: service.id,
      samples: [service.title, service.description ?? ''].filter(Boolean),
    };
  }

  if (!input.targetUserId) throw new BadRequestError('targetUserId é obrigatório');

  if (targetType === 'CONVERSATION') {
    // Só as mensagens que o ALVO mandou para quem está denunciando. Nem as do próprio
    // denunciante (analisar o texto de quem denuncia seria julgá-lo), nem as de conversas
    // com terceiros (que ele não tem por que ver, nem a IA por que ler).
    const messages = await prisma.message.findMany({
      where: { senderId: input.targetUserId, receiverId: reporterId },
      orderBy: { createdAt: 'desc' },
      take: CONVERSATION_SAMPLE,
      select: { content: true },
    });
    return {
      targetUserId: input.targetUserId,
      targetRefId: input.bookingId ?? input.targetUserId,
      samples: messages.map((m) => m.content),
    };
  }

  return { targetUserId: input.targetUserId, targetRefId: null, samples: [] };
}

/** Contadores de comportamento. Só números — é o que deixa a IA ver PADRÃO. */
async function buildContext(reporterId: string, targetUserId: string) {
  const since = new Date(Date.now() - REPORT_WINDOW_MS);
  const [reports, actions, target, completed, reporterReports] = await Promise.all([
    prisma.report.findMany({
      where: { targetUserId, createdAt: { gte: since } },
      select: { reporterId: true },
    }),
    prisma.moderationAction.groupBy({
      by: ['type'],
      where: { targetUserId, type: { in: ['WARN', 'SUSPEND'] } },
      _count: { _all: true },
    }),
    prisma.user.findUnique({
      where: { id: targetUserId },
      select: { createdAt: true, providerProfile: { select: { kycStatus: true } } },
    }),
    // Histórico de serviços concluídos dos DOIS lados: "conta nova sem histórico" é
    // sinal de golpe descartável, e um profissional com 80 jobs não é conta nova.
    prisma.booking.count({
      where: {
        status: 'COMPLETED',
        OR: [{ clientId: targetUserId }, { provider: { userId: targetUserId } }],
      },
    }),
    prisma.report.count({
      where: { reporterId, createdAt: { gte: new Date(Date.now() - REPORTER_WINDOW_MS) } },
    }),
  ]);

  const countOf = (type: string) => actions.find((a) => a.type === type)?._count._all ?? 0;
  const ageDays = target ? (Date.now() - target.createdAt.getTime()) / ONE_DAY_MS : 0;

  return {
    target_reports_30d: reports.length,
    target_distinct_reporters_30d: new Set(reports.map((r) => r.reporterId)).size,
    target_prior_warnings: countOf('WARN'),
    target_prior_suspensions: countOf('SUSPEND'),
    target_account_age_days: Math.round(ageDays * 10) / 10,
    target_completed_bookings: completed,
    target_kyc_verified: target?.providerProfile?.kycStatus === 'VERIFIED',
    reporter_reports_7d: reporterReports,
  };
}

/**
 * Pede o veredito, grava-o e — se a IA estiver confiante — aplica a consequência.
 *
 * Nunca lança: uma falha da IA não pode impedir alguém de denunciar. Sem veredito a
 * denúncia fica com os campos `ai*` nulos, que a fila do admin lê como "não triada" (e
 * não como "sem problema") e mostra no topo junto com as graves.
 */
export async function triage(report: Report, samples: string[]): Promise<Report> {
  try {
    const verdict = await moderateReport({
      report_id: report.id,
      reason: report.reason,
      target_type: report.targetType,
      text: report.description ?? '',
      samples,
      evidence_count: report.evidence.length,
      context: await buildContext(report.reporterId, report.targetUserId),
    });
    if (!verdict) return report;

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        aiCategory: verdict.category,
        aiSeverity: verdict.severity,
        aiPriority: verdict.priority,
        aiConfidence: verdict.confidence,
        aiAction: verdict.action,
        aiSignals: verdict.signals as unknown as Prisma.InputJsonValue,
        aiModelVersion: verdict.model_version,
        aiAnalyzedAt: new Date(),
        status: report.status === 'OPEN' ? 'REVIEWING' : report.status,
      },
    });

    // A análise em si entra no histórico mesmo quando não vira punição: é o registro de
    // que a máquina olhou, o que ela concluiu e com que confiança.
    await prisma.moderationAction.create({
      data: {
        reportId: report.id,
        targetUserId: report.targetUserId,
        actorId: null,
        type: 'AI_CLASSIFIED',
        reason: `${verdict.category}/${verdict.severity}`,
        metadata: {
          priority: verdict.priority,
          confidence: verdict.confidence,
          suggestedAction: verdict.action,
          autoEnforced: verdict.auto_enforce,
          modelVersion: verdict.model_version,
          signals: verdict.signals,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    if (verdict.auto_enforce && verdict.action) {
      return await enforce(report, verdict);
    }
    return updated;
  } catch (err) {
    logger.warn({ err: (err as Error).message, reportId: report.id }, 'triagem da denúncia falhou');
    return report;
  }
}

/** A IA agindo como moderadora: aplica a própria decisão e deixa a trilha. */
async function enforce(report: Report, verdict: MlModerationVerdict): Promise<Report> {
  try {
    await applyAction({
      reportId: report.id,
      targetUserId: report.targetUserId,
      actorId: null,
      type: verdict.action as 'WARN' | 'SUSPEND' | 'BLOCK',
      reason: `Moderação automática: ${verdict.category} (${verdict.severity})`,
      days: verdict.suspend_days,
      metadata: {
        confidence: verdict.confidence,
        modelVersion: verdict.model_version,
        signals: verdict.signals,
      } as unknown as Prisma.InputJsonValue,
    });
    logger.warn(
      { reportId: report.id, targetUserId: report.targetUserId, action: verdict.action },
      'moderação automática aplicada',
    );
  } catch (err) {
    // Alvo é ADMIN, conta sumiu no meio do caminho: o veredito fica gravado e o admin
    // decide. Nunca derruba a criação da denúncia.
    logger.warn({ err: (err as Error).message, reportId: report.id }, 'moderação automática recusada');
  }
  return (await prisma.report.findUnique({ where: { id: report.id } })) ?? report;
}

export async function createReport(reporterId: string, input: CreateReportInput) {
  const { targetUserId, targetRefId, samples } = await resolveTarget(reporterId, input);
  if (targetUserId === reporterId) throw new BadRequestError('Não é possível denunciar a si mesmo');

  const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true } });
  if (!target) throw new NotFoundError('Usuário denunciado não encontrado');

  const report = await prisma.report.create({
    data: {
      reporterId,
      targetUserId,
      targetType: input.targetType ?? 'USER',
      targetRefId,
      reason: input.reason,
      description: input.description ?? null,
      evidence: input.evidence ?? [],
      bookingId: input.bookingId ?? null,
    },
  });

  // Triagem síncrona de propósito: quem denunciou espera ~1s a mais, e em troca uma
  // ameaça corroborada pode ser bloqueada AGORA, não quando um admin acordar. O custo
  // é limitado pelo timeout e pelo circuit breaker do mlClient.
  return triage(report, samples);
}

/** Admin: fila de denúncias, mais graves primeiro; as não triadas sobem junto. */
export async function listReports(status?: ReportStatus) {
  return prisma.report.findMany({
    where: status ? { status } : {},
    orderBy: [{ aiPriority: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }],
    take: 100,
  });
}

/** Admin: uma denúncia com o histórico completo — o da IA e o das ações manuais. */
export async function getReport(reportId: string) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new NotFoundError('Denúncia não encontrada');

  const [actions, targetHistory] = await Promise.all([
    prisma.moderationAction.findMany({ where: { reportId }, orderBy: { createdAt: 'asc' } }),
    prisma.moderationAction.findMany({
      where: { targetUserId: report.targetUserId, type: { not: 'AI_CLASSIFIED' } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
  ]);
  return { ...report, actions, targetHistory };
}

/** Admin: reexecuta a análise — útil quando a IA estava fora do ar na abertura. */
export async function reanalyze(reportId: string) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new NotFoundError('Denúncia não encontrada');
  const { samples } = await resolveTarget(report.reporterId, {
    targetType: report.targetType,
    targetUserId: report.targetUserId,
    serviceId: report.targetType === 'SERVICE' ? (report.targetRefId ?? undefined) : undefined,
    bookingId: report.bookingId ?? undefined,
    reason: report.reason,
  });
  return triage(report, samples);
}

/** Admin: muda só o status, sem aplicar consequência (ex.: assumir a análise). */
export async function updateReportStatus(adminId: string, reportId: string, status: ReportStatus) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new NotFoundError('Denúncia não encontrada');

  const resolved = status === 'RESOLVED' || status === 'DISMISSED';
  const updated = await prisma.report.update({
    where: { id: reportId },
    data: { status, resolvedById: resolved ? adminId : null, resolvedAt: resolved ? new Date() : null },
  });
  await writeAudit({
    userId: adminId,
    action: `REPORT_${status}`,
    entity: 'Report',
    entityId: reportId,
    metadata: { targetUserId: report.targetUserId },
  });
  return updated;
}
