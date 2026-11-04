import { BookingStatus, Prisma, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS, type RoutingKey } from '../events/types';
import { invalidateSlots } from './availability.service';

export type Urgency = 'EMERGENCY' | 'TODAY' | 'THIS_WEEK' | 'FLEXIBLE';
export type AllowedBookingStatus = 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface CreateBookingInput {
  clientId: string;
  providerId: string;
  categoryId: string;
  title: string;
  description?: string;
  address: string;
  scheduledAt?: string;
  urgency: Urgency;
  priceEstimate?: number;
  durationMinutes?: number;
  needsOnSiteQuote?: boolean;
  // Presente quando o booking nasceu de um card de recomendação. Viaja no evento
  // `booking.created` e reabastece o sinal de conversão do recomendador.
  requestId?: string;
}

const DEFAULT_DURATION_MINUTES = 60;
// Um booking que começa mais de 8h antes do fim do slot não pode se sobrepor a ele —
// limita a janela de busca de conflitos ao índice [providerId, scheduledAt].
const MAX_BOOKING_WINDOW_MS = 8 * 60 * 60 * 1000;

/** Which statuses each role is allowed to apply to a booking. */
const ALLOWED_STATUS_BY_ROLE: Readonly<Record<Role, ReadonlyArray<BookingStatus>>> = {
  PROVIDER: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  CLIENT: ['CANCELLED'],
  ADMIN: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
};

/** Qual evento de domínio cada transição emite. IN_PROGRESS não gera evento. */
const TRANSITION_EVENT: Partial<Record<AllowedBookingStatus, RoutingKey>> = {
  ACCEPTED: ROUTING_KEYS.BOOKING_ACCEPTED,
  COMPLETED: ROUTING_KEYS.BOOKING_COMPLETED,
  CANCELLED: ROUTING_KEYS.BOOKING_CANCELLED,
};

const BOOKING_INCLUDE_FULL = {
  provider: { include: { user: { select: { id: true, name: true, avatarHue: true } } } },
  client: { select: { id: true, name: true, avatarHue: true } },
  category: true,
  reviews: { select: { id: true, authorId: true, targetId: true, rating: true, comment: true } },
  // Trazido junto para o cliente saber se um booking COMPLETED ainda precisa de pagamento —
  // permite badge "Falta pagar" na lista sem N+1.
  payment: { select: { id: true, status: true, method: true, amount: true } },
} as const;

export async function createBooking(input: CreateBookingInput) {
  const [provider, category] = await Promise.all([
    prisma.providerProfile.findUnique({ where: { id: input.providerId } }),
    prisma.category.findUnique({ where: { id: input.categoryId } }),
  ]);
  if (!provider) throw new NotFoundError('Profissional não encontrado');
  if (!category) throw new NotFoundError('Categoria não encontrada');
  if (!provider.available) throw new BadRequestError('Profissional indisponível no momento');

  const duration = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : null;

  // Booking e evento nascem na MESMA transação: o `booking.created` só existe se o
  // booking existe, e vice-versa. É o outbox transacional na sua forma mais simples.
  const booking = await prisma.$transaction(async (tx) => {
    if (scheduledAt) {
      // Trava a linha do profissional durante a transação: serializa criações
      // concorrentes para o MESMO profissional, fechando a corrida entre "checou livre"
      // e "inseriu". Sem isso, dois clientes poderiam reservar o mesmo horário.
      await tx.$executeRaw`SELECT id FROM "ProviderProfile" WHERE id = ${input.providerId} FOR UPDATE`;
      await assertSlotFree(tx, input.providerId, scheduledAt, duration);
    }

    const created = await tx.booking.create({
      data: {
        clientId: input.clientId,
        providerId: input.providerId,
        categoryId: input.categoryId,
        title: input.title,
        description: input.description,
        address: input.address,
        scheduledAt: scheduledAt ?? undefined,
        durationMinutes: duration,
        urgency: input.urgency,
        priceEstimate: input.priceEstimate,
        needsOnSiteQuote: input.needsOnSiteQuote ?? false,
      },
    });

    await recordEvent(tx, ROUTING_KEYS.BOOKING_CREATED, {
      bookingId: created.id,
      clientId: created.clientId,
      providerId: created.providerId,
      providerUserId: provider.userId,
      categoryId: created.categoryId,
      title: created.title,
      recRequestId: input.requestId ?? null,
    });

    return created;
  });

  if (scheduledAt) await invalidateSlots(input.providerId);
  return booking;
}

