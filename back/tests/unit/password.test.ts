import { hashPassword, validatePasswordStrength, verifyPassword } from '../../src/utils/password';

describe('password utils', () => {
  describe('validatePasswordStrength', () => {
    it('rejeita senhas curtas', () => {
      expect(validatePasswordStrength('Ab1c').ok).toBe(false);
    });

    it('exige letra maiúscula', () => {
      const r = validatePasswordStrength('abcd1234');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/maiúscula/i);
    });

    it('exige letra minúscula', () => {
      const r = validatePasswordStrength('ABCD1234');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/minúscula/i);
    });

    it('exige número', () => {
      const r = validatePasswordStrength('Abcdefgh');
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/número/i);
    });

    it('aceita senha forte', () => {
      expect(validatePasswordStrength('Senha@123').ok).toBe(true);
    });
  });

  describe('hashPassword / verifyPassword', () => {
    it('produz hash diferente do plaintext', async () => {
      const hash = await hashPassword('Senha@123');
      expect(hash).not.toBe('Senha@123');
      expect(hash.length).toBeGreaterThan(20);
    });

    it('verifyPassword retorna true para a senha correta', async () => {
      const hash = await hashPassword('Senha@123');
      expect(await verifyPassword('Senha@123', hash)).toBe(true);
    });

    it('verifyPassword retorna false para senha errada', async () => {
      const hash = await hashPassword('Senha@123');
      expect(await verifyPassword('outra', hash)).toBe(false);
    });

    it('hashes diferentes para a mesma senha (salt aleatório)', async () => {
      const a = await hashPassword('Senha@123');
      const b = await hashPassword('Senha@123');
      expect(a).not.toBe(b);
    });
  });
});
