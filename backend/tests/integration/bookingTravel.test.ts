/**
 * 11 cenários de integração da sessão de deslocamento (Etapa 2 — Fase 2).
 *
 * Precondição: Postgres + Redis do projeto rodando.
 *   docker compose up db redis
 *   DATABASE_URL=... npm run test:integration -- bookingTravel.test
 *
 * Nenhum teste persiste coordenadas em lugar algum além do Redis. Todos os testes
 * terminam com a sessão encerrada (RESET nos afterEach) para não vazar entre casos.
 */
import request from 'supertest';
import { BookingTravelStatus } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { getRedis } from '../../src/config/redis';
import { getApp, createUser, createProvider, tokenFor } from './helpers';

const TRAVEL_KEY_PREFIX = 'zelo:travel:';

async function seedAcceptedBooking() {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@tv.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'Serviço', address: 'Rua 1', status: 'ACCEPTED' },
  });
  return { booking, providerUser, client, provider };
}

async function startTravelViaApi(app: Awaited<ReturnType<typeof getApp>>, bookingId: string, token: string) {
  const res = await request(app)
    .post(`/api/v1/bookings/${bookingId}/travel/start`)
    .set('Authorization', `Bearer ${token}`);
  return res;
}

function postLocation(app: Awaited<ReturnType<typeof getApp>>, bookingId: string, token: string, lat = -23.5, lng = -46.6) {
  return request(app)
    .post(`/api/v1/bookings/${bookingId}/travel/location`)
    .set('Authorization', `Bearer ${token}`)
    .send({ latitude: lat, longitude: lng, recordedAt: new Date().toISOString() });
}

async function redisKeyExists(bookingId: string): Promise<boolean> {
  const r = getRedis();
  if (!r) return false;
  return (await r.exists(`${TRAVEL_KEY_PREFIX}${bookingId}:location`)) === 1;
}

