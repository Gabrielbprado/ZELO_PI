import { prisma } from '../config/prisma';
import { ForbiddenError, NotFoundError } from '../errors';
import { realtimeBus } from '../realtime/bus';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';

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

  const preview = input.content.length > MESSAGE_PREVIEW_MAX
    ? `${input.content.slice(0, MESSAGE_PREVIEW_MAX)}…`
    : input.content;

  const message = await prisma.$transaction(async (tx) => {
    const m = await tx.message.create({
      data: {
        senderId,
        receiverId: input.receiverId,
        bookingId: input.bookingId,
        content: input.content,
      },
    });
    await recordEvent(tx, ROUTING_KEYS.MESSAGE_CREATED, {
      messageId: m.id,
      senderId,
      receiverId: input.receiverId,
      senderName: sender?.name ?? 'Alguém',
      preview,
      bookingId: input.bookingId ?? null,
    });
    return m;
  });

  // Push to any connected sockets in real time. No-op without the realtime layer.
  // (O realtime é in-process e imediato; nada a ver com o push OS-level, que agora sai
  // do evento message.created no microserviço de notificações.)
  realtimeBus.emitMessageCreated(message);

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

/**
 * Os ids do schema são `String` no Prisma, ou seja, colunas `text` no Postgres — e não
 * `uuid`, apesar do `@default(uuid())`. Uma versão anterior desta query castava o
 * parâmetro para `::uuid`, o que produzia `text = uuid`, um operador que não existe:
 * TODA chamada respondia 500 e a lista de conversas nunca carregava. Não adicione o
 * cast de volta sem antes mudar o tipo da coluna.
 */
export async function listConversations(userId: string) {
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
