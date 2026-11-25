/**
 * Seed sintético para treinar e avaliar o recomendador.
 *
 * Por que existe: o banco de demonstração (`seed.ts`) tem 6 profissionais e
 * ZERO bookings. Sem histórico de interação não há sinal colaborativo, não há
 * rótulo e não há como medir se o modelo é melhor que a ordenação atual.
 *
 * O ponto central é que os dados têm **estrutura latente**: cada profissional
 * tem uma habilidade (`skill`) e uma responsividade que NUNCA viram coluna no
 * banco — o modelo só enxerga as consequências ruidosas delas (avaliações,
 * taxa de conclusão, tempo de resposta). Isso obriga o ranker a *inferir*
 * qualidade a partir de evidência, em vez de ler a resposta pronta.
 *
 * A escolha do profissional é um logit multinomial (argmax + ruído Gumbel), não
 * um argmax determinístico: um recomendador perfeito não consegue acertar 100%,
 * o que mantém as métricas honestas.
 *
 * Determinístico: mesma semente ⇒ mesmo banco ⇒ mesmas métricas de avaliação.
 *
 *   npm run prisma:seed:ml -- --verify
 *   npm run prisma:seed:ml -- --seed=7 --bookings=5000
 */
import { PrismaClient, Role, KycStatus, BookingStatus, BookingUrgency, PaymentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import {
  categories, CATEGORY_IDS, SP_NEIGHBORHOODS, CATEGORY_PRICE_BASE,
  CATEGORY_SEASONALITY, Rng, haversineKm, clamp, sigmoid,
} from './seed.shared';

const prisma = new PrismaClient();

// ── Parâmetros ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? Number(hit.split('=')[1]) : fallback;
};
const SEED = flag('seed', Number(process.env.ML_SEED_RANDOM_SEED ?? 42));
const N_PROVIDERS = flag('providers', 60);
const N_CLIENTS = flag('clients', 200);
const N_BOOKINGS = flag('bookings', 3000);
const MONTHS_BACK = flag('months', 18);
const VERIFY = args.includes('--verify');

/** Clientes deliberadamente sem histórico, para exercitar o cold start. */
const COLD_CLIENTS = 20;

const DAY_MS = 86_400_000;
const NOW = new Date('2026-08-10T12:00:00.000Z').getTime(); // fixo = reprodutível

const URGENCIES = [
  BookingUrgency.FLEXIBLE, BookingUrgency.THIS_WEEK,
  BookingUrgency.TODAY, BookingUrgency.EMERGENCY,
];
/** Ordinal usado nas fórmulas (FLEXIBLE=0 … EMERGENCY=3). */
const urgencyOrd = (u: BookingUrgency) => URGENCIES.indexOf(u);

const FIRST_NAMES = ['Ana','Bruno','Carla','Diego','Elaine','Felipe','Gabriela','Henrique','Isabela','João','Karina','Lucas','Mariana','Nelson','Olívia','Paulo','Queila','Rafael','Sabrina','Thiago','Ursula','Vitor','Wanda','Xavier','Yara','Zeca','Amanda','Bernardo','Camila','Danilo'];
const LAST_NAMES = ['Silva','Santos','Oliveira','Souza','Rodrigues','Ferreira','Alves','Pereira','Lima','Gomes','Costa','Ribeiro','Martins','Carvalho','Almeida','Lopes','Soares','Fernandes','Vieira','Barbosa'];

interface ProviderSpec {
  id: string;            // ProviderProfile.id
  userId: string;
  name: string;
  email: string;
  lat: number; lng: number;
  neighborhood: string;
  categories: string[];
  preferred: string;
  priceFrom: number;
  yearsExp: number;
  verified: boolean;
  available: boolean;
  createdAt: Date;
  hue: number;
  // Variáveis latentes — nunca persistidas.
  skill: number;
  responsiveness: number;
}

