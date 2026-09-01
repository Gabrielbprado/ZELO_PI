import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { cacheKeys, invalidate, withCache } from './cache.service';
import { invalidateProviderCaches } from './providers.service';
import { recordEvent } from '../events/domainBus';
import { ROUTING_KEYS } from '../events/types';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors';

export interface CreateReviewInput {
  bookingId: string;
  rating: number;
  comment?: string;
}

const REVIEW_DECIMAL_PLACES = 2;
const PROVIDER_REVIEWS_LIMIT = 50;

/**
 * Cria uma avaliação. É BIDIRECIONAL: o cliente avalia o profissional e o profissional
 * avalia o cliente — cada um uma vez por contratação (`@@unique([bookingId, authorId])`).
 * A nota exibida do profissional só muda quando é o CLIENTE que avalia.
 */
export async function createReview(authorId: string, input: CreateReviewInput) {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { provider: { select: { id: true, userId: true } } },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');

  const isClient = booking.clientId === authorId;
  const isProvider = booking.provider.userId === authorId;
  if (!isClient && !isProvider) throw new ForbiddenError('Você não participa deste agendamento');
  if (booking.status !== 'COMPLETED') throw new BadRequestError('Avaliação só após conclusão');

  // Cliente avalia o profissional; profissional avalia o cliente.
  const targetUserId = isClient ? booking.provider.userId : booking.clientId;

  const existing = await prisma.review.findUnique({
    where: { bookingId_authorId: { bookingId: input.bookingId, authorId } },
  });
  if (existing) throw new ConflictError('Você já avaliou esta contratação');

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: { bookingId: input.bookingId, authorId, targetId: targetUserId, rating: input.rating, comment: input.comment },
    });

    // Recalcula a média do profissional por AVG REAL, dentro da transação — não é mais
    // read-modify-write, então fecha a corrida que duas avaliações simultâneas abriam.
    if (isClient) {
      const agg = await tx.review.aggregate({ where: { targetId: targetUserId }, _avg: { rating: true }, _count: true });
      await tx.providerProfile.update({
        where: { id: booking.provider.id },
        data: { ratingAvg: Number((agg._avg.rating ?? 0).toFixed(REVIEW_DECIMAL_PLACES)), ratingCount: agg._count },
      });
    }

    await recordEvent(tx, ROUTING_KEYS.REVIEW_CREATED, {
      reviewId: created.id,
      bookingId: input.bookingId,
      authorId,
      targetUserId,
      providerId: booking.provider.id,
      rating: input.rating,
    });
    return created;
  });

  if (isClient) {
    await Promise.all([
      invalidateProviderCaches(booking.provider.id),
      invalidate(cacheKeys.reviews(booking.provider.id)),
    ]);
  }
  return review;
}

export async function listReviewsByProvider(providerId: string) {
  const reviews = await withCache(cacheKeys.reviews(providerId), env.CACHE_TTL_REVIEWS_SEC, async () => {
    const provider = await prisma.providerProfile.findUnique({ where: { id: providerId } });
    if (!provider) return undefined;

    return prisma.review.findMany({
      where: { targetId: provider.userId },
      include: { author: { select: { id: true, name: true, avatarHue: true } } },
      orderBy: { createdAt: 'desc' },
      take: PROVIDER_REVIEWS_LIMIT,
    });
  });
  if (!reviews) throw new NotFoundError('Profissional não encontrado');
  return reviews;
}
