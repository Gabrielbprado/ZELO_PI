import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/notificationsClient.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

/**
 * Gateway do inbox. Deixou de falar com o Prisma: a tabela `Notification` mudou-se para o
 * microserviço de notificações (schema próprio) e o backend agora só encaminha, com
 * degradação segura — se o serviço cai, a lista vem vazia em vez de 500.
 */
export const list = asyncHandler(async (req, res) => {
  const items = await listNotifications(req.user!.sub);
  res.json({ items });
});

export const markRead = asyncHandler(async (req, res) => {
  await markNotificationRead(req.user!.sub, req.params.id);
  res.status(HttpStatus.NO_CONTENT).end();
});

export const markAllRead = asyncHandler(async (req, res) => {
  await markAllNotificationsRead(req.user!.sub);
  res.status(HttpStatus.NO_CONTENT).end();
});
