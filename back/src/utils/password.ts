import bcrypt from 'bcryptjs';
import { env } from '../config/env';
import { PASSWORD_MIN_LENGTH } from '../constants/security';

export interface PasswordStrengthResult {
  ok: boolean;
  reason?: string;
}

const STRENGTH_RULES: ReadonlyArray<{ test: (pwd: string) => boolean; reason: string }> = [
  {
    test: (pwd) => pwd.length >= PASSWORD_MIN_LENGTH,
    reason: `A senha deve ter no mínimo ${PASSWORD_MIN_LENGTH} caracteres.`,
  },
  { test: (pwd) => /[A-Z]/.test(pwd), reason: 'A senha deve conter ao menos uma letra maiúscula.' },
  { test: (pwd) => /[a-z]/.test(pwd), reason: 'A senha deve conter ao menos uma letra minúscula.' },
  { test: (pwd) => /[0-9]/.test(pwd), reason: 'A senha deve conter ao menos um número.' },
];

/** Validate the password against the configured strength rules. */
export function validatePasswordStrength(password: string): PasswordStrengthResult {
  for (const rule of STRENGTH_RULES) {
    if (!rule.test(password)) return { ok: false, reason: rule.reason };
  }
  return { ok: true };
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, env.BCRYPT_SALT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
