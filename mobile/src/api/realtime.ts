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

// ─── Rastreamento de deslocamento em tempo real ──────────────────────────────

export interface ProviderLocation {
  bookingId: string;
  lat: number;
  lng: number;
  at: string;
  accuracy?: number | null;
  speed?: number | null;
}

/** Payload cru do backend (`travel:location:update`) — coordenadas e timestamp completos. */
interface TravelLocationPayload {
  bookingId: string;
  latitude: number;
  longitude: number;
  recordedAt: string;
  accuracy?: number | null;
  speed?: number | null;
}

export interface TrackingJoinResult {
  ok: boolean;
  role?: 'client' | 'provider';
  error?: string;
}

/** Entra na sala de rastreamento do booking. Resolve com o papel (cliente/profissional). */
export async function joinTracking(bookingId: string): Promise<TrackingJoinResult> {
  const s = await getRealtimeSocket();
  return new Promise((resolve) => {
    s.timeout(5000).emit('travel:join', { bookingId }, (err: unknown, res: TrackingJoinResult) => {
      resolve(err ? { ok: false, error: 'timeout' } : res);
    });
  });
}

/** Assina as atualizações de posição do profissional. Devolve um unsubscribe. */
export async function onProviderLocation(cb: (loc: ProviderLocation) => void): Promise<() => void> {
  const s = await getRealtimeSocket();
  const handler = (raw: TravelLocationPayload) =>
    cb({
      bookingId: raw.bookingId,
      lat: raw.latitude,
      lng: raw.longitude,
      at: raw.recordedAt,
      accuracy: raw.accuracy ?? null,
      speed: raw.speed ?? null,
    });
  s.on('travel:location:update', handler);
  return () => s.off('travel:location:update', handler);
}

/** (Profissional) Publica a própria posição. */
export async function emitLocation(
  bookingId: string,
  lat: number,
  lng: number,
  accuracy?: number | null,
  speed?: number | null,
  recordedAt?: string,
): Promise<void> {
  const s = await getRealtimeSocket();
  s.emit('travel:location:update', {
    bookingId,
    latitude: lat,
    longitude: lng,
    accuracy: accuracy ?? null,
    speed: speed ?? null,
    recordedAt: recordedAt ?? new Date().toISOString(),
  });
}

export async function leaveTracking(bookingId: string): Promise<void> {
  const s = await getRealtimeSocket();
  s.emit('travel:leave', { bookingId });
}
