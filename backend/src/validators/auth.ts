import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants/security';

const NAME_MIN = 2;
const NAME_MAX = 80;
const PHONE_REGEX = /^\+?\d{10,15}$/;
const TOKEN_MIN = 32;
const TOKEN_MAX = 128;
const CITY_MAX = 80;
const AVATAR_HUE_MAX = 360;
const PUSH_TOKEN_MAX = 255;

/** Remove tags HTML/script e caracteres de controle para prevenir XSS armazenado. */
const sanitizeInput = (val: string) =>
  val
    .replace(/<[^>]*>/g, '') // remove tags HTML
    .replace(/[\x00-\x1F\x7F]/g, '') // remove caracteres de controle
    .trim();

const passwordField = z.string().min(PASSWORD_MIN_LENGTH, 'Senha muito curta').max(PASSWORD_MAX_LENGTH);
const newPasswordField = passwordField; // alias for readability

const nameField = z.string().transform(sanitizeInput).pipe(
  z.string().min(NAME_MIN, 'Nome muito curto').max(NAME_MAX)
);

/** Valida os dois dígitos verificadores do CPF (algoritmo oficial Receita Federal). */
function isValidCpfChecksum(cpf: string): boolean {
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return false;
  // Rejeita sequências uniformes (00000000000, 11111111111 ...): são aceitas pelo
  // algoritmo mas não existem na base da Receita.
  if (/^(\d)\1+$/.test(digits)) return false;
  const calc = (slice: string, start: number): number => {
    let sum = 0;
    for (let i = 0; i < slice.length; i++) sum += Number(slice[i]) * (start - i);
    const mod = (sum * 10) % 11;
    return mod === 10 ? 0 : mod;
  };
  const d1 = calc(digits.slice(0, 9), 10);
  const d2 = calc(digits.slice(0, 10), 11);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

const cpfField = z
  .string()
  .trim()
  .refine((v) => isValidCpfChecksum(v), 'CPF inválido')
  // Persiste só os dígitos — o service compara pela coluna única, e o Asaas
  // também quer cpfCnpj sem máscara. Aceitar formatado é UX, armazenar formatado é dor.
  .transform((v) => v.replace(/\D/g, ''));

export const registerSchema = {
  body: z.object({
    name: nameField,
    email: z.string().trim().toLowerCase().email('E-mail inválido'),
    phone: z.string().trim().regex(PHONE_REGEX, 'Telefone inválido').optional(),
    password: passwordField,
    role: z.enum(['CLIENT', 'PROVIDER']).default('CLIENT'),
    city: z.string().trim().max(CITY_MAX).optional(),
    neighborhood: z.string().trim().max(CITY_MAX).optional(),
  }),
};

export const loginSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email('E-mail inválido'),
    password: z.string().min(1, 'Senha obrigatória'),
  }),
};

export const refreshSchema = {
  body: z.object({
    refreshToken: z.string().min(TOKEN_MIN, 'Refresh token inválido'),
  }),
};

export const logoutSchema = refreshSchema;

export const changePasswordSchema = {
  body: z.object({
    currentPassword: z.string().min(1, 'Senha atual obrigatória').max(PASSWORD_MAX_LENGTH),
    newPassword: newPasswordField,
  }),
};

export const forgotPasswordSchema = {
  body: z.object({
    email: z.string().trim().toLowerCase().email('E-mail inválido'),
  }),
};

export const resetPasswordSchema = {
  body: z.object({
    token: z.string().min(TOKEN_MIN, 'Token inválido').max(TOKEN_MAX),
    newPassword: newPasswordField,
  }),
};

export const updateProfileSchema = {
  body: z.object({
    name: nameField.optional(),
    phone: z
      .string()
      .trim()
      .regex(PHONE_REGEX, 'Telefone inválido')
      .optional()
      .or(z.literal('')),
    city: z.string().trim().max(CITY_MAX).optional().or(z.literal('')),
    neighborhood: z.string().trim().max(CITY_MAX).optional().or(z.literal('')),
    avatarHue: z.number().int().min(0).max(AVATAR_HUE_MAX).optional(),
    // CPF é opcional no update porque só vira obrigatório no fluxo de cartão,
    // e no cadastro pedir CPF upfront aumenta a fricção do PIX/dinheiro (que não precisam).
    cpf: cpfField.optional(),
  }),
};

export const pushTokenSchema = {
  body: z.object({
    token: z.string().trim().min(1).max(PUSH_TOKEN_MAX),
  }),
};
