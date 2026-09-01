import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logger } from '../config/logger';

/**
 * Envio de push Expo — movido do backend para cá. A diferença de arquitetura: o token
 * vem da RÉPLICA local (`PushToken`), sincronizada por evento, e não da tabela `User` de
 * outro serviço. O serviço de notificações não conhece a identidade; conhece só o que
 * precisa para entregar.
 *
 * Continua best-effort: um push que falha não pode derrubar a persistência do inbox, que
 * é a parte durável. O inbox já foi gravado (com retry/DLQ) antes daqui.
 */
const EXPO_PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!env.PUSH_ENABLED) return;

    const row = await prisma.pushToken.findUnique({ where: { userId } });
    const token = row?.token;
    if (!token || !EXPO_PUSH_TOKEN_RE.test(token)) return;

    await sendExpoPush(token, payload);
  } catch (err) {
    logger.warn({ err, userId }, 'push falhou');
  }
}

async function sendExpoPush(token: string, payload: PushPayload): Promise<void> {
  const res = await fetch(env.EXPO_PUSH_API_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify({
      to: token,
      title: payload.title,
      body: payload.body,
      data: payload.data ?? {},
      sound: 'default',
      priority: 'high',
    }),
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, 'expo push API respondeu não-2xx');
  }
}
