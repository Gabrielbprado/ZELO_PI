/**
 * Testes unitários do service de rastreamento. Focam no que NÃO depende de I/O:
 * validação de coordenada e naming da chave Redis. A máquina de estados completa
 * (start/arrive/cancel com transações, publicação no outbox, del Redis) fica para
 * teste de integração — exige Postgres rodando.
 */

import { __test__ as T } from '../../src/services/bookingTravel.service';

describe('bookingTravel.service — unit', () => {
  describe('isValidCoord', () => {
    it('aceita coordenadas dentro do range', () => {
      expect(T.isValidCoord(-23.561, -46.656)).toBe(true);  // São Paulo
      expect(T.isValidCoord(0, 0)).toBe(true);              // Equador/meridiano — válido
      expect(T.isValidCoord(90, 180)).toBe(true);           // Limites
      expect(T.isValidCoord(-90, -180)).toBe(true);
    });

    it('rejeita latitude fora de ±90', () => {
      expect(T.isValidCoord(90.1, 0)).toBe(false);
      expect(T.isValidCoord(-90.1, 0)).toBe(false);
    });

    it('rejeita longitude fora de ±180', () => {
      expect(T.isValidCoord(0, 180.1)).toBe(false);
      expect(T.isValidCoord(0, -180.1)).toBe(false);
    });

    it('rejeita NaN e Infinity', () => {
      expect(T.isValidCoord(Number.NaN, 0)).toBe(false);
      expect(T.isValidCoord(0, Number.NaN)).toBe(false);
      expect(T.isValidCoord(Number.POSITIVE_INFINITY, 0)).toBe(false);
      expect(T.isValidCoord(0, Number.NEGATIVE_INFINITY)).toBe(false);
    });

    it('rejeita tipos não numéricos', () => {
      expect(T.isValidCoord('0', 0)).toBe(false);
      expect(T.isValidCoord(0, null)).toBe(false);
      expect(T.isValidCoord(undefined, 0)).toBe(false);
    });
  });

  describe('redisKey', () => {
    it('segue o padrão zelo:travel:{bookingId}:location', () => {
      expect(T.redisKey('abc-123')).toBe('zelo:travel:abc-123:location');
    });

    it('não vaza o prefixo antigo (track:) nem outro namespace', () => {
      const key = T.redisKey('xyz');
      expect(key.startsWith('zelo:travel:')).toBe(true);
      expect(key).not.toMatch(/^track:/);
    });
  });

  describe('TTL', () => {
    it('é 60 segundos (curto o suficiente para não exibir posição velha como ao vivo)', () => {
      expect(T.LOCATION_TTL_SEC).toBe(60);
    });
  });
});
