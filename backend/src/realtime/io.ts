import type { Server as HttpServer } from 'http';
import { Server as IOServer, type Socket } from 'socket.io';
import { corsOrigins } from '../config/env';
import { logger } from '../utils/logger';
import { verifyAccessToken } from '../utils/tokens';
import { realtimeBus, REALTIME_EVENTS } from './bus';
import { registerTracking } from './tracking';
import type { Message } from '@prisma/client';

/** socket.io mount point — kept distinct from the REST API (`/api/v1`). */
export const REALTIME_PATH = '/realtime';

function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Pull the access token from the handshake. Clients may pass it either as
 * `auth.token` (preferred) or via the `Authorization: Bearer …` header.
 */
function extractHandshakeToken(socket: Socket): string | null {
  const fromAuth = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.length > 0) return fromAuth;

  const header = socket.handshake.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length).trim();
    if (token.length > 0) return token;
  }
  return null;
}

function serializeMessage(message: Message) {
  return {
    id: message.id,
    senderId: message.senderId,
    receiverId: message.receiverId,
    bookingId: message.bookingId,
    content: message.content,
    createdAt: message.createdAt,
    readAt: message.readAt,
  };
}

/**
 * Attach a JWT-authenticated socket.io server to an existing HTTP server.
 *
 * - Same CORS allowlist as the REST API (`CORS_ORIGINS`).
 * - The handshake is rejected unless it carries a valid access token; the
 *   authenticated user joins a private `user:<id>` room.
 * - When a message is persisted, the domain bus fires `message:new` and we
 *   fan it out to both participants' rooms.
 */
export function createRealtime(httpServer: HttpServer): IOServer {
  const allowAllOrigins = corsOrigins.includes('*');
  const io = new IOServer(httpServer, {
    path: REALTIME_PATH,
    cors: {
      origin: allowAllOrigins ? true : corsOrigins,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = extractHandshakeToken(socket);
    if (!token) return next(new Error('unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    socket.join(userRoom(userId));
    logger.debug({ userId, socketId: socket.id }, 'realtime: client connected');

    // Rastreamento de deslocamento em tempo real (GPS do profissional → cliente).
    registerTracking(io, socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ userId, socketId: socket.id, reason }, 'realtime: client disconnected');
    });
  });

  realtimeBus.onMessageCreated((message) => {
    const payload = serializeMessage(message);
    io.to(userRoom(message.receiverId))
      .to(userRoom(message.senderId))
      .emit(REALTIME_EVENTS.MESSAGE_NEW, payload);
  });

  return io;
}
