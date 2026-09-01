import { z } from 'zod';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Único módulo que fala com o microserviço de notificações. Cópia estrutural do
 * `mlClient.service.ts`, e pela mesma razão: **nunca lança**. Timeout, 5xx, corpo
 * malformado, DNS — tudo degrada. Uma leitura de inbox que falha devolve lista vazia; um
 * "marcar como lido" que falha é engolido. O que não pode acontecer é `GET /notifications`
 * virar 500 porque o serviço extraído está hibernando no free tier.
 */

const notificationSchema = z.object({
  id: z.string(),
  userId: z.string(),
  type: z.string(),
  title: z.string(),
  body: z.string(),
  data: z.unknown().nullable().optional(),
  readAt: z.string().nullable().optional(),
  createdAt: z.string(),
});

const listResponseSchema = z.object({ items: z.array(notificationSchema) });

export type NotificationDto = z.infer<typeof notificationSchema>;

export function isNotificationsConfigured(): boolean {
  return env.NOTIFICATIONS_ENABLED && Boolean(env.NOTIFICATIONS_SERVICE_URL && env.NOTIFICATIONS_SERVICE_TOKEN);
}

async function call(path: string, init: RequestInit): Promise<Response | null> {
  if (!isNotificationsConfigured()) return null;
  try {
    return await fetch(`${env.NOTIFICATIONS_SERVICE_URL}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-SERVICE-TOKEN': env.NOTIFICATIONS_SERVICE_TOKEN as string,
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(env.NOTIFICATIONS_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    logger.warn({ err: timedOut ? 'timeout' : err }, 'serviço de notificações: falha na chamada');
    return null;
  }
}

/** Lista o inbox do usuário. Serviço fora do ar → lista vazia, nunca erro. */
export async function listNotifications(userId: string): Promise<NotificationDto[]> {
  const res = await call(`/internal/notifications?userId=${encodeURIComponent(userId)}`, { method: 'GET' });
  if (!res || !res.ok) return [];
  const parsed = listResponseSchema.safeParse(await res.json().catch(() => null));
  if (!parsed.success) {
    logger.warn('serviço de notificações: resposta fora do contrato');
    return [];
  }
  return parsed.data.items;
}

/** Marca uma notificação como lida. Best-effort — falha é engolida. */
export async function markNotificationRead(userId: string, id: string): Promise<void> {
  await call(`/internal/notifications/${encodeURIComponent(id)}/read?userId=${encodeURIComponent(userId)}`, {
    method: 'POST',
  });
}

/** Marca todas como lidas. Best-effort. */
export async function markAllNotificationsRead(userId: string): Promise<void> {
  await call(`/internal/notifications/read-all?userId=${encodeURIComponent(userId)}`, { method: 'POST' });
}
