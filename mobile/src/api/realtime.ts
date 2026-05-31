import { io, type Socket } from 'socket.io-client';
import { API_PATH_PREFIX } from '../constants';
import { API_BASE_URL, tokenStore } from './client';

/** socket.io mount point on the backend (mirrors `REALTIME_PATH` there). */
const REALTIME_PATH = '/realtime';

export interface RealtimeMessage {
  id: string;
  senderId: string;
  receiverId: string;
  bookingId: string | null;
  content: string;
  createdAt: string;
  readAt: string | null;
}

/**
 * The socket connects to the server *origin* (host:port); the namespace path
 * is handled by the `path` option. `API_BASE_URL` ends with `/api/v1`, so we
 * strip that prefix to get the bare origin.
 */
function realtimeOrigin(): string {
  return API_BASE_URL.endsWith(API_PATH_PREFIX)
    ? API_BASE_URL.slice(0, -API_PATH_PREFIX.length)
    : API_BASE_URL;
}

let socket: Socket | null = null;

/**
 * Lazily create (or reuse) the shared authenticated socket. The current
 * access token is read from the same store the REST client uses, so the
 * handshake carries a valid JWT.
 */
export async function getRealtimeSocket(): Promise<Socket> {
  if (socket?.connected || socket?.active) return socket;
  const token = await tokenStore.getAccess();
  socket = io(realtimeOrigin(), {
    path: REALTIME_PATH,
    auth: { token: token ?? '' },
    transports: ['websocket'],
    reconnectionAttempts: 5,
  });
  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}