interface ClientSpec {
  id: string;
  name: string;
  email: string;
  lat: number; lng: number;
  neighborhood: string;
  affinity: number[];      // distribuição sobre CATEGORY_IDS
  priceSensitivity: number;
  urgencyBias: number;
  activity: number;        // nº alvo de bookings
  createdAt: Date;
}

async function main() {
  const rng = new Rng(SEED);
  const t0 = Date.now();
  console.log(`Seed ML — semente=${SEED} providers=${N_PROVIDERS} clientes=${N_CLIENTS} bookings=${N_BOOKINGS}`);

  await wipe();
  await prisma.category.createMany({ data: categories });

  const passwordHash = await bcrypt.hash('Senha@123', 10); // 10 rounds: seed é dev-only
  const providers = buildProviders(rng);
  const clients = buildClients(rng);

  await insertProviders(providers, passwordHash);
  await insertClients(clients, passwordHash);
  console.log(`  ${providers.length} profissionais e ${clients.length} clientes criados`);

  const generated = generateBookings(rng, providers, clients);
  await insertBookings(generated);
  console.log(`  ${generated.bookings.length} bookings, ${generated.reviews.length} avaliações, ${generated.payments.length} pagamentos`);

  await recomputeAggregates();
  console.log(`Concluído em ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('Login de demonstração: marina@zelo.dev / Senha@123');

  if (VERIFY) await verify();
}

// ── Construção das entidades ──────────────────────────────────────────────

function buildProviders(rng: Rng): ProviderSpec[] {
  const out: ProviderSpec[] = [];
  for (let i = 0; i < N_PROVIDERS; i++) {
    const hood = SP_NEIGHBORHOODS[i % SP_NEIGHBORHOODS.length];
    // Dispersão gaussiana ~2 km ao redor do centróide do bairro.
    const lat = hood.lat + rng.normal(0, 0.018);
    const lng = hood.lng + rng.normal(0, 0.018);

    const nCats = rng.weighted([0.55, 0.32, 0.13]) + 1; // 1..3 categorias
    const cats = rng.shuffle([...CATEGORY_IDS]).slice(0, nCats);
    const preferred = cats[0];

    // priceFrom log-normal ao redor da base da categoria preferida.
    const base = CATEGORY_PRICE_BASE[preferred];
    const priceFrom = Math.round(clamp(base * rng.logNormal(0, 0.35), 50, 900));

    // ~15% com menos de 60 dias de casa (coorte de cold start do lado da oferta).
    const tenureDays = rng.bool(0.15)
      ? rng.int(3, 60)
      : rng.int(90, MONTHS_BACK * 30 + 120);

    out.push({
      id: randomUUID(),
      userId: randomUUID(),
      name: `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      email: `pro${i + 1}@zelo.dev`,
      lat, lng,
      neighborhood: hood.name,
      categories: cats,
      preferred,
      priceFrom,
      yearsExp: rng.int(1, 20),
      verified: rng.bool(0.9),
      available: rng.bool(0.9),
      createdAt: new Date(NOW - tenureDays * DAY_MS),
      hue: rng.int(0, 359),
      skill: rng.beta(2.6, 2.0),          // média ~0.57, cauda para os dois lados
      responsiveness: rng.beta(2.2, 2.2),
    });
  }
  return out;
}

