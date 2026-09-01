import type { KycDocType } from '@prisma/client';
import { prisma } from '../config/prisma';
import { NotFoundError } from '../errors';
import { invalidateProviderCaches } from './providers.service';
import { writeAudit } from './audit.service';

/**
 * Verificação de documentos (KYC). O profissional envia documentos; um ADMIN aprova ou
 * rejeita. A aprovação promove o selo `kycStatus` do perfil para VERIFIED — é ele que vira
 * o "selo verificado" no app. Toda decisão do admin deixa trilha em `AuditLog`.
 */

async function resolveProviderId(userId: string): Promise<string> {
  const p = await prisma.providerProfile.findUnique({ where: { userId }, select: { id: true } });
  if (!p) throw new NotFoundError('Perfil de profissional não encontrado');
  return p.id;
}

export async function submitDocument(userId: string, input: { type: KycDocType; fileKey: string }) {
  const providerId = await resolveProviderId(userId);
  return prisma.providerDocument.create({
    data: { providerId, type: input.type, fileKey: input.fileKey, status: 'PENDING' },
  });
}

export async function listMyDocuments(userId: string) {
  const providerId = await resolveProviderId(userId);
  return prisma.providerDocument.findMany({ where: { providerId }, orderBy: { createdAt: 'desc' } });
}

/** Admin: fila de documentos aguardando revisão, com quem enviou. */
export async function listPendingDocuments() {
  return prisma.providerDocument.findMany({
    where: { status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    include: { provider: { include: { user: { select: { id: true, name: true, email: true } } } } },
  });
}

export async function approveDocument(adminId: string, docId: string) {
  const doc = await prisma.providerDocument.findUnique({ where: { id: docId } });
  if (!doc) throw new NotFoundError('Documento não encontrado');

  const updated = await prisma.$transaction(async (tx) => {
    const d = await tx.providerDocument.update({
      where: { id: docId },
      data: { status: 'APPROVED', reviewedById: adminId, reviewedAt: new Date(), rejectionReason: null },
    });
    // Aprovar um documento verifica o profissional — é o que acende o selo no app.
    await tx.providerProfile.update({
      where: { id: doc.providerId },
      data: { kycStatus: 'VERIFIED', kycVerifiedAt: new Date() },
    });
    return d;
  });

  await writeAudit({ userId: adminId, action: 'KYC_APPROVE', entity: 'ProviderDocument', entityId: docId, metadata: { providerId: doc.providerId } });
  await invalidateProviderCaches(doc.providerId);
  return updated;
}

export async function rejectDocument(adminId: string, docId: string, reason: string) {
  const doc = await prisma.providerDocument.findUnique({ where: { id: docId } });
  if (!doc) throw new NotFoundError('Documento não encontrado');

  const updated = await prisma.providerDocument.update({
    where: { id: docId },
    data: { status: 'REJECTED', reviewedById: adminId, reviewedAt: new Date(), rejectionReason: reason },
  });
  await writeAudit({ userId: adminId, action: 'KYC_REJECT', entity: 'ProviderDocument', entityId: docId, metadata: { providerId: doc.providerId, reason } });
  return updated;
}
