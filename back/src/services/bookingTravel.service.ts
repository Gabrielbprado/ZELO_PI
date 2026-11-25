import { BookingTravelStatus, Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getRedis } from '../config/redis';
import {
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
  ServiceUnavailableError,
} from '../errors';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';
import { logger } from '../utils/logger';

/**
 * Sessão de rastreamento em tempo real do deslocamento prestador→cliente.
 *
 * Princípio: o Postgres é dono do CICLO DE VIDA (status/timestamps); o Redis é dono
 * da COORDENADA ATUAL. Coordenadas nunca tocam o Postgres, o outbox, logs nem Sentry.
 *
 * Encerramento é SEMPRE coordenado por este service — não pelo mobile. Ao chegar,
 * cancelar ou expirar, a transição de status acontece ANTES da tentativa de
 * `redis.del`. Se o Redis falhar, as leituras ainda são bloqueadas pelo estado no
 * DB (`getCurrentLocation` retorna 410 Gone); um job de retry reaplica o `del`
 * periodicamente até sucesso. O TTL da chave é só uma rede de segurança.
 */

const REDIS_KEY_PREFIX = 'zelo:travel:';
const LOCATION_TTL_SEC = 60;
// Limite sanity para rejeitar coordenadas obviamente ruins. Bogus coords (0,0) são
// aceitas formalmente porque existem em alto-mar; o filtro aqui é só para
// 90°N em longitude, -200 em latitude, etc.
const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

export interface TravelLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  recordedAt: string; // ISO 8601 do device
}

export interface TravelLocation extends TravelLocationInput {
  bookingId: string;
  providerId: string;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
  receivedAt: string;
}

export interface TravelSession {
  id: string;
  bookingId: string;
  providerId: string;
  status: BookingTravelStatus;
  startedAt: Date;
  arrivedAt: Date | null;
  endedAt: Date | null;
  endReason: string | null;
}

function redisKey(bookingId: string): string {
  return `${REDIS_KEY_PREFIX}${bookingId}:location`;
}

function isValidCoord(lat: unknown, lng: unknown): boolean {
  return (
    typeof lat === 'number' && Number.isFinite(lat) &&
    typeof lng === 'number' && Number.isFinite(lng) &&
    lat >= LAT_MIN && lat <= LAT_MAX &&
    lng >= LNG_MIN && lng <= LNG_MAX
  );
}

async function assertProviderOwnsBooking(userId: string, bookingId: string): Promise<{ providerId: string; clientId: string; providerUserId: string }> {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    select: {
      clientId: true,
      provider: { select: { id: true, userId: true } },
    },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');
  if (booking.provider.userId !== userId) throw new ForbiddenError('Apenas o profissional pode gerenciar o deslocamento');
  return { providerId: booking.provider.id, clientId: booking.clientId, providerUserId: booking.provider.userId };
}

/**
 * Inicia uma sessão de deslocamento. Idempotente: se já existe uma ACTIVE para o
 * mesmo booking+provider, devolve a existente. Qualquer outro estado (ARRIVED,
 * CANCELLED) exige encerrar a anterior antes.
 */
export async function startTravel(userId: string, bookingId: string): Promise<TravelSession> {
  const { providerId, clientId, providerUserId } = await assertProviderOwnsBooking(userId, bookingId);

  // Start precisa ser idempotente também sob corrida: duas chamadas paralelas podem ver
  // findUnique=null e as duas tentam create — a segunda bate em unique(bookingId)=P2002.
  // Tratamos o P2002 como "alguém ganhou a corrida" e relemos o resultado consolidado,
  // devolvendo-o como se fosse a primeira. O `recordEvent` fica dentro da tx ganhadora,
  // então evento sai uma vez só. A tx perdedora não re-publica — é no-op completa.
  try {
    const session = await prisma.$transaction(async (tx) => {
      const existing = await tx.bookingTravel.findUnique({ where: { bookingId } });
      if (existing) {
        if (existing.status === BookingTravelStatus.ACTIVE && existing.providerId === providerId) {
          return existing; // idempotente
        }
        throw new ConflictError('Já existe sessão de deslocamento para este agendamento');
      }

      const created = await tx.bookingTravel.create({
        data: {
          bookingId,
          providerId,
          status: BookingTravelStatus.ACTIVE,
        },
      });

      await recordEvent(tx, ROUTING_KEYS.TRAVEL_STARTED, {
        bookingId,
        providerId,
        providerUserId,
        clientId,
        startedAt: created.startedAt.toISOString(),
      });

      return created;
    });

    logger.info({ bookingId, providerId }, 'travel: sessão iniciada');
    return session;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const existing = await prisma.bookingTravel.findUnique({ where: { bookingId } });
      if (existing && existing.status === BookingTravelStatus.ACTIVE && existing.providerId === providerId) {
        return existing;
      }
      throw new ConflictError('Já existe sessão de deslocamento para este agendamento');
    }
    throw err;
  }
}