function buildClients(rng: Rng): ClientSpec[] {
  const out: ClientSpec[] = [];
  for (let i = 0; i < N_CLIENTS; i++) {
    const hood = SP_NEIGHBORHOODS[i % SP_NEIGHBORHOODS.length];
    // Dirichlet concentrada (alpha baixo) ⇒ 1–2 necessidades dominantes por
    // cliente, que é o que dá sinal para a feature de afinidade de categoria.
    const affinity = rng.dirichlet(CATEGORY_IDS.length, 0.35);

    // Atividade Zipf-like: poucos clientes muito ativos, cauda longa.
    const isCold = i >= N_CLIENTS - COLD_CLIENTS;
    const activity = isCold ? 0 : Math.max(1, Math.round(1 / Math.pow(rng.random(), 0.55)));

    out.push({
      id: randomUUID(),
      name: i === 0 ? 'Marina Cliente' : `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`,
      email: i === 0 ? 'marina@zelo.dev' : `cliente${i + 1}@zelo.dev`,
      lat: hood.lat + rng.normal(0, 0.015),
      lng: hood.lng + rng.normal(0, 0.015),
      neighborhood: hood.name,
      affinity,
      priceSensitivity: rng.random(),
      urgencyBias: rng.random(),
      // Cliente entra em algum ponto da janela (mas antes do primeiro booking).
      activity,
      createdAt: new Date(NOW - rng.int(30, MONTHS_BACK * 30 + 60) * DAY_MS),
    });
  }
  // Garante que o login de demonstração tenha histórico rico.
  out[0].activity = Math.max(out[0].activity, 12);
  return out;
}

// ── Geração das interações ────────────────────────────────────────────────

interface BookingRow {
  id: string; clientId: string; providerId: string; categoryId: string;
  title: string; description: string; address: string;
  scheduledAt: Date; urgency: BookingUrgency; status: BookingStatus;
  priceEstimate: number; priceFinal: number | null;
  createdAt: Date; updatedAt: Date; completedAt: Date | null;
  lat: number; lng: number;
}
interface ReviewRow {
  id: string; bookingId: string; authorId: string; targetId: string;
  rating: number; comment: string | null; createdAt: Date;
}
interface PaymentRow {
  id: string; bookingId: string; amount: number; method: string;
  status: PaymentStatus; externalId: string; createdAt: Date; updatedAt: Date;
}

const COMMENTS_GOOD = ['Excelente trabalho, muito pontual.','Resolveu rápido e cobrou o combinado.','Profissional atencioso, recomendo.','Serviço impecável.','Chegou no horário e deixou tudo limpo.'];
const COMMENTS_MID = ['Resolveu, mas demorou um pouco.','Bom serviço, preço um pouco alto.','Atendeu bem, nada excepcional.'];
const COMMENTS_BAD = ['Atrasou bastante e não resolveu tudo.','Não corresponde ao combinado.','Precisei chamar outro profissional depois.'];

