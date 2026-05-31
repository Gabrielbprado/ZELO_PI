import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors';

export interface UpdateProfileInput {
  bio?: string | null;
  yearsExp?: number;
  priceFrom?: number;
  available?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  categoryIds?: string[];
}

export interface ServiceInput {
  title: string;
  description?: string;
  categoryId: string;
  priceMin: number;
  priceMax?: number;
  unit?: string;
}

const DEFAULT_SERVICE_UNIT = 'servico';

async function ensureProviderProfile(userId: string) {
  const profile = await prisma.providerProfile.findUnique({ where: { userId } });
  if (!profile) throw new ForbiddenError('Apenas profissionais podem acessar este recurso');
  return profile;
}

function emptyToNull(value: string | null | undefined): string | null {
  return value || null;
}

export async function getMyProviderProfile(userId: string) {
  const profile = await prisma.providerProfile.findUnique({
    where: { userId },
    include: {
      categories: { include: { category: true } },
      services: { orderBy: { createdAt: 'asc' } },
      portfolio: true,
    },
  });
  if (!profile) throw new NotFoundError('Perfil profissional não encontrado');
  return profile;
}

export async function updateMyProviderProfile(userId: string, input: UpdateProfileInput) {
  const profile = await ensureProviderProfile(userId);

  const data: Record<string, unknown> = {};
  if (input.bio !== undefined) data.bio = emptyToNull(input.bio);
  if (input.yearsExp !== undefined) data.yearsExp = input.yearsExp;
  if (input.priceFrom !== undefined) data.priceFrom = input.priceFrom;
  if (input.available !== undefined) data.available = input.available;

  // Coordinates land in the PostGIS `location` geography column, which Prisma
  // cannot write through `update()` — set it with a raw ST_MakePoint call.
  const hasCoordinates = input.latitude !== undefined && input.longitude !== undefined;

  if (input.categoryIds) {
    await replaceProviderCategories(profile.id, input.categoryIds);
  }

  if (Object.keys(data).length === 0 && !input.categoryIds && !hasCoordinates) {
    throw new BadRequestError('Nenhum campo enviado para atualização');
  }

  if (hasCoordinates) {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ProviderProfile"
         SET "location" = ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
       WHERE "id" = ${profile.id}
    `);
  }

  if (Object.keys(data).length === 0) {
    // Nothing left for Prisma to write (e.g. only coordinates/categories changed);
    // return the fresh profile so the caller still gets an up-to-date payload.
    return getMyProviderProfile(userId);
  }

  return prisma.providerProfile.update({
    where: { id: profile.id },
    data,
    include: {
      categories: { include: { category: true } },
      services: { orderBy: { createdAt: 'asc' } },
    },
  });
}

async function replaceProviderCategories(providerId: string, categoryIds: string[]): Promise<void> {
  await prisma.providerCategory.deleteMany({ where: { providerId } });
  if (categoryIds.length === 0) return;
  await prisma.providerCategory.createMany({
    data: categoryIds.map((categoryId) => ({ providerId, categoryId })),
  });
}

export async function createService(userId: string, input: ServiceInput) {
  const profile = await ensureProviderProfile(userId);
  return prisma.providerService.create({
    data: {
      providerId: profile.id,
      categoryId: input.categoryId,
      title: input.title,
      description: input.description,
      priceMin: input.priceMin,
      priceMax: input.priceMax,
      unit: input.unit ?? DEFAULT_SERVICE_UNIT,
    },
  });
}

export async function updateService(
  userId: string,
  serviceId: string,
  input: Partial<ServiceInput>,
) {
  const profile = await ensureProviderProfile(userId);
  const existing = await prisma.providerService.findUnique({ where: { id: serviceId } });
  if (!existing || existing.providerId !== profile.id) {
    throw new NotFoundError('Serviço não encontrado');
  }

  const data: Record<string, unknown> = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.description !== undefined) data.description = input.description;
  if (input.categoryId !== undefined) data.categoryId = input.categoryId;
  if (input.priceMin !== undefined) data.priceMin = input.priceMin;
  if (input.priceMax !== undefined) data.priceMax = input.priceMax;
  if (input.unit !== undefined) data.unit = input.unit;

  return prisma.providerService.update({ where: { id: serviceId }, data });
}

export async function deleteService(userId: string, serviceId: string): Promise<void> {
  const profile = await ensureProviderProfile(userId);
  const existing = await prisma.providerService.findUnique({ where: { id: serviceId } });
  if (!existing || existing.providerId !== profile.id) {
    throw new NotFoundError('Serviço não encontrado');
  }
  await prisma.providerService.delete({ where: { id: serviceId } });
}
