import { ROUTING_KEYS, type DomainEvent } from '../types';
import type { EventConsumer } from './runtime';
import { cancelTravelInternal, deleteLocationBestEffort } from '../../services/bookingTravel.service';
import { getIO } from '../../realtime/io';
import { broadcastTravelStarted, broadcastTravelEnded } from '../../realtime/tracking';

/**
 * Consumidor da sessão de deslocamento. Dois papéis:
 *
 *   1) Limpeza em cascata — quando `booking.cancelled` chega, qualquer sessão de travel
 *      ativa daquele booking tem que ser encerrada. Se o app do prestador NÃO estiver
 *      aberto, o encerramento manual via REST nunca viria. Este consumer garante que
 *      a limpeza acontece mesmo com o prestador offline.
 *
 *   2) Fan-out para o Socket.IO — os eventos `travel.started` e `travel.ended` publicam
 *      no outbox dentro da MESMA transação que fez a transição de estado. Aqui, ao
 *      consumi-los, re-emitimos no Socket para a sala `booking:<id>` — assim o cliente
 *      recebe `travel:started` / `travel:ended` sem precisar de polling. Também
 *      aproveitamos para tentar `redis.del` de novo em `travel.ended`: dupla
 *      insurance se o del inline do service falhou.
 *
 * A operação é idempotente por natureza (o service já lida com "já encerrada" como
 * no-op; `redis.del` em chave inexistente é no-op). A tabela ProcessedEvent do runtime
 * cobre o resto.
 */
export const travelConsumer: EventConsumer = {
  name: 'travel',
  bindings: [
    ROUTING_KEYS.BOOKING_CANCELLED,
    ROUTING_KEYS.TRAVEL_STARTED,
    ROUTING_KEYS.TRAVEL_ENDED,
  ],
  async handle(event: DomainEvent, _tx) {
    if (event.routingKey === ROUTING_KEYS.BOOKING_CANCELLED) {
      // Encerra a sessão associada (se existir). cancelTravelInternal é no-op
      // quando não há sessão.
      await cancelTravelInternal(event.payload.bookingId, 'cancelled');
      return;
    }

    if (event.routingKey === ROUTING_KEYS.TRAVEL_STARTED) {
      const io = getIO();
      if (io) broadcastTravelStarted(io, event.payload.bookingId, event.payload.startedAt);
      return;
    }

    if (event.routingKey === ROUTING_KEYS.TRAVEL_ENDED) {
      // Insurance: o service já tentou `redis.del` em linha. Tentamos de novo aqui
      // para o caso de o del inline ter falhado (Redis instável no momento). O job
      // periódico ainda cobre falha persistente.
      await deleteLocationBestEffort(event.payload.bookingId);

      const io = getIO();
      if (io) {
        broadcastTravelEnded(io, event.payload.bookingId, event.payload.reason, event.payload.endedAt);
      }
    }
  },
};