function generateBookings(rng: Rng, providers: ProviderSpec[], clients: ClientSpec[]) {
  const bookings: BookingRow[] = [];
  const reviews: ReviewRow[] = [];
  const payments: PaymentRow[] = [];

  // Índice categoria → profissionais, para montar o conjunto de candidatos.
  const byCategory = new Map<string, ProviderSpec[]>();
  for (const c of CATEGORY_IDS) byCategory.set(c, []);
  for (const p of providers) for (const c of p.categories) byCategory.get(c)!.push(p);

  /** Histórico cliente→profissional, para o bônus de recontratação. */
  const history = new Map<string, Map<string, { count: number; satisfied: number }>>();

  // Monta a agenda: cada cliente recebe `activity` timestamps distribuídos na
  // janela, e o conjunto todo é ordenado cronologicamente. Isso é essencial —
  // o bônus de recontratação só faz sentido se os eventos forem processados em
  // ordem, e o split temporal de treino depende disso.
  const schedule: Array<{ client: ClientSpec; at: number }> = [];
  const windowStart = NOW - MONTHS_BACK * 30 * DAY_MS;
  const totalActivity = clients.reduce((a, c) => a + c.activity, 0) || 1;
  const scale = N_BOOKINGS / totalActivity;

  for (const client of clients) {
    const n = Math.round(client.activity * scale);
    const earliest = Math.max(windowStart, client.createdAt.getTime());
    for (let i = 0; i < n; i++) {
      const at = rng.uniform(earliest, NOW - DAY_MS);
      if (at > earliest) schedule.push({ client, at });
    }
  }
  schedule.sort((a, b) => a.at - b.at);

  for (const { client, at } of schedule) {
    const when = new Date(at);
    const month = when.getUTCMonth();

    // Categoria = afinidade do cliente × sazonalidade do mês.
    const catWeights = CATEGORY_IDS.map((cid, i) => {
      const season = CATEGORY_SEASONALITY[cid]?.[month] ?? 1;
      return client.affinity[i] * season;
    });
    const categoryId = CATEGORY_IDS[rng.weighted(catWeights)];

    // Candidatos: quem atende a categoria E já existia naquela data.
    const pool = (byCategory.get(categoryId) ?? []).filter(
      (p) => p.createdAt.getTime() <= at && p.available,
    );
    if (pool.length === 0) continue;

    const urgency = pickUrgency(rng, client);
    const uOrd = urgencyOrd(urgency);
    const clientHistory = history.get(client.id);

    // ── Utilidade verdadeira ────────────────────────────────────────────
    // É esta função que o ranker precisa recuperar a partir de evidência
    // ruidosa. O ruído Gumbel torna a escolha um softmax sobre a utilidade.
    const base = CATEGORY_PRICE_BASE[categoryId];
    let bestIdx = 0;
    let bestU = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      const dist = haversineKm(client.lat, client.lng, p.lat, p.lng);
      const prior = clientHistory?.get(p.id);
      const rehire = prior ? (prior.satisfied > 0 ? 1 : 0.4) : 0;

      const u =
        1.4 * p.skill +
        0.9 * (p.preferred === categoryId ? 1 : 0.45) +
        0.8 * Math.exp(-dist / 5) -
        1.2 * client.priceSensitivity * (Math.log(p.priceFrom) - Math.log(base)) +
        0.6 * rehire +
        0.5 * p.responsiveness * (uOrd / 3) +
        0.35 * (p.verified ? 1 : 0) +
        rng.gumbel();

      if (u > bestU) { bestU = u; bestIdx = i; }
    }
    const provider = pool[bestIdx];

    // ── Desfecho ────────────────────────────────────────────────────────
    const pComplete = sigmoid(1.0 + 2.2 * provider.skill + 0.4 * provider.responsiveness - 0.3 * uOrd);
    const completed = rng.bool(pComplete);

    // Bookings muito recentes ainda podem estar em andamento.
    const ageDays = (NOW - at) / DAY_MS;
    let status: BookingStatus;
    if (ageDays < 3 && rng.bool(0.5)) {
      status = rng.bool(0.5) ? BookingStatus.REQUESTED : BookingStatus.ACCEPTED;
    } else {
      status = completed ? BookingStatus.COMPLETED : BookingStatus.CANCELLED;
    }

    const priceEstimate = Math.round(
      provider.priceFrom * rng.uniform(1.0, 2.4) * (1 + 0.12 * uOrd),
    );
    const isDone = status === BookingStatus.COMPLETED;
    const completedAt = isDone ? new Date(at + rng.int(1, 5) * DAY_MS) : null;
    const priceFinal = isDone ? Math.round(priceEstimate * rng.logNormal(0, 0.15)) : null;

    const bookingId = randomUUID();
    bookings.push({
      id: bookingId,
      clientId: client.id,
      providerId: provider.id,
      categoryId,
      title: titleFor(categoryId),
      description: `Serviço de ${categoryLabel(categoryId).toLowerCase()} em ${client.neighborhood}.`,
      address: `Rua ${rng.pick(LAST_NAMES)}, ${rng.int(10, 1800)} — ${client.neighborhood}, São Paulo`,
      scheduledAt: new Date(at + rng.int(1, 7) * DAY_MS),
      urgency,
      status,
      priceEstimate,
      priceFinal,
      createdAt: when,
      // `updatedAt` guarda o instante do aceite — é daí que sai a feature de
      // tempo de resposta (quanto mais responsivo, mais rápido o aceite).
      updatedAt: new Date(at + (1 - provider.responsiveness) * 20 * 3_600_000 + 600_000),
      completedAt,
      lat: client.lat + rng.normal(0, 0.004),
      lng: client.lng + rng.normal(0, 0.004),
    });

    // ── Avaliação (65% dos concluídos) ──────────────────────────────────
    let satisfied = 0;
    if (isDone && rng.bool(0.65)) {
      // Média da Beta puxada pela skill, com dispersão suficiente para o
      // rating ser um sinal ruidoso — e não uma leitura direta da skill.
      const m = clamp(0.55 + 0.42 * provider.skill, 0.05, 0.95);
      const conc = 9;
      const x = rng.beta(m * conc, (1 - m) * conc);
      const rating = clamp(Math.round(1 + 4 * x), 1, 5);
      if (rating >= 4) satisfied = 1;
      reviews.push({
        id: randomUUID(),
        bookingId,
        authorId: client.id,
        targetId: provider.userId,
        rating,
        comment: rating >= 4 ? rng.pick(COMMENTS_GOOD) : rating === 3 ? rng.pick(COMMENTS_MID) : rng.pick(COMMENTS_BAD),
        createdAt: new Date(completedAt!.getTime() + rng.int(1, 4) * DAY_MS),
      });
    } else if (isDone) {
      // Sem avaliação: tratamos como satisfeito para o bônus de recontratação
      // (o cliente não reclamou), coerente com o rótulo usado no treino.
      satisfied = 1;
    }

    if (isDone) {
      payments.push({
        id: randomUUID(),
        bookingId,
        amount: priceFinal!,
        method: rng.bool(0.7) ? 'pix' : 'card',
        status: PaymentStatus.PAID,
        externalId: `seed_${bookingId.slice(0, 12)}`,
        createdAt: completedAt!,
        updatedAt: completedAt!,
      });
    }

    if (!history.has(client.id)) history.set(client.id, new Map());
    const h = history.get(client.id)!;
    const prev = h.get(provider.id) ?? { count: 0, satisfied: 0 };
    h.set(provider.id, { count: prev.count + 1, satisfied: prev.satisfied + satisfied });
  }

  return { bookings, reviews, payments };
}

