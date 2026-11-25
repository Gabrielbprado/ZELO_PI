import {
  generateRefreshToken,
  hashRefreshToken,
  parseDurationToMs,
  signAccessToken,
  verifyAccessToken,
} from '../../src/utils/tokens';

describe('tokens', () => {
  it('signAccessToken + verifyAccessToken faz round-trip', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'CLIENT', email: 'x@y.com' });
    const decoded = verifyAccessToken(token);
    expect(decoded.sub).toBe('user-1');
    expect(decoded.role).toBe('CLIENT');
    expect(decoded.email).toBe('x@y.com');
  });

  it('verifyAccessToken lança em token adulterado', () => {
    const token = signAccessToken({ sub: 'a', role: 'CLIENT', email: 'a@b.com' });
    const tampered = token.slice(0, -2) + 'AA';
    expect(() => verifyAccessToken(tampered)).toThrow();
  });

  it('generateRefreshToken retorna token e hash compatível', () => {
    const { token, hash } = generateRefreshToken();
    expect(token).toHaveLength(128);
    expect(hash).toHaveLength(64);
    expect(hashRefreshToken(token)).toBe(hash);
  });

  it('parseDurationToMs converte unidades comuns', () => {
    expect(parseDurationToMs('30s')).toBe(30_000);
    expect(parseDurationToMs('15m')).toBe(15 * 60_000);
    expect(parseDurationToMs('2h')).toBe(2 * 3_600_000);
    expect(parseDurationToMs('7d')).toBe(7 * 86_400_000);
  });

  it('parseDurationToMs aplica fallback de 7d em entrada inválida', () => {
    expect(parseDurationToMs('foo')).toBe(7 * 86_400_000);
  });
});
