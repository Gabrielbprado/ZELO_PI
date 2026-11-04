import type { Server as IOServer, Socket } from 'socket.io';
import { logger } from '../utils/logger';
import {
  recordLocation,
  getCurrentLocation,
  type TravelLocationInput,
} from '../services/bookingTravel.service';
import { prisma } from '../config/prisma';
import { BookingTravelStatus } from '@prisma/client';

/**
 * Rastreamento em tempo real (socket). O fluxo é:
 *
 *   1) Prestador chama `POST /bookings/:id/travel/start` (REST). Backend cria
 *      `BookingTravel` ACTIVE e publica `travel.started` no outbox.
 *   2) Prestador e cliente entram na sala via `travel:join`. O handler confere no DB
 *      que a sessão está ACTIVE e autoriza. Tipo é cacheado no socket.
 *   3) Prestador emite `travel:location:update` a cada ~3s. Handler delega para
 *      `recordLocation`, que valida sessão+authz, escreve no Redis e retransmite
 *      para a sala. Se a sessão não estiver mais ativa, descarta silenciosamente
 *      — cliente malicioso não aprende que o bypass foi barrado.
 *   4) Prestador chama `POST /bookings/:id/travel/arrived` (ou `/cancel`).
 *      Backend encerra a sessão e emite `travel:ended` para a sala — AMBOS os lados
 *      limpam o estado local e desligam o GPS.
 *
 * Observe o que esta camada NÃO faz: não decide encerrar, não valida dono do booking,
 * não publica no outbox. Isso tudo é responsabilidade do service.
 */

export const TRAVEL_EVENTS = {
  JOIN: 'travel:join',
  LEAVE: 'travel:leave',
  LOCATION_UPDATE: 'travel:location:update',
  // Broadcast para o cliente (mesmo nome, direção oposta — o socket distingue
  // por quem envia; o guard em `recordLocation` garante que só o provider ativo
  // pode emitir).
  STARTED: 'travel:started',
  ENDED: 'travel:ended',
} as const;

// Janela mínima entre dois updates aceitos do mesmo socket+booking. O mobile emite
// a cada 3-5s; qualquer frequência acima disto é cliente malcomportado ou atacante.
const LOCATION_UPDATE_MIN_INTERVAL_MS = 1000;

type Role = 'client' | 'provider';

interface JoinPayload { bookingId?: string }
interface LeavePayload { bookingId?: string }
interface UpdatePayload extends Partial<TravelLocationInput> { bookingId?: string }

function bookingRoom(bookingId: string): string {
  return `booking:${bookingId}`;
}

/**
 * Resolve o papel do usuário no booking E confere que existe uma sessão ACTIVE.
 * Mantém a autorização em uma só query — não batemos no banco por update.
 */
async function resolveActiveRole(userId: string, bookingId: string): Promise<Role | null> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      clientId: true,
      provider: { select: { userId: true } },
      travel: { select: { status: true } },
    },
  });
  if (!booking) return null;
  if (!booking.travel || booking.travel.status !== BookingTravelStatus.ACTIVE) return null;
  if (booking.clientId === userId) return 'client';
  if (booking.provider.userId === userId) return 'provider';
  return null;
}