function pickUrgency(rng: Rng, client: ClientSpec): BookingUrgency {
  // Clientes com urgencyBias alto pedem mais emergências.
  const w = [
    0.40 * (1 - client.urgencyBias) + 0.10,
    0.30,
    0.18 + 0.20 * client.urgencyBias,
    0.06 + 0.24 * client.urgencyBias,
  ];
  return URGENCIES[rng.weighted(w)];
}

const TITLES: Record<string, string[]> = {
  plumb: ['Vazamento na pia', 'Troca de registro', 'Desentupimento'],
  bolt: ['Tomada sem energia', 'Instalação de chuveiro', 'Troca de disjuntor'],
  hammer: ['Reforma de banheiro', 'Troca de piso', 'Pequenos reparos'],
  brush: ['Pintura de sala', 'Pintura de fachada', 'Retoque de parede'],
  spray: ['Limpeza pesada', 'Limpeza pós-obra', 'Faxina semanal'],
  sofa: ['Montagem de guarda-roupa', 'Montagem de estante', 'Reparo de gaveta'],
  hvac: ['Limpeza de ar-condicionado', 'Instalação de split', 'Ar não gela'],
  leaf: ['Poda de árvore', 'Manutenção de jardim', 'Corte de grama'],
};
const titleFor = (cid: string) => TITLES[cid]?.[0] ?? 'Serviço';
const categoryLabel = (cid: string) => categories.find((c) => c.id === cid)?.name ?? cid;

// ── Persistência ──────────────────────────────────────────────────────────

async function wipe() {
  await prisma.$transaction([
    prisma.recEvent.deleteMany(),
    prisma.review.deleteMany(),
    prisma.message.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.booking.deleteMany(),
    prisma.providerService.deleteMany(),
    prisma.providerCategory.deleteMany(),
    prisma.portfolioItem.deleteMany(),
    prisma.budgetEstimate.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.providerProfile.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.user.deleteMany(),
    prisma.category.deleteMany(),
  ]);
}

