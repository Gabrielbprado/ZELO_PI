import { prisma } from '../../src/config/prisma';

beforeAll(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});

afterEach(async () => {
  await truncateAll();
});

export async function truncateAll() {
  // ordem inversa de dependência para satisfazer FKs
  await prisma.$transaction([
    prisma.review.deleteMany(),
    prisma.message.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.providerService.deleteMany(),
    prisma.providerCategory.deleteMany(),
    prisma.portfolioItem.deleteMany(),
    prisma.budgetEstimate.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.providerProfile.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.category.deleteMany(),
  ]);
}