/**
 * Transição interna ACTIVE→(ARRIVED|CANCELLED). Encapsula:
 *   1) updateMany com guarda de status (impede corrida);
 *   2) publicação do evento no outbox dentro da MESMA transação;
 *   3) tentativa de del no Redis fora da transação (idempotente);
 *   4) resposta idempotente quando a sessão já estava encerrada.
 */
async function endTravel(
  bookingId: string,
  nextStatus: Exclude<BookingTravelStatus, 'ACTIVE'>,
  reason: 'arrived' | 'cancelled' | 'timeout',
  requireActorUserId?: string | null,
): Promise<{ session: TravelSession; changed: boolean }> {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.bookingTravel.findUnique({
      where: { bookingId },
      include: { booking: { select: { clientId: true, provider: { select: { userId: true } } } } },
    });
    if (!existing) throw new NotFoundError('Sessão de deslocamento não encontrada');

    // Admin pode cancelar; prestador só pode encerrar a sua própria.
    if (requireActorUserId && existing.booking.provider.userId !== requireActorUserId) {
      throw new ForbiddenError('Sem permissão sobre esta sessão');
    }

    if (existing.status !== BookingTravelStatus.ACTIVE) {
      return { session: existing, changed: false };
    }

    const now = new Date();
    const transition = await tx.bookingTravel.updateMany({
      where: { id: existing.id, status: BookingTravelStatus.ACTIVE },
      data: {
        status: nextStatus,
        arrivedAt: nextStatus === BookingTravelStatus.ARRIVED ? now : null,
        endedAt: now,
        endReason: reason,
      },
    });

    if (transition.count === 0) {
      // Alguém venceu a corrida — devolve o estado atual.
      const fresh = await tx.bookingTravel.findUniqueOrThrow({ where: { id: existing.id } });
      return { session: fresh, changed: false };
    }

    const updated = await tx.bookingTravel.findUniqueOrThrow({ where: { id: existing.id } });

    await recordEvent(tx, ROUTING_KEYS.TRAVEL_ENDED, {
      bookingId,
      providerId: existing.providerId,
      providerUserId: existing.booking.provider.userId,
      clientId: existing.booking.clientId,
      reason,
      endedAt: now.toISOString(),
    });

    return { session: updated, changed: true };
  });

  if (result.changed) {
    // A verdade do encerramento está no DB. O Redis é cache; se falha em apagar,
    // o estado ACTIVE já é false e `getCurrentLocation` responde 410. O job de
    // retry reaplica o `del` até sucesso.
    await deleteLocationBestEffort(bookingId);
  }

  return result;
}

/** Marca chegada. Idempotente. */
export async function arrivedTravel(userId: string, bookingId: string): Promise<TravelSession> {
  await assertProviderOwnsBooking(userId, bookingId);
  const { session } = await endTravel(bookingId, BookingTravelStatus.ARRIVED, 'arrived', userId);
  return session;
}

/** Cancela a sessão explicitamente (provider ou admin). */
export async function cancelTravel(userId: string | null, bookingId: string): Promise<TravelSession> {
  // admin=userId null → não checa dono; qualquer outro valor precisa ser dono.
  const { session } = await endTravel(bookingId, BookingTravelStatus.CANCELLED, 'cancelled', userId);
  return session;
}

/**
 * Encerra sessões abandonadas (chamado pelo job de timeout e pelo listener de booking.cancelled).
 * Devolve `{ changed }` para que callers (como o job de timeout) possam contar apenas as
 * transições efetivas; uma segunda chamada idempotente conta como `changed:false`.
 */
export async function cancelTravelInternal(
  bookingId: string,
  reason: 'cancelled' | 'timeout',
): Promise<{ changed: boolean }> {
  const nextStatus = BookingTravelStatus.CANCELLED;
  try {
    const { changed } = await endTravel(bookingId, nextStatus, reason, null);
    return { changed };
  } catch (err) {
    if (err instanceof NotFoundError) return { changed: false };
    throw err;
  }
}

/**
 * Append da coordenada atual. Rejeita silenciosamente (retorna `accepted:false`)
 * quando a sessão não está ACTIVE, para não vazar informação sobre estado da sessão
 * para um atacante que tentou enviar após o encerramento. O caller (REST/socket)
 * decide se traduz isso em 204 silencioso ou 410 explícito.
 */
