import { PrismaClient, Role, KycStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { categories } from './seed.shared';

const prisma = new PrismaClient();

// Real São Paulo neighbourhood coordinates so `sort=distance` and emergency
// matching return meaningful, deterministic orderings (no random jitter).
const proSeeds = [
  { name: 'Carlos Mendes',  email: 'carlos@zero.dev',  cat: 'plumb',  rating: 4.9, jobs: 312, years: 8,  reviews: 287, priceFrom: 80,  hue: 210, nb: 'Vila Madalena', lat: -23.5547, lng: -46.6905 },
  { name: 'Ana Beatriz',    email: 'ana@zero.dev',     cat: 'bolt',   rating: 4.8, jobs: 198, years: 5,  reviews: 154, priceFrom: 120, hue: 340, nb: 'Pinheiros',     lat: -23.5670, lng: -46.7020 },
  { name: 'Roberto Silva',  email: 'roberto@zero.dev', cat: 'hammer', rating: 4.7, jobs: 76,  years: 12, reviews: 92,  priceFrom: 200, hue: 30,  nb: 'Itaim Bibi',    lat: -23.5853, lng: -46.6747 },
  { name: 'Júlia Santos',   email: 'julia@zero.dev',   cat: 'spray',  rating: 5.0, jobs: 488, years: 4,  reviews: 412, priceFrom: 140, hue: 180, nb: 'Moema',         lat: -23.6010, lng: -46.6620 },
  { name: 'Pedro Costa',    email: 'pedro@zero.dev',   cat: 'brush',  rating: 4.6, jobs: 54,  years: 3,  reviews: 67,  priceFrom: 350, hue: 280, nb: 'Tatuapé',       lat: -23.5402, lng: -46.5760 },
  { name: 'Lucia Ferreira', email: 'lucia@zero.dev',   cat: 'leaf',   rating: 4.9, jobs: 167, years: 6,  reviews: 134, priceFrom: 90,  hue: 130, nb: 'Santana',       lat: -23.5020, lng: -46.6250 },
];

async function main() {
  console.log('Limpando dados...');
  await prisma.review.deleteMany();
  await prisma.message.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.providerService.deleteMany();
  await prisma.providerCategory.deleteMany();
  await prisma.portfolioItem.deleteMany();
  await prisma.budgetEstimate.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.providerProfile.deleteMany();
  await prisma.user.deleteMany();
  await prisma.category.deleteMany();

  console.log('Categorias...');
  await prisma.category.createMany({ data: categories });

  const passwordHash = await bcrypt.hash('Senha@123', 12);

  console.log('Cliente exemplo (marina@zero.dev / Senha@123)...');
  await prisma.user.create({
    data: {
      name: 'Marina Cliente',
      email: 'marina@zero.dev',
      passwordHash,
      role: Role.CLIENT,
      city: 'São Paulo',
      neighborhood: 'Vila Madalena',
      emailVerified: true,
      avatarHue: 290,
    },
  });

  console.log('Prestadores...');
  for (const p of proSeeds) {
    const user = await prisma.user.create({
      data: {
        name: p.name,
        email: p.email,
        passwordHash,
        role: Role.PROVIDER,
        city: 'São Paulo',
        neighborhood: p.nb,
        emailVerified: true,
        avatarHue: p.hue,
        providerProfile: {
          create: {
            bio: `Profissional com ${p.years} anos de experiência em ${p.name.split(' ')[0]}.`,
            yearsExp: p.years,
            jobsDone: p.jobs,
            ratingAvg: p.rating,
            ratingCount: p.reviews,
            kycStatus: KycStatus.VERIFIED,
            kycVerifiedAt: new Date(),
            priceFrom: p.priceFrom,
            available: true,
            categories: { create: { categoryId: p.cat } },
            services: {
              create: [
                { categoryId: p.cat, title: 'Visita técnica',      priceMin: 80,  priceMax: 80 },
                { categoryId: p.cat, title: 'Serviço padrão',      priceMin: p.priceFrom, priceMax: p.priceFrom * 2 },
                { categoryId: p.cat, title: 'Serviço completo',    priceMin: p.priceFrom * 2, priceMax: p.priceFrom * 4 },
              ],
            },
            portfolio: {
              create: [0, 1, 2, 3].map((i) => ({ caption: `Trabalho ${i + 1}`, hue: (p.hue + i * 30) % 360 })),
            },
          },
        },
      },
      include: { providerProfile: true },
    });

    // `location` is a PostGIS geography column Prisma can't write directly.
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "ProviderProfile"
         SET "location" = ST_SetSRID(ST_MakePoint(${p.lng}, ${p.lat}), 4326)::geography
       WHERE "id" = ${user.providerProfile!.id}
    `);
  }

  console.log('Seed concluído. Login de teste: marina@zero.dev / Senha@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
