import { prisma } from '../config/prisma';
import { ForbiddenError, NotFoundError } from '../errors';
import { realtimeBus } from '../realtime/bus';
import { pushToUser } from './notifications.service';

export interface SendMessageInput {
  receiverId: string;
  bookingId?: string;
  content: string;
}

const THREAD_MAX_MESSAGES = 200;
const CONVERSATIONS_MAX = 50;
const MESSAGE_PREVIEW_MAX = 120;

export async function sendMessage(senderId: string, input: SendMessageInput) {
  if (input.receiverId === senderId) {
    throw new ForbiddenError('Não é possível enviar mensagem para você mesmo');
  }

  const [receiver, sender] = await Promise.all([
    prisma.user.findUnique({ where: { id: input.receiverId } }),
    prisma.user.findUnique({ where: { id: senderId }, select: { name: true } }),
  ]);
  if (!receiver) throw new NotFoundError('Destinatário não encontrado');

  if (input.bookingId) {
    await assertParticipatesInBooking(input.bookingId, senderId, input.receiverId);
  }

  const message = await prisma.message.create({
    data: {
      senderId,
      receiverId: input.receiverId,
      bookingId: input.bookingId,
      content: input.content,
    },
  });

  // Push to any connected sockets in real time. No-op without the realtime layer.
  realtimeBus.emitMessageCreated(message);

  // OS-level push for the offline/foreground case.
  await pushToUser(input.receiverId, {
    title: sender ? `Nova mensagem de ${sender.name}` : 'Nova mensagem',
    body: input.content.length > MESSAGE_PREVIEW_MAX
      ? `${input.content.slice(0, MESSAGE_PREVIEW_MAX)}…`
      : input.content,
    data: { type: 'MESSAGE', senderId, bookingId: input.bookingId ?? null },
  });

  return message;
}

async function assertParticipatesInBooking(
  bookingId: string,
  senderId: string,
  receiverId: string,
): Promise<void> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { provider: true },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');

  const participants = new Set([booking.clientId, booking.provider.userId]);
  if (!participants.has(senderId) || !participants.has(receiverId)) {
    throw new ForbiddenError('Você não participa deste agendamento');
  }
}

export async function listThread(userId: string, otherUserId: string) {
  return prisma.message.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: 'asc' },
    take: THREAD_MAX_MESSAGES,
  });
}

interface ConversationRow {
  other_id: string;
  last_at: Date;
  last_content: string;
  unread: bigint;
}

export async function listConversations(userId: string) {
  // senderId/receiverId are TEXT columns (Prisma `String @id @default(uuid())`),
  // so we compare them as text — casting the parameter to ::uuid here would
  // raise "operator does not exist: text = uuid" and silently empty the list.
  const rows = await prisma.$queryRaw<ConversationRow[]>`
    SELECT
      CASE WHEN "senderId" = ${userId} THEN "receiverId" ELSE "senderId" END AS other_id,
      MAX("createdAt") AS last_at,
      (ARRAY_AGG(content ORDER BY "createdAt" DESC))[1] AS last_content,
      SUM(CASE WHEN "receiverId" = ${userId} AND "readAt" IS NULL THEN 1 ELSE 0 END) AS unread
    FROM "Message"
    WHERE "senderId" = ${userId} OR "receiverId" = ${userId}
    GROUP BY other_id
    ORDER BY last_at DESC
    LIMIT ${CONVERSATIONS_MAX};
  `;

  const otherIds = rows.map((r) => r.other_id);
  const users = await prisma.user.findMany({
    where: { id: { in: otherIds } },
    select: { id: true, name: true, avatarHue: true, role: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  return rows.map((row) => ({
    user: userById.get(row.other_id),
    lastAt: row.last_at,
    lastContent: row.last_content,
    unread: Number(row.unread),
  }));
}

export async function markAsRead(userId: string, otherUserId: string): Promise<void> {
  await prisma.message.updateMany({
    where: { senderId: otherUserId, receiverId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export async function markAllAsRead(userId: string): Promise<{ updated: number }> {
  const { count } = await prisma.message.updateMany({
    where: { receiverId: userId, readAt: null },
    data: { readAt: new Date() },
  });
  return { updated: count };
}

export async function clearConversations(userId: string): Promise<{ deleted: number }> {
  const { count } = await prisma.message.deleteMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
    },
  });
  return { deleted: count };
}
