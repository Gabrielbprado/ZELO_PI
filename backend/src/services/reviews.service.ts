import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { cacheKeys, invalidate, withCache } from './cache.service';
import { invalidateProviderCaches } from './providers.service';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../errors';

export interface CreateReviewInput {
  bookingId: string;
  rating: number;
  comment?: string;
}

const REVIEW_DECIMAL_PLACES = 2;
const PROVIDER_REVIEWS_LIMIT = 50;

export async function createReview(authorId: string, input: CreateReviewInput) {
  const booking = await prisma.booking.findUnique({
    where: { id: input.bookingId },
    include: { provider: { include: { user: true } } },
  });
  if (!booking) throw new NotFoundError('Agendamento não encontrado');
  if (booking.clientId !== authorId) {
    throw new ForbiddenError('Apenas o contratante pode avaliar');
  }
  if (booking.status !== 'COMPLETED') {
    throw new BadRequestError('Avaliação só após conclusão');
  }

  const existing = await prisma.review.findUnique({ where: { bookingId: input.bookingId } });
  if (existing) throw new ConflictError('Esta contratação já foi avaliada');

  const targetUserId = booking.provider.userId;
  const nextAverage = await recalcAverage(booking.providerId, input.rating);

  const [review] = await prisma.$transaction([
    prisma.review.create({
      data: {
        bookingId: input.bookingId,
        authorId,
        targetId: targetUserId,
        rating: input.rating,
        comment: input.comment,
      },
    }),
    prisma.providerProfile.update({
      where: { id: booking.providerId },
      data: {
        ratingAvg: { set: nextAverage },
        ratingCount: { increment: 1 },
      },
    }),
  ]);

  // A nota entra no card e no perfil; sem invalidar, o cache serviria a média
  // anterior por até 5 minutos logo após o cliente avaliar.
  await Promise.all([
    invalidateProviderCaches(booking.providerId),
    invalidate(cacheKeys.reviews(booking.providerId)),
  ]);

  return review;
}

async function recalcAverage(providerId: string, newRating: number): Promise<number> {
  const profile = await prisma.providerProfile.findUnique({ where: { id: providerId } });
  if (!profile) return newRating;
  const total = profile.ratingAvg * profile.ratingCount + newRating;
  const count = profile.ratingCount + 1;
  return Number((total / count).toFixed(REVIEW_DECIMAL_PLACES));
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
