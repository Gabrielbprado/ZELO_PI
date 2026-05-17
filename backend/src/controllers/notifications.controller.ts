import { prisma } from '../config/prisma';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

const NOTIFICATIONS_LIMIT = 100;

export const list = asyncHandler(async (req, res) => {
  const items = await prisma.notification.findMany({
    where: { userId: req.user!.sub },
    orderBy: { createdAt: 'desc' },
    take: NOTIFICATIONS_LIMIT,
  });
  res.json({ items });
});

export const markRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.sub, id: req.params.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(HttpStatus.NO_CONTENT).end();
});

export const markAllRead = asyncHandler(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.user!.sub, readAt: null },
    data: { readAt: new Date() },
  });
  res.status(HttpStatus.NO_CONTENT).end();
});
