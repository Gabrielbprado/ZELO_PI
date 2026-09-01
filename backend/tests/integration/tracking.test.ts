/**
 * Rastreamento de deslocamento em tempo real. Garante que a posição do PROFISSIONAL chega
 * ao cliente ao vivo, e que a autorização é respeitada: só o profissional daquele booking
 * emite posição, e quem não participa não entra na sala.
 */
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as IOServer } from 'socket.io';
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
  return new Promise((resolve) => s.emit('tracking:join', { bookingId }, resolve));
}

async function seedAcceptedBooking() {
  const { user: providerUser, provider, category } = await createProvider();
  const client = await createUser({ email: `cli-${Date.now()}-${Math.random()}@trk.test` });
  const booking = await prisma.booking.create({
    data: { clientId: client.id, providerId: provider.id, categoryId: category.id, title: 'Faxina', address: 'Rua 1', status: 'ACCEPTED' },
  });
  return { booking, providerUser, client };
}

describe('Rastreamento em tempo real', () => {
  it('retransmite a posição do profissional para o cliente', async () => {
    const { booking, providerUser, client } = await seedAcceptedBooking();
    const providerSocket = connect(tokenFor(providerUser));
    const clientSocket = connect(tokenFor(client));
    await Promise.all([waitConnect(providerSocket), waitConnect(clientSocket)]);

    expect((await join(providerSocket, booking.id)).role).toBe('provider');
    expect((await join(clientSocket, booking.id)).role).toBe('client');

    const received = new Promise<{ lat: number; lng: number }>((resolve) => {
      clientSocket.once('location:provider', resolve);
    });
    providerSocket.emit('location:update', { bookingId: booking.id, lat: -23.55, lng: -46.63 });

    const pos = await received;
    expect(pos.lat).toBeCloseTo(-23.55);
    expect(pos.lng).toBeCloseTo(-46.63);

    providerSocket.close();
    clientSocket.close();
  });

  it('nega o join de quem não participa do booking', async () => {
    const { booking } = await seedAcceptedBooking();
    const intruder = await createUser({ email: `intruso-${Date.now()}@trk.test` });
    const socket = connect(tokenFor(intruder));
    await waitConnect(socket);

    const res = await join(socket, booking.id);
    expect(res.ok).toBe(false);

    socket.close();
  });

  it('ignora posição emitida pelo cliente (só o profissional emite)', async () => {
    const { booking, providerUser, client } = await seedAcceptedBooking();
    const providerSocket = connect(tokenFor(providerUser));
    const clientSocket = connect(tokenFor(client));
    await Promise.all([waitConnect(providerSocket), waitConnect(clientSocket)]);
    await join(providerSocket, booking.id);
    await join(clientSocket, booking.id);

    let leaked = false;
    providerSocket.once('location:provider', () => { leaked = true; });
    // O cliente tenta emitir — não deve ser retransmitido ao profissional.
    clientSocket.emit('location:update', { bookingId: booking.id, lat: 10, lng: 10 });
    await new Promise((r) => setTimeout(r, 300));
    expect(leaked).toBe(false);

    providerSocket.close();
    clientSocket.close();
  });
});