async function insertProviders(providers: ProviderSpec[], passwordHash: string) {
  await prisma.user.createMany({
    data: providers.map((p) => ({
      id: p.userId, name: p.name, email: p.email, passwordHash,
      role: Role.PROVIDER, city: 'São Paulo', neighborhood: p.neighborhood,
      emailVerified: true, avatarHue: p.hue, createdAt: p.createdAt,
    })),
  });

  await prisma.providerProfile.createMany({
    data: providers.map((p) => ({
      id: p.id, userId: p.userId,
      bio: `Profissional de ${categoryLabel(p.preferred).toLowerCase()} com ${p.yearsExp} anos de experiência, atendendo ${p.neighborhood} e região.`,
      yearsExp: p.yearsExp,
      jobsDone: 0, ratingAvg: 0, ratingCount: 0, // recalculados no final
      kycStatus: p.verified ? KycStatus.VERIFIED : KycStatus.PENDING,
      kycVerifiedAt: p.verified ? p.createdAt : null,
      available: p.available, priceFrom: p.priceFrom, createdAt: p.createdAt,
    })),
  });

  await prisma.providerCategory.createMany({
    data: providers.flatMap((p) => p.categories.map((c) => ({ providerId: p.id, categoryId: c }))),
  });

  await prisma.providerService.createMany({
    data: providers.flatMap((p) => p.categories.map((c) => ({
      providerId: p.id, categoryId: c,
      title: TITLES[c]?.[0] ?? 'Serviço padrão',
      priceMin: p.priceFrom,
      priceMax: Math.round(p.priceFrom * 2.5),
    }))),
  });

  await setLocations('ProviderProfile', providers);
}

async function insertClients(clients: ClientSpec[], passwordHash: string) {
  await prisma.user.createMany({
    data: clients.map((c, i) => ({
      id: c.id, name: c.name, email: c.email, passwordHash,
      role: Role.CLIENT, city: 'São Paulo', neighborhood: c.neighborhood,
      emailVerified: true, avatarHue: (i * 37) % 360, createdAt: c.createdAt,
    })),
  });
}

async function insertBookings(g: { bookings: BookingRow[]; reviews: ReviewRow[]; payments: PaymentRow[] }) {
  const CHUNK = 500;
  for (let i = 0; i < g.bookings.length; i += CHUNK) {
    await prisma.booking.createMany({
      data: g.bookings.slice(i, i + CHUNK).map(({ lat, lng, ...b }) => b),
    });
  }
  await setLocations('Booking', g.bookings);

  for (let i = 0; i < g.reviews.length; i += CHUNK) {
    await prisma.review.createMany({ data: g.reviews.slice(i, i + CHUNK) });
  }
  for (let i = 0; i < g.payments.length; i += CHUNK) {
    await prisma.payment.createMany({ data: g.payments.slice(i, i + CHUNK) });
  }
}

/**
 * Grava colunas PostGIS `geography` em lote. O Prisma Client não consegue
 * escrever tipos `Unsupported`, então vai por SQL cru — mesmo padrão do
 * `seed.ts`, só que com um único UPDATE ... FROM (VALUES ...) por lote em vez
 * de um round-trip por linha (3000 round-trips levariam minutos).
 */
async function setLocations(
  table: 'ProviderProfile' | 'Booking',
  rows: Array<{ id: string; lat: number; lng: number }>,
) {
  const CHUNK = 500;
  // `table` vem de um union literal do próprio código, nunca de input externo.
  const target = Prisma.raw(`"${table}"`);
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const values = Prisma.join(
      chunk.map((r) => Prisma.sql`(${r.id}, ${r.lng}::double precision, ${r.lat}::double precision)`),
    );
    await prisma.$executeRaw(Prisma.sql`
      UPDATE ${target} AS t
         SET "location" = ST_SetSRID(ST_MakePoint(v.lng, v.lat), 4326)::geography
        FROM (VALUES ${values}) AS v(id, lng, lat)
       WHERE t."id" = v.id
    `);
  }
}

