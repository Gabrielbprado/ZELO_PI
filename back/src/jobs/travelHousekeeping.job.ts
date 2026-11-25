import {
  cancelTravelInternal,
  deleteLocationBestEffort,
  recentlyEndedSessions,
  staleActiveSessions,
} from '../services/bookingTravel.service';
import { logger } from '../utils/logger';

/**
 * Housekeeping de sessões de deslocamento. Dois jobs separados, um para cada tipo
 * de problema:
 *
 *   1) `travel-redis-cleanup` — se o `redis.del` inline do service falhou (Redis
 *      estava fora no momento do arrived/cancel), a chave sobreviveu. Este job
 *      reaplica o `del` até sucesso em sessões encerradas há menos de 1h. Como o
 *      TTL é 60s, o pior caso sem o job é 60s de cache; com o job, seg plus.
 *      Idempotente.
 *
 *   2) `travel-timeout-active` — sessão ACTIVE há mais de N horas é anomalia:
 *      provider abriu, não chegou, nem cancelou (app matou, sem rede, etc).
 *      Fechamos com `reason=timeout`. O cliente já vê "sem atualizações há X"
 *      pelo staleness detector; isto é limpeza operacional.
 */

const RECENTLY_ENDED_WINDOW_MS = 60 * 60 * 1000;   // 1h
const STALE_ACTIVE_THRESHOLD_MS = 8 * 60 * 60 * 1000; // 8h

export async function travelRedisCleanup(): Promise<{ attempted: number; cleaned: number }> {
  const sessions = await recentlyEndedSessions(RECENTLY_ENDED_WINDOW_MS);
  let cleaned = 0;
  for (const s of sessions) {
    const ok = await deleteLocationBestEffort(s.bookingId);
    if (ok) cleaned += 1;
  }
  if (cleaned > 0) {
    logger.info({ attempted: sessions.length, cleaned }, 'travel-redis-cleanup: chaves apagadas');
  }
  return { attempted: sessions.length, cleaned };
}

export async function travelTimeoutActive(): Promise<{ closed: number }> {
  const sessions = await staleActiveSessions(STALE_ACTIVE_THRESHOLD_MS);
  let closed = 0;
  for (const s of sessions) {
    try {
      // Só conta transições EFETIVAS. Sob duas instâncias do job em paralelo, uma vence
      // a corrida (changed:true) e a outra vê a sessão já encerrada (changed:false).
      // Contar fiascamente inflacionaria a métrica sem refletir mudança real.
      const { changed } = await cancelTravelInternal(s.bookingId, 'timeout');
      if (changed) closed += 1;
    } catch (err) {
      logger.warn({ bookingId: s.bookingId, err: (err as Error).message }, 'travel-timeout: falha ao fechar sessão');
    }
  }
  if (closed > 0) {
    logger.info({ closed }, 'travel-timeout-active: sessões abandonadas fechadas');
  }
  return { closed };
}
