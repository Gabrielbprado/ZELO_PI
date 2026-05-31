import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';
import request from 'supertest';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as IOServer } from 'socket.io';
import { getApp, createUser, tokenFor } from './helpers';
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

function connect(token?: string): ClientSocket {
  return ioClient(baseUrl, {
    path: REALTIME_PATH,
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
    forceNew: true,
  });
}

function waitConnect(socket: ClientSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (err) => reject(err));
  });
}

describe('Realtime chat (WebSocket)', () => {
  it('rejects a handshake without a valid token', async () => {
    const socket = connect();
    await expect(waitConnect(socket)).rejects.toThrow();
    socket.close();
  });

  it('delivers message:new to the recipient in real time', async () => {
    const alice = await createUser({ email: `alice-${Date.now()}@rt.test` });
    const bob = await createUser({ email: `bob-${Date.now()}@rt.test` });
    const app = await getApp();

    const bobSocket = connect(tokenFor(bob));
    await waitConnect(bobSocket);

    const received = new Promise<{ senderId: string; content: string }>((resolve) => {
      bobSocket.once('message:new', resolve);
    });

    const res = await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(alice)}`)
      .send({ receiverId: bob.id, content: 'Olá, Bob!' });
    expect(res.status).toBe(201);

    const event = await received;
    expect(event.content).toBe('Olá, Bob!');
    expect(event.senderId).toBe(alice.id);

    bobSocket.close();
  });

  it('persists messages sent while offline so they replay via REST on reconnect', async () => {
    const alice = await createUser({ email: `alice2-${Date.now()}@rt.test` });
    const bob = await createUser({ email: `bob2-${Date.now()}@rt.test` });
    const app = await getApp();

    // Bob is offline (no socket). Alice sends two messages.
    await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(alice)}`)
      .send({ receiverId: bob.id, content: 'msg 1' });
    await request(app)
      .post('/api/v1/messages')
      .set('Authorization', `Bearer ${tokenFor(alice)}`)
      .send({ receiverId: bob.id, content: 'msg 2' });

    // On reconnect the client replays the thread via the REST endpoint.
    const thread = await request(app)
      .get(`/api/v1/messages/${alice.id}`)
      .set('Authorization', `Bearer ${tokenFor(bob)}`);
    expect(thread.status).toBe(200);
    expect(thread.body.items.map((m: { content: string }) => m.content)).toEqual(['msg 1', 'msg 2']);
  });
});
