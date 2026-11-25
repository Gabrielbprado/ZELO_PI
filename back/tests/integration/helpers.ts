import request from 'supertest';
import bcrypt from 'bcryptjs';
import type { Express } from 'express';
import { prisma } from '../../src/config/prisma';
import { signAccessToken } from '../../src/utils/tokens';

let appCache: Express | undefined;

export async function getApp(): Promise<Express> {
  if (appCache) return appCache;
  const { createApp } = await import('../../src/app');
  appCache = createApp();
  return appCache;
}

export const STRONG_PASSWORD = 'Senha@123';

export async function createUser(overrides: Partial<{
  email: string;
  name: string;
  role: 'CLIENT' | 'PROVIDER' | 'ADMIN';
  password: string;
}> = {}) {
  const password = overrides.password ?? STRONG_PASSWORD;
  const passwordHash = await bcrypt.hash(password, 4);
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}-${Math.random()}@zero.test`,
      name: overrides.name ?? 'Test User',
      passwordHash,
      role: overrides.role ?? 'CLIENT',
      emailVerified: true,
    },
  });
}

export async function createProvider(opts: { category?: string } = {}) {
  const category = await prisma.category.upsert({
    where: { id: opts.category ?? 'plumb' },
    update: {},
    create: { id: 'plumb', name: 'Encanador', iconKey: 'plumb', hue: 210, order: 1 },
  });
  const user = await createUser({ role: 'PROVIDER', email: `pro-${Date.now()}@zero.test` });
  const provider = await prisma.providerProfile.create({
    data: {
      userId: user.id,
      bio: 'Test provider',
      kycStatus: 'VERIFIED',
      kycVerifiedAt: new Date(),
      yearsExp: 5,
      jobsDone: 10,
      ratingAvg: 4.8,
      ratingCount: 20,
      priceFrom: 100,
      categories: { create: { categoryId: category.id } },
    },
  });
  return { user, provider, category };
}

export function tokenFor(user: { id: string; role: 'CLIENT' | 'PROVIDER' | 'ADMIN'; email: string }): string {
  return signAccessToken({ sub: user.id, role: user.role, email: user.email });
}

export async function authedAgent(role: 'CLIENT' | 'PROVIDER' | 'ADMIN' = 'CLIENT') {
  const user = await createUser({ role });
  const app = await getApp();
  const token = tokenFor(user);
  return {
    user,
    token,
    request: () => request(app),
    get:    (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post:   (url: string) => request(app).post(url).set('Authorization', `Bearer ${token}`),
    patch:  (url: string) => request(app).patch(url).set('Authorization', `Bearer ${token}`),
    delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
  };
}
