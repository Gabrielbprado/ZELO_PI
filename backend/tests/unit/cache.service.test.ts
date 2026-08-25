/**
 * O comportamento que estes testes protegem não é "o cache acelera" — é
 * "o cache nunca quebra". Redis fora do ar, payload corrompido ou comando
 * lento precisam resultar em uma ida ao banco, jamais em um erro para o usuário.
 */
const redisMock = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  scan: jest.fn(),
  unlink: jest.fn(),
  options: { keyPrefix: 'zelo:' },
};

let redisAvailable = true;

jest.mock('../../src/config/redis', () => ({
  getRedis: () => (redisAvailable ? redisMock : null),
}));

import { withCache, invalidate, invalidatePrefix, resetCacheStats, cacheStats } from '../../src/services/cache.service';

beforeEach(() => {
  jest.clearAllMocks();
  resetCacheStats();
  redisAvailable = true;
});

describe('withCache', () => {
  it('devolve o valor cacheado sem chamar a origem', async () => {
    redisMock.get.mockResolvedValue(JSON.stringify({ nome: 'Carlos' }));
    const loader = jest.fn();

    const resultado = await withCache('prov:detail:1', 60, loader);

    expect(resultado).toEqual({ nome: 'Carlos' });
    expect(loader).not.toHaveBeenCalled();
    expect(cacheStats().hits).toBe(1);
  });

  it('consulta a origem no miss e grava com o TTL pedido', async () => {
    redisMock.get.mockResolvedValue(null);
    redisMock.set.mockResolvedValue('OK');

    const resultado = await withCache('cat:all', 3600, async () => [{ id: 'plumb' }]);

    expect(resultado).toEqual([{ id: 'plumb' }]);
    expect(redisMock.set).toHaveBeenCalledWith('cat:all', JSON.stringify([{ id: 'plumb' }]), 'EX', 3600);
    expect(cacheStats().misses).toBe(1);
  });

  it('com o Redis fora do ar, executa a origem exatamente uma vez e não lança', async () => {
    redisMock.get.mockRejectedValue(new Error('ECONNREFUSED'));
    redisMock.set.mockRejectedValue(new Error('ECONNREFUSED'));
    const loader = jest.fn().mockResolvedValue('do banco');

    await expect(withCache('prov:detail:1', 60, loader)).resolves.toBe('do banco');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(cacheStats().errors).toBeGreaterThan(0);
  });

  it('com o Redis desligado por configuração, vai direto à origem', async () => {
    redisAvailable = false;
    const loader = jest.fn().mockResolvedValue('do banco');

    await expect(withCache('cat:all', 60, loader)).resolves.toBe('do banco');
    expect(loader).toHaveBeenCalledTimes(1);
    expect(redisMock.get).not.toHaveBeenCalled();
  });

  it('trata payload corrompido como miss, em vez de propagar o erro de parse', async () => {
    redisMock.get.mockResolvedValue('{ isto não é json');
    redisMock.set.mockResolvedValue('OK');
    const loader = jest.fn().mockResolvedValue({ ok: true });

    await expect(withCache('prov:detail:1', 60, loader)).resolves.toEqual({ ok: true });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('não cacheia undefined — seria indistinguível de um miss na próxima leitura', async () => {
    redisMock.get.mockResolvedValue(null);
    const loader = jest.fn().mockResolvedValue(undefined);

    await expect(withCache('prov:detail:x', 60, loader)).resolves.toBeUndefined();
    expect(redisMock.set).not.toHaveBeenCalled();
  });

  it('propaga erro da própria origem — só o cache é best-effort', async () => {
    redisMock.get.mockResolvedValue(null);
    const loader = jest.fn().mockRejectedValue(new Error('banco fora'));

    await expect(withCache('cat:all', 60, loader)).rejects.toThrow('banco fora');
  });
});

describe('invalidação', () => {
  it('não lança quando o Redis falha', async () => {
    redisMock.del.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(invalidate('cat:all')).resolves.toBeUndefined();
  });

  it('ignora chamada sem chaves', async () => {
    await invalidate();
    expect(redisMock.del).not.toHaveBeenCalled();
  });

  it('varre por prefixo com SCAN e apaga com UNLINK, sem usar KEYS', async () => {
    // O ioredis aplica o keyPrefix nos comandos, mas não no padrão do SCAN nem
    // nas chaves que ele devolve — a implementação precisa lidar com os dois lados.
    redisMock.scan
      .mockResolvedValueOnce(['12', ['zelo:prov:list:aaa', 'zelo:prov:list:bbb']])
      .mockResolvedValueOnce(['0', []]);
    redisMock.unlink.mockResolvedValue(2);

    await invalidatePrefix('prov:list:');

    expect(redisMock.scan).toHaveBeenCalledWith('0', 'MATCH', 'zelo:prov:list:*', 'COUNT', 200);
    expect(redisMock.unlink).toHaveBeenCalledWith('prov:list:aaa', 'prov:list:bbb');
  });

  it('não lança quando o SCAN falha', async () => {
    redisMock.scan.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(invalidatePrefix('prov:list:')).resolves.toBeUndefined();
  });
});
