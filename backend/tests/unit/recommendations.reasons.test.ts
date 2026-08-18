import {
  REC_REASON_CODES,
  REC_REASON_COPY,
  type RecReasonCode,
} from '../../src/constants/recommendations';

describe('cópia dos motivos', () => {
  it('todo código tem texto em pt-BR', () => {
    for (const code of REC_REASON_CODES) {
      const texto = REC_REASON_COPY[code](1);
      expect(typeof texto).toBe('string');
      expect(texto.length).toBeGreaterThan(0);
    }
  });

  it('recontratação diferencia singular de plural', () => {
    expect(REC_REASON_COPY.REHIRE(1)).toBe('Você já contratou');
    expect(REC_REASON_COPY.REHIRE(4)).toBe('Você já contratou 4 vezes');
  });

  it('distância usa vírgula decimal e trata o caso abaixo de 1 km', () => {
    expect(REC_REASON_COPY.NEARBY(2.35)).toBe('a 2,4 km');
    expect(REC_REASON_COPY.NEARBY(0.4)).toBe('a menos de 1 km');
  });

  it('valor ausente não vira "undefined" na tela', () => {
    for (const code of REC_REASON_CODES) {
      const texto = REC_REASON_COPY[code](null);
      expect(texto).not.toMatch(/undefined|null|NaN/);
    }
  });

  it('nota é formatada com uma casa e vírgula', () => {
    expect(REC_REASON_COPY.TOP_RATED(4.83)).toBe('Bem avaliado (4,8)');
  });

  it('código desconhecido não tem texto (o serviço o descarta antes)', () => {
    const desconhecido = 'CODIGO_QUE_NAO_EXISTE' as RecReasonCode;
    expect(REC_REASON_COPY[desconhecido]).toBeUndefined();
  });
});
