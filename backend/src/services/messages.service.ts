import { prisma } from '../config/prisma';
import { ForbiddenError, NotFoundError } from '../errors';

export interface SendMessageInput {
  receiverId: string;
  bookingId?: string;
  content: string;
}

const THREAD_MAX_MESSAGES = 200;
const CONVERSATIONS_MAX = 50;

export async function sendMessage(senderId: string, input: SendMessageInput) {
  if (input.receiverId === senderId) {
    throw new ForbiddenError('Não é possível enviar mensagem para você mesmo');
  }

  const receiver = await prisma.user.findUnique({ where: { id: input.receiverId } });
  if (!receiver) throw new NotFoundError('Destinatário não encontrado');

  if (input.bookingId) {
    await assertParticipatesInBooking(input.bookingId, senderId, input.receiverId);
  }

  return prisma.message.create({
    data: {
      senderId,
      receiverId: input.receiverId,
      bookingId: input.bookingId,
      content: input.content,
    },
  });
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
  const rows = await prisma.$queryRaw<ConversationRow[]>`
    SELECT
      CASE WHEN "senderId" = ${userId}::uuid THEN "receiverId" ELSE "senderId" END AS other_id,
      MAX("createdAt") AS last_at,
      (ARRAY_AGG(content ORDER BY "createdAt" DESC))[1] AS last_content,
      SUM(CASE WHEN "receiverId" = ${userId}::uuid AND "readAt" IS NULL THEN 1 ELSE 0 END) AS unread
    FROM "Message"
    WHERE "senderId" = ${userId}::uuid OR "receiverId" = ${userId}::uuid
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
