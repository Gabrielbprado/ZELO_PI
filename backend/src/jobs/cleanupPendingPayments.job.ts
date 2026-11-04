import { PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';
import { isAsaasConfigured } from '../services/asaasClient.service';

const PENDING_TTL_HOURS = 24;
const PENDING_STATUSES: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.AUTHORIZED];

export async function cleanupStalePendingPayments(): Promise<{ cleaned: number }> {
  const cutoff = new Date(Date.now() - PENDING_TTL_HOURS * 60 * 60 * 1000);

  const stalePayments = await prisma.payment.findMany({
    where: {
      status: { in: PENDING_STATUSES },
      createdAt: { lt: cutoff },
    },
    include: { booking: true },
  });

  let cleaned = 0;

  for (const payment of stalePayments) {
    let shouldFail = false;
    let reason = '';

    if (!payment.externalId) {
      shouldFail = true;
      reason = 'no_external_id_after_ttl';
    } else if (payment.externalId.startsWith('pending_') || payment.externalId.startsWith('idem_')) {
      shouldFail = true;
      reason = 'temporary_external_id_expired';
    } else if (payment.method !== 'cash' && !isAsaasConfigured()) {
      shouldFail = true;
      reason = 'asaas_not_configured';
    }

    if (shouldFail) {
      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', externalId: null },
        });
        await tx.auditLog.create({
          data: {
            userId: null,
            action: 'PAYMENT_STALE_CLEANUP',
            entity: 'Payment',
            entityId: payment.id,
            metadata: { reason, bookingId: payment.bookingId, amount: payment.amount } as Prisma.InputJsonValue,
          },
        });
      });
      cleaned++;
      logger.info({ paymentId: payment.id, reason }, 'pagamento stale limpo');
    }
  }

  return { cleaned };
}