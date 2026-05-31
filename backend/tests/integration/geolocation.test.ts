import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { getApp, authedAgent } from './helpers';
import { prisma } from '../../src/config/prisma';

const CATEGORY = 'plumb';

// Requester reference point (near Pinheiros / Vila Madalena, São Paulo).
const REF = { lat: -23.56, lng: -46.69 };

// Three verified plumbers at increasing real distances from REF.
const NEAR = { name: 'Perto', lat: -23.561, lng: -46.689 }; // ~0.15 km
const MID = { name: 'Médio', lat: -23.57, lng: -46.71 }; // ~2.3 km
const FAR = { name: 'Longe', lat: -23.65, lng: -46.6 }; // ~13 km

async function seedGeoProvider(opts: { name: string; lat: number; lng: number }) {
  await prisma.category.upsert({
    where: { id: CATEGORY },
    update: {},
    create: { id: CATEGORY, name: 'Encanador', iconKey: 'plumb', hue: 210, order: 1 },
  });
  const user = await prisma.user.create({
    data: {
      email: `${opts.name}-${Date.now()}-${Math.random()}@geo.test`,
      name: opts.name,
      passwordHash: await bcrypt.hash('Senha@123', 4),
      role: 'PROVIDER',
      city: 'São Paulo',
      emailVerified: true,
      providerProfile: {
        create: {
          kycStatus: 'VERIFIED',
          kycVerifiedAt: new Date(),
          available: true,
          ratingAvg: 4.5,
          ratingCount: 10,
          priceFrom: 100,
          categories: { create: { categoryId: CATEGORY } },
        },
      },
    },
    include: { providerProfile: true },
  });
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProviderProfile"
       SET "location" = ST_SetSRID(ST_MakePoint(${opts.lng}, ${opts.lat}), 4326)::geography
     WHERE "id" = ${user.providerProfile!.id}
  `);
  return user.providerProfile!;
}

describe('Geolocation matching (PostGIS)', () => {
  it('orders providers by real distance with sort=distance', async () => {
    const app = await getApp();
    // Insert out of order on purpose; ranking must come from distance, not insert order.
    await seedGeoProvider(FAR);
    await seedGeoProvider(NEAR);
    await seedGeoProvider(MID);

    const res = await request(app).get(
      `/api/v1/providers?sort=distance&lat=${REF.lat}&lng=${REF.lng}&category=${CATEGORY}`,
    );

    expect(res.status).toBe(200);
    expect(res.body.items.map((p: { name: string }) => p.name)).toEqual(['Perto', 'Médio', 'Longe']);

    const distances = res.body.items.map((p: { distanceKm: number }) => p.distanceKm);
    expect(distances[0]).toBeLessThan(distances[1]);
    expect(distances[1]).toBeLessThan(distances[2]);
    expect(distances[0]).toBeLessThan(1);
  });

  it('honours radiusKm to exclude far providers', async () => {
    const app = await getApp();
    await seedGeoProvider(NEAR);
    await seedGeoProvider(MID);
    await seedGeoProvider(FAR);

    const res = await request(app).get(
      `/api/v1/providers?sort=distance&lat=${REF.lat}&lng=${REF.lng}&category=${CATEGORY}&radiusKm=5`,
    );

    expect(res.status).toBe(200);
    const names = res.body.items.map((p: { name: string }) => p.name);
    expect(names).toContain('Perto');
    expect(names).toContain('Médio');
    expect(names).not.toContain('Longe');
    expect(res.body.total).toBe(2);
  });

  it('returns the geographically closest verified provider for an emergency', async () => {
    await seedGeoProvider(FAR);
    const nearProfile = await seedGeoProvider(NEAR);
    await seedGeoProvider(MID);

    const client = await authedAgent('CLIENT');
    const res = await client
      .post('/api/v1/emergency/match')
      .send({ categoryId: CATEGORY, lat: REF.lat, lng: REF.lng });

    expect(res.status).toBe(200);
    expect(res.body.provider.id).toBe(nearProfile.id);
    expect(res.body.distanceKm).toBeLessThan(1);
    expect(res.body.etaMin).toBeGreaterThanOrEqual(5);
  });

  it('falls back to the rating proxy when no coordinates are supplied', async () => {
    await seedGeoProvider(MID);

    const client = await authedAgent('CLIENT');
    const res = await client.post('/api/v1/emergency/match').send({ categoryId: CATEGORY });

    expect(res.status).toBe(200);
    expect(res.body.provider).toBeDefined();
    expect(res.body.nearbyCount).toBeGreaterThanOrEqual(1);
  });
});
