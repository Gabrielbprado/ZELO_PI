import { z } from 'zod';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../constants/security';

const NAME_MIN = 2;
const NAME_MAX = 80;
const PHONE_REGEX = /^\+?\d{10,15}$/;
const TOKEN_MIN = 32;
const TOKEN_MAX = 128;
const CITY_MAX = 80;
const AVATAR_HUE_MAX = 360;

const passwordField = z.string().min(PASSWORD_MIN_LENGTH, 'Senha muito curta').max(PASSWORD_MAX_LENGTH);
const newPasswordField = passwordField; // alias for readability

export const registerSchema = {
  body: z.object({
    name: z.string().trim().min(NAME_MIN, 'Nome muito curto').max(NAME_MAX),
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
    name: z.string().trim().min(NAME_MIN).max(NAME_MAX).optional(),
    phone: z
      .string()
      .trim()
      .regex(PHONE_REGEX, 'Telefone inválido')
      .optional()
      .or(z.literal('')),
    city: z.string().trim().max(CITY_MAX).optional().or(z.literal('')),
    neighborhood: z.string().trim().max(CITY_MAX).optional().or(z.literal('')),
    avatarHue: z.number().int().min(0).max(AVATAR_HUE_MAX).optional(),
  }),
};
