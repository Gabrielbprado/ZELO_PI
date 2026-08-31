import { Prisma } from '@prisma/client';
import type { EventPayload, RoutingKey } from './types';

/**
 * Barramento de eventos de domínio — o mesmo papel de desacoplamento que o
 * `realtime/bus.ts` cumpre para o socket.io, agora para a integração entre serviços.
 *
 * Um service chama `recordEvent(tx, 'booking.created', {...})` e pronto: ele não sabe
 * que existe RabbitMQ, não importa `amqplib`, e continua unit-testável com um Prisma
 * mockado. O evento é só uma LINHA gravada na MESMA transação da mudança de estado —
 * é isso que dá atomicidade: ou o booking e o evento persistem juntos, ou nenhum.
 * Quem publica de fato é o relay, lendo o outbox; quem valida o formato é o consumidor.
 *
 * De propósito NÃO validamos o payload aqui: o tipo já garante a forma em tempo de
 * compilação, e um `parse` em runtime poderia lançar DENTRO da transação de domínio e
 * derrubar um booking real por um bug de telemetria. A validação estrita fica na borda
 * de consumo, onde recusar é seguro.
 */
export async function recordEvent<K extends RoutingKey>(
  tx: Prisma.TransactionClient,
  routingKey: K,
  payload: EventPayload<K>,
): Promise<void> {
  await tx.outboxEvent.create({
    data: {
      routingKey,
      payload: payload as unknown as Prisma.InputJsonValue,
    },
  });
}