export function registerTracking(io: IOServer, socket: Socket): void {
  const userId = socket.data.userId as string;

  // Estado por socket, sem precisar de Redis:
  //   roles:       bookingId → papel no booking (cacheado no JOIN).
  //   isActive:    bookingId → sessão está ACTIVE agora? (zerado em `travel:ended`).
  //   lastUpdate:  bookingId → timestamp do último update aceito (anti-flood).
  const roles = new Map<string, Role>();
  const isActive = new Map<string, boolean>();
  const lastUpdate = new Map<string, number>();
  socket.data.trackingRoles = roles;

  socket.on(TRAVEL_EVENTS.JOIN, async (raw: JoinPayload, ack?: (r: unknown) => void) => {
    const bookingId = raw?.bookingId;
    if (typeof bookingId !== 'string') return ack?.({ ok: false, error: 'bookingId inválido' });

    const role = await resolveActiveRole(userId, bookingId);
    if (!role) return ack?.({ ok: false, error: 'sem acesso ou sessão inativa' });

    roles.set(bookingId, role);
    isActive.set(bookingId, true);
    await socket.join(bookingRoom(bookingId));

    // Quem entra recebe a última posição conhecida, se houver (via service, que já
    // respeita status da sessão e authz).
    try {
      const last = await getCurrentLocation(userId, bookingId);
      if (last) socket.emit(TRAVEL_EVENTS.LOCATION_UPDATE, last);
    } catch {
      /* se falhou em ler, o cliente ainda assim entra — próximo update preenche */
    }
    ack?.({ ok: true, role });
  });

  socket.on(TRAVEL_EVENTS.LOCATION_UPDATE, async (raw: UpdatePayload) => {
    const bookingId = raw?.bookingId;
    // Só o PROVIDER com sessão ACTIVE conhecida localmente pode emitir.
    if (typeof bookingId !== 'string' || roles.get(bookingId) !== 'provider') return;
    if (!isActive.get(bookingId)) return;

    // Throttle — descarta silenciosamente. Já defendido com guard no service também.
    const now = Date.now();
    const prev = lastUpdate.get(bookingId);
    if (prev !== undefined && now - prev < LOCATION_UPDATE_MIN_INTERVAL_MS) return;
    lastUpdate.set(bookingId, now);

    const lat = raw.latitude;
    const lng = raw.longitude;
    if (typeof lat !== 'number' || typeof lng !== 'number') return;

    const result = await recordLocation(userId, bookingId, {
      latitude: lat,
      longitude: lng,
      accuracy: raw.accuracy ?? null,
      heading: raw.heading ?? null,
      speed: raw.speed ?? null,
      recordedAt: raw.recordedAt ?? new Date().toISOString(),
    });

    if (!result.accepted) {
      // Sessão encerrada entre o JOIN e o update: zera o flag local para parar de
      // tentar. O cliente malicioso não é notificado — serviço continua silencioso.
      if (result.reason === 'inactive') isActive.set(bookingId, false);
      return;
    }

    // Retransmite para a sala. NÃO logamos nem armazenamos em outro lugar.
    const payload = {
      bookingId,
      latitude: lat,
      longitude: lng,
      accuracy: raw.accuracy ?? null,
      heading: raw.heading ?? null,
      speed: raw.speed ?? null,
      recordedAt: raw.recordedAt ?? new Date().toISOString(),
    };
    socket.to(bookingRoom(bookingId)).emit(TRAVEL_EVENTS.LOCATION_UPDATE, payload);
  });

  socket.on(TRAVEL_EVENTS.LEAVE, (raw: LeavePayload) => {
    const bookingId = raw?.bookingId;
    if (typeof bookingId !== 'string') return;
    roles.delete(bookingId);
    isActive.delete(bookingId);
    lastUpdate.delete(bookingId);
    void socket.leave(bookingRoom(bookingId));
  });

  void io;
  logger.debug({ userId }, 'travel: handlers registrados');
}

/**
 * Broadcasts externos (chamados pelo listener do outbox quando `travel.started/ended`
 * é consumido). Mantidos aqui para que o módulo seja o único lugar que conhece o
 * canal `booking:<id>` e os nomes dos eventos.
 */
export function broadcastTravelStarted(io: IOServer, bookingId: string, startedAt: string): void {
  io.to(bookingRoom(bookingId)).emit(TRAVEL_EVENTS.STARTED, { bookingId, startedAt });
}

export function broadcastTravelEnded(
  io: IOServer,
  bookingId: string,
  reason: 'arrived' | 'cancelled' | 'timeout',
  endedAt: string,
): void {
  io.to(bookingRoom(bookingId)).emit(TRAVEL_EVENTS.ENDED, { bookingId, reason, endedAt });
}
