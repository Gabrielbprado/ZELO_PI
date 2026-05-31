import { BookingStatus, Role } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';
import { pushToUser } from './notifications.service';

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
}

/** Which statuses each role is allowed to apply to a booking. */
const ALLOWED_STATUS_BY_ROLE: Readonly<Record<Role, ReadonlyArray<BookingStatus>>> = {
  PROVIDER: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
  CLIENT: ['CANCELLED'],
  ADMIN: ['ACCEPTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'],
};

const BOOKING_INCLUDE_FULL = {
  provider: { include: { user: { select: { id: true, name: true, avatarHue: true } } } },
  client: { select: { id: true, name: true, avatarHue: true } },
  category: true,
  review: true,
} as const;

export async function createBooking(input: CreateBookingInput) {
  const [provider, category] = await Promise.all([
    prisma.providerProfile.findUnique({ where: { id: input.providerId } }),
    prisma.category.findUnique({ where: { id: input.categoryId } }),
  ]);
  if (!provider) throw new NotFoundError('Profissional não encontrado');
  if (!category) throw new NotFoundError('Categoria não encontrada');
  if (!provider.available) throw new BadRequestError('Profissional indisponível no momento');

  return prisma.booking.create({
    data: {
      clientId: input.clientId,
      providerId: input.providerId,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      address: input.address,
      scheduledAt: input.scheduledAt ? new Date(input.scheduledAt) : undefined,
      urgency: input.urgency,
      priceEstimate: input.priceEstimate,
    },
  });
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
    include: { provider: true },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');

  assertBookingAccess(userId, role, booking.clientId, booking.provider.userId);
  assertTransitionAllowed(role, status);

  const completedAt = status === 'COMPLETED' ? new Date() : booking.completedAt;

  const updated = await prisma.booking.update({
    where: { id: bookingId },
    data: { status, priceFinal, completedAt },
  });

  if (status === 'COMPLETED') {
    await prisma.providerProfile.update({
      where: { id: booking.providerId },
      data: { jobsDone: { increment: 1 } },
    });
  }

  // Notify the client on the two highest-value transitions.
  if (status === 'ACCEPTED') {
    await pushToUser(booking.clientId, {
      title: 'Reserva aceita ✅',
      body: `${updated.title} foi aceito pelo profissional.`,
      data: { type: 'BOOKING', bookingId: updated.id, status },
    });
  } else if (status === 'COMPLETED') {
    await pushToUser(booking.clientId, {
      title: 'Serviço concluído 🎉',
      body: `${updated.title} foi marcado como concluído.`,
      data: { type: 'BOOKING', bookingId: updated.id, status },
    });
  }

  return updated;
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
