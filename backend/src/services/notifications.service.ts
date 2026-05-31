import { env } from '../config/env';
import { prisma } from '../config/prisma';
import { logger } from '../utils/logger';

/**
 * Expo push tokens look like `ExponentPushToken[xxxx]` (or `ExpoPushToken[…]`).
 * Anything else — notably the web target, which has no native token — is a
 * no-op so the caller never has to branch on platform.
 */
const EXPO_PUSH_TOKEN_RE = /^Expo(nent)?PushToken\[.+\]$/;

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Best-effort OS-level push to a single user via Expo's HTTP/2 push API.
 *
 * This NEVER throws into the business flow — a failed push must not roll back
 * a booking or a payment. Failures are logged and swallowed. It is also a
 * no-op when the kill-switch is off, the user has no token, or the token is
 * not a native Expo token (e.g. web).
 */
export async function pushToUser(userId: string, payload: PushPayload): Promise<void> {
  try {
    if (!env.PUSH_ENABLED) {
      logger.debug({ userId }, 'push disabled (PUSH_ENABLED=false)');
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { pushToken: true },
    });
    const token = user?.pushToken;
    if (!token || !EXPO_PUSH_TOKEN_RE.test(token)) return;

    await sendExpoPush(token, payload);
  } catch (err) {
    logger.warn({ err, userId }, 'push notification failed');
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
    logger.warn({ status: res.status }, 'expo push API returned a non-2xx status');
  }
}
