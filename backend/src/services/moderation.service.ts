import { Prisma, type ModerationActionType, type ReportStatus } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, NotFoundError } from '../errors';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';
import { ONE_DAY_MS } from '../constants/time';
import { writeAudit } from './audit.service';

/**
 * Onde uma decisão de moderação vira efeito — e o ÚNICO lugar onde isso acontece.
 *
 * A IA e o admin entram pela mesma porta (`applyAction`), com a única diferença sendo
 * `actorId` (nulo = a IA). Isso não é elegância: é o que garante que uma suspensão
 * automática e uma manual produzam exatamente o mesmo estado, a mesma linha de
 * histórico, a mesma auditoria e a mesma notificação. Dois caminhos separados
 * divergiriam no primeiro ajuste, e o histórico — que é a razão de tudo isto existir —
 * passaria a contar duas histórias diferentes.
 *
 * Estado do usuário, em três níveis:
 * - **Advertência**: só registro + aviso. Nada muda no acesso.
 * - **Suspensão**: `suspendedUntil` no futuro. Login recusado até a data; volta sozinha.
 * - **Bloqueio**: `isActive = false`. Login recusado e o perfil some das buscas
 *   (`providers.service` e `recommendations.service` já filtram por `isActive`).
 */

/** Suspensão padrão quando quem decide não informa prazo. */
export const DEFAULT_SUSPEND_DAYS = 7;

/**
 * `AI_CLASSIFIED` fica de fora: é o REGISTRO de que a IA analisou, não uma decisão que se
 * aplica a alguém. Excluí-lo no tipo (em vez de barrá-lo em runtime) faz o compilador
 * recusar a chamada errada antes de ela existir.
 */
export type AppliedActionType = Exclude<ModerationActionType, 'AI_CLASSIFIED'>;

export interface ApplyActionInput {
  reportId?: string | null;
  targetUserId: string;
  /** `null` = a própria IA decidiu. */
  actorId: string | null;
  type: AppliedActionType;
  reason?: string | null;
  /** Só para SUSPEND. */
  days?: number | null;
  metadata?: Prisma.InputJsonValue;
}

/** Ações que encerram a denúncia, e com qual status. */
const RESOLVES_AS: Partial<Record<AppliedActionType, ReportStatus>> = {
  ACCEPT: 'RESOLVED',
  WARN: 'RESOLVED',
  SUSPEND: 'RESOLVED',
  BLOCK: 'RESOLVED',
  REJECT: 'DISMISSED',
  REQUEST_INFO: 'AWAITING_INFO',
};

export async function applyAction(input: ApplyActionInput) {
  const [target, report] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, role: true } }),
    input.reportId
      ? prisma.report.findUnique({ where: { id: input.reportId }, select: { id: true, reporterId: true } })
      : null,
  ]);
  if (!target) throw new NotFoundError('Usuário não encontrado');
  if (input.reportId && !report) throw new NotFoundError('Denúncia não encontrada');
  // Um admin não pode ser suspenso/bloqueado pela moderação — nem pela IA, nem por outro
  // admin. Tirar o acesso de quem modera é uma forma de negar o serviço à própria
  // moderação, e a saída para um admin problemático é a troca de papel, não a denúncia.
  if (target.role === 'ADMIN' && ['SUSPEND', 'BLOCK'].includes(input.type)) {
    throw new BadRequestError('Não é possível suspender ou bloquear um administrador');
  }

  const expiresAt =
    input.type === 'SUSPEND'
      ? new Date(Date.now() + (input.days ?? DEFAULT_SUSPEND_DAYS) * ONE_DAY_MS)
      : null;

  const action = await prisma.$transaction(async (tx) => {
    if (input.type === 'SUSPEND') {
      await tx.user.update({ where: { id: target.id }, data: { suspendedUntil: expiresAt } });
      // Suspender sem invalidar a sessão viva deixaria a pessoa usando o app até o token
      // expirar — a punição só começaria a valer no próximo login, que é justamente o que
      // ela não vai fazer.
      await tx.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (input.type === 'BLOCK') {
      await tx.user.update({ where: { id: target.id }, data: { isActive: false } });
      await tx.refreshToken.updateMany({
        where: { userId: target.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    if (input.type === 'UNBLOCK') {
      await tx.user.update({
        where: { id: target.id },
        data: { isActive: true, suspendedUntil: null },
      });
    }

    const created = await tx.moderationAction.create({
      data: {
        reportId: input.reportId ?? null,
        targetUserId: target.id,
        actorId: input.actorId,
        type: input.type,
        reason: input.reason ?? null,
        metadata: input.metadata,
        expiresAt,
      },
    });

    const resolvesAs = RESOLVES_AS[input.type];
    if (input.reportId && resolvesAs) {
      const closing = resolvesAs === 'RESOLVED' || resolvesAs === 'DISMISSED';
      await tx.report.update({
        where: { id: input.reportId },
        data: {
          status: resolvesAs,
          // `resolvedById` continua nulo quando quem resolveu foi a IA — a autoria fica
          // em ModerationAction.actorId, que sabe distinguir os dois casos.
          resolvedById: closing ? input.actorId : null,
          resolvedAt: closing ? new Date() : null,
        },
      });
    }

    await recordEvent(tx, ROUTING_KEYS.MODERATION_ACTIONED, {
      actionId: created.id,
      reportId: input.reportId ?? null,
      targetUserId: target.id,
      // "Faltam informações" é conversa com quem DENUNCIOU; o resto é com o alvo.
      notifyUserId: input.type === 'REQUEST_INFO' ? (report?.reporterId ?? target.id) : target.id,
      type: input.type,
      reason: input.reason ?? null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      automated: input.actorId === null,
    });

    return created;
  });

  await writeAudit({
    userId: input.actorId,
    action: `MODERATION_${input.type}`,
    entity: 'Report',
    entityId: input.reportId ?? undefined,
    metadata: {
      targetUserId: target.id,
      automated: input.actorId === null,
      ...(expiresAt && { expiresAt: expiresAt.toISOString() }),
      ...(input.reason && { reason: input.reason }),
    },
  });

  return action;
}

/** Histórico de moderação de um usuário — o que a IA e os admins já fizeram sobre ele. */
export async function listUserHistory(targetUserId: string, take = 50) {
  return prisma.moderationAction.findMany({
    where: { targetUserId },
    orderBy: { createdAt: 'desc' },
    take,
  });
}
