import type { Server as IOServer, Socket } from 'socket.io';
import { prisma } from '../config/prisma';
import { getRedis } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Rastreamento de deslocamento em tempo real.
 *
 * Quando o profissional inicia o deslocamento até o cliente, ele emite a própria posição
 * a cada poucos segundos; o servidor valida que quem emite é MESMO o profissional daquele
 * booking e retransmite para a sala do booking — o cliente vê o ponto se aproximando ao
 * vivo. A última posição fica no Redis (efêmera) para que um cliente que abre a tela
 * depois já receba de imediato onde o profissional está.
 *
 * Segurança: a autorização é resolvida UMA vez no join (uma query), cacheada no socket, e
 * cada `location:update` só é aceito de quem entrou como `provider` daquele booking — sem
 * bater no banco a cada ping.
 */
export const TRACKING_EVENTS = {
  JOIN: 'tracking:join',
  LEAVE: 'tracking:leave',
  LOCATION_UPDATE: 'location:update',
  LOCATION_PROVIDER: 'location:provider',
} as const;

const LAST_LOCATION_TTL_SEC = 600;
type Role = 'client' | 'provider';

interface LocationPayload {
  bookingId: string;
  lat: number;
  lng: number;
}

function bookingRoom(bookingId: string): string {
  return `booking:${bookingId}`;
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && typeof lng === 'number' &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
  );
}

async function resolveRole(userId: string, bookingId: string): Promise<Role | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { provider: { select: { userId: true } } },
  });
  if (!booking) return null;
  if (booking.clientId === userId) return 'client';
  if (booking.provider.userId === userId) return 'provider';
  return null;
}

async function readLastLocation(bookingId: string): Promise<(LocationPayload & { at: string }) | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(`track:${bookingId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function writeLastLocation(payload: LocationPayload & { at: string }): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(`track:${payload.bookingId}`, JSON.stringify(payload), 'EX', LAST_LOCATION_TTL_SEC);
  } catch {
    // Best-effort: sem Redis, o relay ao vivo continua funcionando, só não há "última posição".
  }
}

export function registerTracking(io: IOServer, socket: Socket): void {
  const userId = socket.data.userId as string;
  // bookingId → papel do usuário naquele booking, resolvido no join.
  const roles = new Map<string, Role>();
  socket.data.trackingRoles = roles;

  socket.on(TRACKING_EVENTS.JOIN, async (raw: { bookingId?: string }, ack?: (r: unknown) => void) => {
    const bookingId = raw?.bookingId;
    if (typeof bookingId !== 'string') return ack?.({ ok: false, error: 'bookingId inválido' });

    const role = await resolveRole(userId, bookingId);
    if (!role) return ack?.({ ok: false, error: 'sem acesso a este booking' });

    roles.set(bookingId, role);
    await socket.join(bookingRoom(bookingId));

    // Quem entra recebe a última posição conhecida, se houver.
    const last = await readLastLocation(bookingId);
    if (last) socket.emit(TRACKING_EVENTS.LOCATION_PROVIDER, last);
    ack?.({ ok: true, role });
  });

  socket.on(TRACKING_EVENTS.LOCATION_UPDATE, async (raw: LocationPayload) => {
    const bookingId = raw?.bookingId;
    // Só o PROFISSIONAL daquele booking pode emitir posição, e só se já entrou na sala.
    if (typeof bookingId !== 'string' || roles.get(bookingId) !== 'provider') return;
    if (!isValidCoord(raw.lat, raw.lng)) return;

    const payload = { bookingId, lat: raw.lat, lng: raw.lng, at: new Date().toISOString() };
    // Retransmite para a sala, exceto para o próprio emissor.
    socket.to(bookingRoom(bookingId)).emit(TRACKING_EVENTS.LOCATION_PROVIDER, payload);
    await writeLastLocation(payload);
  });

  socket.on(TRACKING_EVENTS.LEAVE, (raw: { bookingId?: string }) => {
    const bookingId = raw?.bookingId;
    if (typeof bookingId !== 'string') return;
    roles.delete(bookingId);
    void socket.leave(bookingRoom(bookingId));
  });

  void io; // reservado para broadcasts futuros a partir do servidor
  logger.debug({ userId }, 'tracking: handlers registrados');
}
