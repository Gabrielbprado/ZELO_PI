import type { Prisma } from '@prisma/client';

/**
 * Public projection of a `User` — the only shape we should ever return
 * outside the service layer. `passwordHash`, lock fields and reset
 * tokens are deliberately excluded so they never leak in a response,
 * a log, or a serialised cache entry.
 */
export const publicUserSelect = {
  id: true,
  email: true,
  phone: true,
  name: true,
  role: true,
  avatarHue: true,
  city: true,
  neighborhood: true,
  emailVerified: true,
  createdAt: true,
  // CPF é PII, mas esta projeção só é usada pelo próprio usuário (login/register/me/
  // updateMe). Expor pra que o app saiba se já foi preenchido e pre-encha o campo.
  cpf: true,
} as const satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;