/**
 * Recalcula os contadores desnormalizados a partir das avaliações e bookings
 * gerados. Sem isso o baseline `rating_desc` — que é justamente o que o modelo
 * precisa superar — enxergaria zeros e a comparação não teria sentido.
 */
async function recomputeAggregates() {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProviderProfile" p
       SET "ratingAvg"   = COALESCE(agg.avg_rating, 0),
           "ratingCount" = COALESCE(agg.n, 0)
      FROM (
        SELECT u."id" AS user_id,
               AVG(r."rating")::double precision AS avg_rating,
               COUNT(*)::int AS n
          FROM "Review" r
          JOIN "User" u ON u."id" = r."targetId"
         GROUP BY u."id"
      ) agg
     WHERE p."userId" = agg.user_id
  `);
  await prisma.$executeRaw(Prisma.sql`
    UPDATE "ProviderProfile" p
       SET "jobsDone" = COALESCE(agg.n, 0)
      FROM (
        SELECT "providerId", COUNT(*)::int AS n
          FROM "Booking"
         WHERE "status" = 'COMPLETED'
         GROUP BY "providerId"
      ) agg
     WHERE p."id" = agg."providerId"
  `);
}

// ── Verificação de sanidade ───────────────────────────────────────────────

async function verify() {
  console.log('\n── Verificação ──');
  const q = async (label: string, sql: Prisma.Sql) => {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>(sql);
    console.log(`\n${label}`);
    console.table(rows);
  };

  await q('Bookings por status', Prisma.sql`
    SELECT "status", COUNT(*)::int AS n FROM "Booking" GROUP BY 1 ORDER BY 2 DESC`);

  await q('Distribuição de avaliações', Prisma.sql`
    SELECT "rating", COUNT(*)::int AS n FROM "Review" GROUP BY 1 ORDER BY 1`);

  await q('Bookings por cliente (histograma)', Prisma.sql`
    SELECT bucket, COUNT(*)::int AS clientes FROM (
      SELECT u."id",
             CASE WHEN COUNT(b."id") = 0 THEN '0 (cold)'
                  WHEN COUNT(b."id") <= 2 THEN '1-2'
                  WHEN COUNT(b."id") <= 5 THEN '3-5'
                  WHEN COUNT(b."id") <= 15 THEN '6-15'
                  ELSE '16+' END AS bucket
        FROM "User" u LEFT JOIN "Booking" b ON b."clientId" = u."id"
       WHERE u."role" = 'CLIENT' GROUP BY u."id"
    ) s GROUP BY bucket ORDER BY 1`);

  await q('Cobertura geográfica e de ranking', Prisma.sql`
    SELECT
      (SELECT COUNT(*)::int FROM "Booking" WHERE "location" IS NOT NULL) AS bookings_com_local,
      (SELECT COUNT(*)::int FROM "ProviderProfile" WHERE "location" IS NOT NULL) AS pros_com_local,
      (SELECT COUNT(*)::int FROM "ProviderProfile" WHERE "ratingCount" = 0) AS pros_sem_avaliacao,
      (SELECT ROUND(AVG("ratingAvg")::numeric, 2) FROM "ProviderProfile" WHERE "ratingCount" > 0) AS rating_medio,
      (SELECT COUNT(DISTINCT "providerId")::int FROM "Booking") AS pros_com_booking`);

  await q('Top 5 por avaliação (o que o baseline atual mostraria)', Prisma.sql`
    SELECT u."name", p."ratingAvg", p."ratingCount", p."jobsDone"
      FROM "ProviderProfile" p JOIN "User" u ON u."id" = p."userId"
     ORDER BY p."ratingAvg" DESC LIMIT 5`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
