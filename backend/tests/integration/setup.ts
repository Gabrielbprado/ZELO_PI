import { prisma } from '../../src/config/prisma';
import { getRedis, disconnectRedis } from '../../src/config/redis';

beforeAll(async () => {
  await truncateAll();
  await flushCache();
});

afterAll(async () => {
  // As conexões do Redis seguram o event loop; sem fechá-las o Jest não encerra
  // quando REDIS_ENABLED=true, e a suíte "passa" travada até o timeout do CI.
  await Promise.all([prisma.$disconnect(), disconnectRedis()]);
});

afterEach(async () => {
  await truncateAll();
  await flushCache();
});

/**
 * Truncar o banco sem limpar o cache deixaria chaves apontando para linhas que não
 * existem mais — um teste passaria com dado de outro, e o motivo seria dificílimo de
 * achar. Usa FLUSHDB, e não FLUSHALL: o banco lógico é só o desta suíte.
 */
async function flushCache(): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.flushdb();
  } catch {
    // Redis fora do ar é um cenário válido de teste, não um erro de setup.
  }
}

export async function truncateAll() {
  // ordem inversa de dependência para satisfazer FKs
  await prisma.$transaction([
    prisma.outboxEvent.deleteMany(),
    prisma.processedEvent.deleteMany(),
    prisma.report.deleteMany(),
    prisma.providerDocument.deleteMany(),
    prisma.recEvent.deleteMany(),
    prisma.review.deleteMany(),
    prisma.message.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.providerAvailability.deleteMany(),
    prisma.providerTimeOff.deleteMany(),
    prisma.providerService.deleteMany(),
    prisma.providerCategory.deleteMany(),
    prisma.portfolioItem.deleteMany(),
    prisma.budgetEstimate.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.providerProfile.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.category.deleteMany(),
  ]);
}
