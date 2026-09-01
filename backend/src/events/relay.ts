import { prisma } from '../config/prisma';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { getPublishChannel, isAmqpEnabled } from '../config/amqp';
import { publishConfirmed } from './publisher';
import { eventsPublished } from '../config/metrics';

interface OutboxRow {
  id: string;
  routingKey: string;
  payload: unknown;
  requestId: string | null;
}

let timer: NodeJS.Timeout | null = null;
let running = false;

/**
 * Relay do outbox: o único componente que transforma linhas gravadas em mensagens no
 * broker. Roda em loop, não em `setInterval`, para nunca sobrepor dois ticks.
 *
 * O coração é `SELECT … FOR UPDATE SKIP LOCKED`: várias instâncias da API podem rodar o
 * relay ao mesmo tempo sem publicar o mesmo evento duas vezes — cada uma tranca um lote
 * distinto e a outra pula o que já está travado. O lock é mantido ABERTO durante a
 * publicação (a transação só commita depois de marcar `publishedAt`), então uma falha
 * no meio devolve o lote intacto para o próximo tick. Publicar dentro da transação
 * troca "possível perda" por "possível duplicata", e duplicata o consumidor deduplica.
 */
async function tick(): Promise<void> {
  const channel = await getPublishChannel();
  if (!channel) return; // Broker fora: eventos ficam represados; tentamos no próximo tick.

  await prisma.$transaction(
    async (tx) => {
      const events = await tx.$queryRaw<OutboxRow[]>`
        SELECT id, "routingKey", payload, "requestId"
        FROM "OutboxEvent"
        WHERE "publishedAt" IS NULL
        ORDER BY "createdAt" ASC
        LIMIT ${env.OUTBOX_RELAY_BATCH}
        FOR UPDATE SKIP LOCKED
      `;
      if (events.length === 0) return;

      const confirmed: string[] = [];
      const failed: string[] = [];
      await Promise.all(
        events.map(async (e) => {
          const ok = await publishConfirmed(channel, {
            id: e.id,
            routingKey: e.routingKey,
            payload: e.payload,
            requestId: e.requestId,
          });
          if (ok) {
            confirmed.push(e.id);
            eventsPublished.inc({ routing_key: e.routingKey });
          } else {
            failed.push(e.id);
          }
        }),
      );

      if (confirmed.length > 0) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: confirmed } },
          data: { publishedAt: new Date() },
        });
      }
      // Contabiliza a tentativa nos que não confirmaram: dá visibilidade a um evento
      // "veneno" que nunca é aceito, em vez de ele reciclar em silêncio para sempre.
      if (failed.length > 0) {
        await tx.outboxEvent.updateMany({
          where: { id: { in: failed } },
          data: { attempts: { increment: 1 } },
        });
        logger.warn({ count: failed.length }, 'relay: eventos não confirmados pelo broker');
      }
    },
    { timeout: 10_000 },
  );
}

/** Inicia o loop do relay. No-op quando o RabbitMQ está desligado por configuração. */
export function startOutboxRelay(): void {
  if (running || !isAmqpEnabled()) return;
  running = true;

  const loop = async (): Promise<void> => {
    if (!running) return;
    try {
      await tick();
    } catch (err) {
      logger.warn({ err: (err as Error).message }, 'relay: tick falhou');
    }
    if (running) timer = setTimeout(() => void loop(), env.OUTBOX_RELAY_INTERVAL_MS);
  };

  void loop();
  logger.info({ intervalMs: env.OUTBOX_RELAY_INTERVAL_MS }, 'relay do outbox iniciado');
}

export function stopOutboxRelay(): void {
  running = false;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * Drena o outbox uma vez, de forma síncrona, e devolve quantos eventos foram
 * publicados. Existe para os testes de integração: eles não querem esperar o tick de
 * 1s, querem publicar o que está pendente AGORA e checar o efeito.
 */
export async function drainOutboxOnce(): Promise<void> {
  await tick();
}