describe('BookingTravel — integração (11 cenários da Fase 2)', () => {
  afterEach(async () => {
    const r = getRedis();
    if (!r) return;
    // Limpeza dedicada para não vazar chaves travel entre casos.
    const keys = await r.keys(`${TRAVEL_KEY_PREFIX}*`);
    if (keys.length > 0) await r.del(...keys);
  });

  it('1) encerramento com Redis indisponível: estado do DB bloqueia leitura mesmo se chave sobrevive', async () => {
    // Simula "redis indisponível no momento do del": forçamos a chave a existir após o del
    // para provar que o guard de status no DB é o que realmente barra a leitura.
    const { booking, providerUser, client } = await seedAcceptedBooking();
    const app = await getApp();
    await startTravelViaApi(app, booking.id, tokenFor(providerUser));
    await postLocation(app, booking.id, tokenFor(providerUser));

    expect(await redisKeyExists(booking.id)).toBe(true);
    await request(app).post(`/api/v1/bookings/${booking.id}/travel/arrived`).set('Authorization', `Bearer ${tokenFor(providerUser)}`).expect(200);

    // Força uma chave "zumbi" — cenário: del falhou silenciosamente.
    const r = getRedis();
    if (r) await r.set(`${TRAVEL_KEY_PREFIX}${booking.id}:location`, JSON.stringify({ ghost: true }), 'EX', 60);

    // Leitura DEVE responder 410 (sessão encerrada), mesmo com a chave presente.
    const get = await request(app)
      .get(`/api/v1/bookings/${booking.id}/travel/location`)
      .set('Authorization', `Bearer ${tokenFor(client)}`);
    expect(get.status).toBe(410);
  });

  it('2) duas chamadas concorrentes de arrived: só uma transição efetiva', async () => {
    const { booking, providerUser } = await seedAcceptedBooking();
    const app = await getApp();
    await startTravelViaApi(app, booking.id, tokenFor(providerUser));

    const token = tokenFor(providerUser);
    const [a, b] = await Promise.all([
      request(app).post(`/api/v1/bookings/${booking.id}/travel/arrived`).set('Authorization', `Bearer ${token}`),
      request(app).post(`/api/v1/bookings/${booking.id}/travel/arrived`).set('Authorization', `Bearer ${token}`),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 200]); // ambas idempotentes

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId: booking.id } });
    expect(session?.status).toBe(BookingTravelStatus.ARRIVED);
    expect(session?.arrivedAt).not.toBeNull();
    // endedAt é escrito uma vez; se a corrida falhou algo, haveria divergência
    expect(session?.endedAt).not.toBeNull();
  });

  it('3) duas chamadas concorrentes de start: devolve a MESMA sessão (idempotente)', async () => {
    const { booking, providerUser } = await seedAcceptedBooking();
    const app = await getApp();
    const token = tokenFor(providerUser);
    const [a, b] = await Promise.all([
      startTravelViaApi(app, booking.id, token),
      startTravelViaApi(app, booking.id, token),
    ]);
    // Status pode ser 201 nos dois (idempotente create-or-return).
    expect([a.status, b.status].every((s) => s === 201 || s === 200)).toBe(true);
    // Exatamente uma linha deve existir.
    const count = await prisma.bookingTravel.count({ where: { bookingId: booking.id } });
    expect(count).toBe(1);
  });

  it('4) cancel concorrente com update de GPS: update é rejeitado assim que status muda', async () => {
    const { booking, providerUser } = await seedAcceptedBooking();
    const app = await getApp();
    const token = tokenFor(providerUser);
    await startTravelViaApi(app, booking.id, token);

    const [cancel, update] = await Promise.all([
      request(app).post(`/api/v1/bookings/${booking.id}/travel/cancel`).set('Authorization', `Bearer ${token}`),
      postLocation(app, booking.id, token),
    ]);

    // Cancel sempre responde 200. Update pode ter sido aceito (204) se chegou antes
    // da transição OU rejeitado (410) se chegou depois. Nos dois casos, o estado final
    // é inequívoco: sessão CANCELLED e uma consulta posterior retorna 410.
    expect(cancel.status).toBe(200);
    expect([204, 410]).toContain(update.status);

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId: booking.id } });
    expect(session?.status).toBe(BookingTravelStatus.CANCELLED);

    const laterUpdate = await postLocation(app, booking.id, token);
    expect(laterUpdate.status).toBe(410);
  });

  it('5) arrived concorrente com update de GPS: update rejeitado após a transição', async () => {
    const { booking, providerUser } = await seedAcceptedBooking();
    const app = await getApp();
    const token = tokenFor(providerUser);
    await startTravelViaApi(app, booking.id, token);

    const [arrived, update] = await Promise.all([
      request(app).post(`/api/v1/bookings/${booking.id}/travel/arrived`).set('Authorization', `Bearer ${token}`),
      postLocation(app, booking.id, token),
    ]);
    expect(arrived.status).toBe(200);
    expect([204, 410]).toContain(update.status);
    const laterUpdate = await postLocation(app, booking.id, token);
    expect(laterUpdate.status).toBe(410);
  });

  it('6) evento booking.cancelled encerra sessão em cascata via listener do outbox', async () => {
    const { booking, providerUser, client } = await seedAcceptedBooking();
    const app = await getApp();
    await startTravelViaApi(app, booking.id, tokenFor(providerUser));

    // Em vez de depender do consumer do RabbitMQ (que pode estar desligado nos testes),
    // chamamos diretamente o handler simulando a reação do listener:
    const { cancelTravelInternal } = await import('../../src/services/bookingTravel.service');
    await cancelTravelInternal(booking.id, 'cancelled');

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId: booking.id } });
    expect(session?.status).toBe(BookingTravelStatus.CANCELLED);
    expect(session?.endReason).toBe('cancelled');
    expect(await redisKeyExists(booking.id)).toBe(false);

    // Consulta posterior responde 410.
    const get = await request(app)
      .get(`/api/v1/bookings/${booking.id}/travel/location`)
      .set('Authorization', `Bearer ${tokenFor(client)}`);
    expect(get.status).toBe(410);
  });

  it('7) chamada duplicada de cancelTravelInternal é no-op (idempotência tipo "evento RabbitMQ duplicado")', async () => {
    const { booking, providerUser } = await seedAcceptedBooking();
    const app = await getApp();
    await startTravelViaApi(app, booking.id, tokenFor(providerUser));

    const { cancelTravelInternal } = await import('../../src/services/bookingTravel.service');
    await cancelTravelInternal(booking.id, 'cancelled');
    // Segunda chamada — simulando o consumer receber o mesmo evento 2x.
    await expect(cancelTravelInternal(booking.id, 'cancelled')).resolves.not.toThrow();

    const session = await prisma.bookingTravel.findUnique({ where: { bookingId: booking.id } });
    expect(session?.status).toBe(BookingTravelStatus.CANCELLED);
  });

  it('8) falha e recuperação de redis.del: job de retry limpa sessões encerradas recentes', async () => {
    const { booking, providerUser } = await seedAcceptedBooking();
    const app = await getApp();
    await startTravelViaApi(app, booking.id, tokenFor(providerUser));
    await postLocation(app, booking.id, tokenFor(providerUser));

    expect(await redisKeyExists(booking.id)).toBe(true);
    await request(app).post(`/api/v1/bookings/${booking.id}/travel/arrived`).set('Authorization', `Bearer ${tokenFor(providerUser)}`);

    // Simula "del falhou" — reinserimos a chave manualmente.
    const r = getRedis();
    if (r) await r.set(`${TRAVEL_KEY_PREFIX}${booking.id}:location`, JSON.stringify({ zombie: true }), 'EX', 60);
    expect(await redisKeyExists(booking.id)).toBe(true);

    // O job de retry deve apagar.
    const { travelRedisCleanup } = await import('../../src/jobs/travelHousekeeping.job');
    const result = await travelRedisCleanup();
    expect(result.cleaned).toBeGreaterThanOrEqual(1);
    expect(await redisKeyExists(booking.id)).toBe(false);
  });

  it('9) expiração natural da chave Redis (TTL): posição evapora mesmo sem encerramento explícito', async () => {
    const { booking, providerUser } = await seedAcceptedBooking();
    const app = await getApp();
    await startTravelViaApi(app, booking.id, tokenFor(providerUser));
    await postLocation(app, booking.id, tokenFor(providerUser));

    // Em vez de esperar 60s, forçamos TTL curto para a chave presente e aguardamos.
    const r = getRedis();
    if (!r) throw new Error('Redis obrigatório neste teste');
    const key = `${TRAVEL_KEY_PREFIX}${booking.id}:location`;
    await r.expire(key, 1); // 1s
    await new Promise((res) => setTimeout(res, 1500));
    expect(await redisKeyExists(booking.id)).toBe(false);

    // Importante: sessão continua ACTIVE no DB — só a posição evaporou.
    const session = await prisma.bookingTravel.findUnique({ where: { bookingId: booking.id } });
    expect(session?.status).toBe(BookingTravelStatus.ACTIVE);
  });

  it('10) consulta depois do encerramento retorna 410 e NÃO expõe coordenadas', async () => {
    const { booking, providerUser, client } = await seedAcceptedBooking();
    const app = await getApp();
    const providerToken = tokenFor(providerUser);
    await startTravelViaApi(app, booking.id, providerToken);
    await postLocation(app, booking.id, providerToken);

    await request(app).post(`/api/v1/bookings/${booking.id}/travel/arrived`).set('Authorization', `Bearer ${providerToken}`).expect(200);

    const asClient = await request(app).get(`/api/v1/bookings/${booking.id}/travel/location`).set('Authorization', `Bearer ${tokenFor(client)}`);
    const asProvider = await request(app).get(`/api/v1/bookings/${booking.id}/travel/location`).set('Authorization', `Bearer ${providerToken}`);
    expect(asClient.status).toBe(410);
    expect(asProvider.status).toBe(410);
    expect(JSON.stringify(asClient.body)).not.toMatch(/-23|lat|lng/);
    expect(JSON.stringify(asProvider.body)).not.toMatch(/-23|lat|lng/);
  });

  it('11) reinício do backend durante sessão ativa: sessão continua, mas chave Redis pode expirar', async () => {
    // Não dá para "reiniciar" o process no meio de um teste, mas podemos simular o
    // efeito: criar sessão ACTIVE, dropar o próprio Redis (flushdb), reconectar lógica.
    const { booking, providerUser, client } = await seedAcceptedBooking();
    const app = await getApp();
    await startTravelViaApi(app, booking.id, tokenFor(providerUser));
    await postLocation(app, booking.id, tokenFor(providerUser));

    const r = getRedis();
    if (r) await r.del(`${TRAVEL_KEY_PREFIX}${booking.id}:location`);
    // Simula app novo subindo com DB antigo, Redis limpo:
    const get = await request(app)
      .get(`/api/v1/bookings/${booking.id}/travel/location`)
      .set('Authorization', `Bearer ${tokenFor(client)}`);
    // 200 com location:null — sessão ativa, posição ainda não repopulada.
    expect(get.status).toBe(200);
    expect(get.body.location).toBeNull();

    // Um novo update repopula.
    await postLocation(app, booking.id, tokenFor(providerUser));
    const get2 = await request(app)
      .get(`/api/v1/bookings/${booking.id}/travel/location`)
      .set('Authorization', `Bearer ${tokenFor(client)}`);
    expect(get2.body.location).not.toBeNull();
    expect(get2.body.location.bookingId).toBe(booking.id);
    // NUNCA queremos ver a posição antiga — mas como o teste foi "limpo do Redis",
    // isso é garantido pela própria natureza da chave efêmera.
  });
});