/** Lança ConflictError se `[scheduledAt, +duration)` colide com um booking ativo do profissional. */
async function assertSlotFree(
  tx: Prisma.TransactionClient,
  providerId: string,
  scheduledAt: Date,
  durationMinutes: number,
): Promise<void> {
  const startMs = scheduledAt.getTime();
  const endMs = startMs + durationMinutes * 60_000;
  const candidates = await tx.booking.findMany({
    where: {
      providerId,
      status: { in: ['REQUESTED', 'ACCEPTED', 'IN_PROGRESS'] },
      scheduledAt: { gte: new Date(startMs - MAX_BOOKING_WINDOW_MS), lt: new Date(endMs) },
    },
    select: { scheduledAt: true, durationMinutes: true },
  });
  const overlaps = candidates.some((b) => {
    if (!b.scheduledAt) return false;
    const bs = b.scheduledAt.getTime();
    const be = bs + b.durationMinutes * 60_000;
    return startMs < be && endMs > bs;
  });
  if (overlaps) throw new ConflictError('Este horário já está reservado para o profissional');
}

export async function listUserBookings(userId: string, role: Role) {
  const where =
    role === 'PROVIDER' ? { provider: { userId } } : { clientId: userId };

  return prisma.booking.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: BOOKING_INCLUDE_FULL,
  });
}

export async function updateBookingStatus(
  bookingId: string,
  userId: string,
  role: Role,
  status: AllowedBookingStatus,
  priceFinal?: number,
) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { provider: true, payment: { select: { id: true, status: true } } },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');

  assertBookingAccess(userId, role, booking.clientId, booking.provider.userId);
  assertTransitionAllowed(role, status);
  if (typeof priceFinal === 'number') {
    assertNoActivePaymentBeforePriceChange(booking.payment);
  }

  const completedAt = status === 'COMPLETED' ? new Date() : booking.completedAt;

  // A mudança de status, o incremento de jobsDone e o evento de transição commitam
  // juntos: o consumidor nunca vê um `booking.completed` cujo booking ainda está em
  // andamento, nem o contrário.
  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.booking.update({
      where: { id: bookingId },
      data: { status, priceFinal, completedAt },
    });

    if (status === 'COMPLETED') {
      await tx.providerProfile.update({
        where: { id: booking.providerId },
        data: { jobsDone: { increment: 1 } },
      });
    }

    const key = TRANSITION_EVENT[status];
    if (key) {
      await recordEvent(tx, key, {
        bookingId: u.id,
        clientId: u.clientId,
        providerUserId: booking.provider.userId,
        title: u.title,
      });
    }

    return u;
  });

  // A notificação (inbox + push) do cliente sai agora do evento booking.accepted /
  // booking.completed, tratado pelo microserviço de notificações. Removido o await
  // bloqueante no caminho da request: a transição responde sem esperar por push.
  return updated;
}

/**
 * Edita apenas o priceFinal do booking. Somente o profissional dono do agendamento pode
 * mexer — o valor é o que ele vai cobrar. Não emite evento de transição (o status não muda);
 * evita notificar o cliente como se fosse um novo booking.accepted/completed. O cliente
 * enxerga o novo valor na próxima leitura do detalhe.
 */
export async function updateBookingPrice(
  bookingId: string,
  userId: string,
  role: Role,
  priceFinal: number,
) {
  if (role !== 'PROVIDER' && role !== 'ADMIN') {
    throw new ForbiddenError('Apenas o profissional pode alterar o valor');
  }
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { provider: true, payment: { select: { id: true, status: true } } },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');
  if (role === 'PROVIDER' && booking.provider.userId !== userId) {
    throw new ForbiddenError('Acesso negado');
  }
  if (booking.status === 'CANCELLED') {
    throw new BadRequestError('Não é possível alterar o valor de um agendamento cancelado');
  }
  assertNoActivePaymentBeforePriceChange(booking.payment);
  return prisma.booking.update({ where: { id: bookingId }, data: { priceFinal } });
}

export async function getBookingById(id: string, userId: string, role: Role) {
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { ...BOOKING_INCLUDE_FULL, payment: true },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');

  assertBookingAccess(userId, role, booking.clientId, booking.provider.userId);
  return booking;
}

function assertBookingAccess(
  userId: string,
  role: Role,
  clientId: string,
  providerUserId: string,
): void {
  const isClient = clientId === userId;
  const isProvider = providerUserId === userId;
  if (!isClient && !isProvider && role !== 'ADMIN') {
    throw new ForbiddenError('Você não tem acesso a este agendamento');
  }
}

function assertTransitionAllowed(role: Role, status: AllowedBookingStatus): void {
  const allowed = ALLOWED_STATUS_BY_ROLE[role] ?? [];
  if (!allowed.includes(status as BookingStatus)) {
    throw new ForbiddenError('Você não pode aplicar essa transição');
  }
}

function assertNoActivePaymentBeforePriceChange(payment: { id: string; status: string } | null): void {
  if (payment && ['PENDING', 'AUTHORIZED', 'PAID'].includes(payment.status)) {
    throw new BadRequestError('Não é possível alterar o valor depois que há pagamento ativo');
  }
}