export async function recordLocation(
  userId: string,
  bookingId: string,
  input: TravelLocationInput,
): Promise<{ accepted: boolean; reason?: 'inactive' | 'invalid_coord' | 'wrong_provider' | 'redis_down' }> {
  if (!isValidCoord(input.latitude, input.longitude)) {
    return { accepted: false, reason: 'invalid_coord' };
  }

  // Busca sessão + confere ownership em uma só query.
  const session = await prisma.bookingTravel.findUnique({
    where: { bookingId },
    select: {
      status: true,
      providerId: true,
      provider: { select: { userId: true } },
    },
  });
  if (!session || session.status !== BookingTravelStatus.ACTIVE) {
    return { accepted: false, reason: 'inactive' };
  }
  if (session.provider.userId !== userId) {
    return { accepted: false, reason: 'wrong_provider' };
  }

  const redis = getRedis();
  if (!redis) {
    // Sem Redis, não há onde armazenar. REST responde 503; socket descarta.
    return { accepted: false, reason: 'redis_down' };
  }

  const payload: TravelLocation = {
    bookingId,
    providerId: session.providerId,
    latitude: input.latitude,
    longitude: input.longitude,
    accuracy: input.accuracy ?? null,
    heading: input.heading ?? null,
    speed: input.speed ?? null,
    recordedAt: input.recordedAt,
    receivedAt: new Date().toISOString(),
  };

  try {
    await redis.set(redisKey(bookingId), JSON.stringify(payload), 'EX', LOCATION_TTL_SEC);
  } catch (err) {
    logger.warn({ bookingId, err: (err as Error).message }, 'travel: falha ao gravar posição no redis');
    return { accepted: false, reason: 'redis_down' };
  }

  return { accepted: true };
}

/**
 * Lê a última posição. Responde:
 *   - sessão não existe        → `NotFoundError`
 *   - sessão não está ACTIVE   → `ConflictError` (410 Gone no controller)
 *   - Redis fora                → `BadRequestError` (503 no controller)
 *   - sem posição ainda         → `null` com HTTP 200 (sessão ok, só aguardando)
 */
export async function getCurrentLocation(userId: string, bookingId: string): Promise<TravelLocation | null> {
  const session = await prisma.bookingTravel.findUnique({
    where: { bookingId },
    select: {
      status: true,
      provider: { select: { userId: true } },
      booking: { select: { clientId: true } },
    },
  });
  if (!session) throw new NotFoundError('Sessão de deslocamento não encontrada');

  // Autorização dupla: client dono ou provider dono.
  const isClient = session.booking.clientId === userId;
  const isProvider = session.provider.userId === userId;
  if (!isClient && !isProvider) throw new ForbiddenError('Sem acesso a esta sessão');

  if (session.status !== BookingTravelStatus.ACTIVE) {
    throw new GoneError('Sessão de deslocamento encerrada');
  }

  const redis = getRedis();
  if (!redis) throw new ServiceUnavailableError('Redis indisponível — posição não pode ser consultada no momento');

  let raw: string | null;
  try {
    raw = await redis.get(redisKey(bookingId));
  } catch {
    throw new ServiceUnavailableError('Falha ao consultar posição');
  }

  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TravelLocation;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Tenta apagar a chave Redis. Idempotente — chamado por `endTravel` e pelo job de
 * retry. Nunca lança: o estado do DB é a verdade; isto é só a limpeza do cache.
 */
export async function deleteLocationBestEffort(bookingId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    await redis.del(redisKey(bookingId));
    return true;
  } catch (err) {
    logger.warn({ bookingId, err: (err as Error).message }, 'travel: falha ao deletar chave redis (será retentado)');
    return false;
  }
}

/** Para o job de retry: lista sessões encerradas recentemente cuja chave ainda pode existir. */
export async function recentlyEndedSessions(withinMs: number, limit = 100): Promise<Array<{ bookingId: string }>> {
  const cutoff = new Date(Date.now() - withinMs);
  return prisma.bookingTravel.findMany({
    where: {
      status: { in: [BookingTravelStatus.ARRIVED, BookingTravelStatus.CANCELLED] },
      endedAt: { gte: cutoff },
    },
    select: { bookingId: true },
    take: limit,
  });
}

/** Para o job de timeout: sessões ACTIVE antigas são forçosamente canceladas. */
export async function staleActiveSessions(olderThanMs: number, limit = 100): Promise<Array<{ bookingId: string }>> {
  const cutoff = new Date(Date.now() - olderThanMs);
  return prisma.bookingTravel.findMany({
    where: {
      status: BookingTravelStatus.ACTIVE,
      startedAt: { lt: cutoff },
    },
    select: { bookingId: true },
    take: limit,
  });
}

// Apenas para testes: expor o shape de validação sem ter que exportar coordenadas.
export const __test__ = {
  isValidCoord,
  redisKey,
  LOCATION_TTL_SEC,
} as const;

// Silence `Prisma` import quando só usamos tipos.
void Prisma;
