import type { ReportReason, ReportStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../errors';
import { writeAudit } from './audit.service';

/**
 * Denúncias entre usuários (opcionalmente ligadas a um booking), moderadas por ADMIN.
 * Toda mudança de status deixa trilha em `AuditLog`.
 */

export async function createReport(reporterId: string, input: {
  targetUserId: string;
  reason: ReportReason;
  description?: string;
  bookingId?: string;
}) {
  if (input.targetUserId === reporterId) throw new BadRequestError('Não é possível denunciar a si mesmo');
  const target = await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true } });
  if (!target) throw new NotFoundError('Usuário denunciado não encontrado');

  return prisma.report.create({
    data: {
      reporterId,
      targetUserId: input.targetUserId,
      reason: input.reason,
      description: input.description ?? null,
      bookingId: input.bookingId ?? null,
    },
  });
}

/** Admin: lista denúncias, opcionalmente filtradas por status. */
export async function listReports(status?: ReportStatus) {
  return prisma.report.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function updateReportStatus(adminId: string, reportId: string, status: ReportStatus) {
  const report = await prisma.report.findUnique({ where: { id: reportId } });
  if (!report) throw new NotFoundError('Denúncia não encontrada');

  const resolved = status === 'RESOLVED' || status === 'DISMISSED';
  const updated = await prisma.report.update({
    where: { id: reportId },
    data: { status, resolvedById: resolved ? adminId : null, resolvedAt: resolved ? new Date() : null },
  });
  await writeAudit({ userId: adminId, action: `REPORT_${status}`, entity: 'Report', entityId: reportId, metadata: { targetUserId: report.targetUserId } });
  return updated;
}
