/**
 * Camada de socket.io do rastreamento. Garante que:
 *   - Só o profissional daquele booking emite posição.
 *   - Quem não participa não entra na sala.
 *   - JOIN exige sessão ACTIVE no DB (a mudança do refactor de 2026-11-04).
 *
 * Testa APENAS o transporte socket. Encerramento, authz REST, Redis e idempotência
 * ficam em `bookingTravel.test.ts`.
 */
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as IOServer } from 'socket.io';
import { BookingTravelStatus } from '@prisma/client';
import { prisma } from '../../src/config/prisma';
import { getApp, createUser, createProvider, tokenFor } from './helpers';
import { createRealtime, REALTIME_PATH } from '../../src/realtime/io';

let httpServer: HttpServer;
let io: IOServer;
let baseUrl: string;

beforeAll(async () => {
  const app = await getApp();
  httpServer = createServer(app);
  io = createRealtime(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address() as AddressInfo;
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  io.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connect(token: string): ClientSocket {
  return ioClient(baseUrl, { path: REALTIME_PATH, auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
}
function waitConnect(s: ClientSocket): Promise<void> {
  return new Promise((res, rej) => { s.once('connect', () => res()); s.once('connect_error', rej); });
}
function join(s: ClientSocket, bookingId: string): Promise<{ ok: boolean; role?: string }> {
  return new Promise((resolve) => s.emit('travel:join', { bookingId }, resolve));
}

async function seedAcceptedBookingWithActiveTravel() {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@trk.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'Faxina', address: 'Rua 1', status: 'ACCEPTED' },
  });
  await prisma.bookingTravel.create({
    data: { bookingId: booking.id, providerId: provider.id, status: BookingTravelStatus.ACTIVE },
  });
  return { booking, providerUser, client };
}

describe('Rastreamento — socket transport', () => {
  it('retransmite a posição do profissional para o cliente', async () => {
    const { booking, providerUser, client } = await seedAcceptedBookingWithActiveTravel();
    const providerSocket = connect(tokenFor(providerUser));
    const clientSocket = connect(tokenFor(client));
    await Promise.all([waitConnect(providerSocket), waitConnect(clientSocket)]);

    expect((await join(providerSocket, booking.id)).role).toBe('provider');
    expect((await join(clientSocket, booking.id)).role).toBe('client');

    const received = new Promise<{ latitude: number; longitude: number }>((resolve) => {
      clientSocket.once('travel:location:update', resolve);
    });
    providerSocket.emit('travel:location:update', {
      bookingId: booking.id,
      latitude: -23.55, longitude: -46.63,
      recordedAt: new Date().toISOString(),
    });

    const pos = await received;
    expect(pos.latitude).toBeCloseTo(-23.55);
    expect(pos.longitude).toBeCloseTo(-46.63);

    providerSocket.close();
    clientSocket.close();
  });

  it('nega o join sem sessão ACTIVE no DB', async () => {
    const { user: providerUser, provider, category } = await createProvider();
    const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@trk.test` });
    const booking = await prisma.booking.create({
      data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'X', address: 'Y', status: 'ACCEPTED' },
    });
    // Nenhum BookingTravel criado — join deve negar.
    const providerSocket = connect(tokenFor(providerUser));
    await waitConnect(providerSocket);
    const res = await join(providerSocket, booking.id);
    expect(res.ok).toBe(false);
    providerSocket.close();
  });

  it('nega o join de quem não participa do booking', async () => {
    const { booking } = await seedAcceptedBookingWithActiveTravel();
    const intruder = await createUser({ email: `intruso-${Date.now()}@trk.test` });
    const socket = connect(tokenFor(intruder));
    await waitConnect(socket);
    const res = await join(socket, booking.id);
    expect(res.ok).toBe(false);
    socket.close();
  });

  it('ignora posição emitida pelo cliente (só o profissional emite)', async () => {
    const { booking, providerUser, client } = await seedAcceptedBookingWithActiveTravel();
    const providerSocket = connect(tokenFor(providerUser));
    const clientSocket = connect(tokenFor(client));
    await Promise.all([waitConnect(providerSocket), waitConnect(clientSocket)]);
    await join(providerSocket, booking.id);
    await join(clientSocket, booking.id);

    let leaked = false;
    providerSocket.once('travel:location:update', () => { leaked = true; });
    clientSocket.emit('travel:location:update', {
      bookingId: booking.id, latitude: 10, longitude: 10,
      recordedAt: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 300));
    expect(leaked).toBe(false);

    providerSocket.close();
    clientSocket.close();
  });
});
