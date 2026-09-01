import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

/**
 * Escreve uma trilha de auditoria. A tabela `AuditLog` existia desde o início do projeto e
 * NUNCA teve escritor — agora toda ação administrativa (aprovar KYC, resolver denúncia)
 * deixa rastro de quem fez, o quê e sobre qual entidade. Best-effort: uma falha de
 * auditoria não pode derrubar a ação de negócio.
 */
export async function writeAudit(entry: {
  userId: string;
  action: string;
  entity?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        entity: entry.entity ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata,
      },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, action: entry.action }, 'falha ao gravar auditoria');
  }
}
