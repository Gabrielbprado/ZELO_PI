import { PrismaClient } from '@prisma/client';
import { isProd } from './env';

export const prisma = new PrismaClient({
  log: isProd ? ['error'] : ['query', 'error', 'warn'],
});

process.on('beforeExit', async () => {
  await prisma.$disconnect();
});
