import { logger } from '../utils/logger';
import { disconnectAmqp, isAmqpEnabled } from '../config/amqp';
import { startOutboxRelay, stopOutboxRelay } from './relay';
import { startConsumer, stopConsumers } from './consumers/runtime';
import { analyticsConsumer } from './consumers/analytics.consumer';
import { remindersConsumer } from './consumers/reminders.consumer';
import { ledgerConsumer } from './consumers/ledger.consumer';
import { jobsEnabled } from '../config/jobs';

/**
 * Liga o barramento: consumidores primeiro (declaram as filas e já ficam ouvindo),
 * relay depois (começa a publicar o que o outbox acumulou). No-op quando o RabbitMQ
 * está desligado — e é importante que seja um no-op SILENCIOSO e seguro: o outbox
 * continua sendo gravado dentro das transações de domínio de qualquer forma, só não há
 * quem entregue até o broker voltar.
 *
 * O consumidor de notificações NÃO vive mais aqui: foi extraído para
 * services/notifications. O backend só PUBLICA os eventos (via outbox); quem consome a
 * fila `notifications.q`, persiste o inbox e envia o push é o microserviço. O que resta
 * no backend é o consumidor de analytics.
 */
export async function startEvents(): Promise<void> {
  if (!isAmqpEnabled()) {
    logger.info('rabbitmq desligado; barramento inativo (o outbox segue sendo gravado)');
    return;
  }
  await startConsumer(analyticsConsumer);
  // Consumidor do ledger: escrow + comissão. Move dinheiro a partir dos eventos.
  await startConsumer(ledgerConsumer);
  // O consumidor de lembretes só faz sentido com jobs (BullMQ/Redis) ligados — é ele que
  // traduz booking.accepted/cancelled em jobs delayed.
  if (jobsEnabled()) await startConsumer(remindersConsumer);
  startOutboxRelay();
}

export async function stopEvents(): Promise<void> {
  stopOutboxRelay();
  await stopConsumers();
  await disconnectAmqp();
}
