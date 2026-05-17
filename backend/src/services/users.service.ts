import crypto from 'crypto';
import { prisma } from '../config/prisma';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../utils/password';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../errors';
import { PASSWORD_RESET_TOKEN_BYTES, PASSWORD_RESET_TOKEN_TTL_MIN } from '../constants/security';
import { ONE_MINUTE_MS } from '../constants/time';
import { publicUserSelect } from '../selectors';

const RESET_TOKEN_TTL_MS = PASSWORD_RESET_TOKEN_TTL_MIN * ONE_MINUTE_MS;
const RESET_TOKEN_HASH_ALGORITHM = 'sha256';
const RESET_TOKEN_HASH_ENCODING = 'hex';

export interface UpdateProfileInput {
  name?: string;
  phone?: string | null;
  city?: string | null;
  neighborhood?: string | null;
  avatarHue?: number;
}

function hashResetToken(token: string): string {
  return crypto.createHash(RESET_TOKEN_HASH_ALGORITHM).update(token).digest(RESET_TOKEN_HASH_ENCODING);
}

function emptyToNull<T extends string | null | undefined>(value: T): T | null {
  return value || (null as T);
}

export async function updateOwnProfile(userId: string, input: UpdateProfileInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.phone !== undefined) data.phone = emptyToNull(input.phone);
  if (input.city !== undefined) data.city = emptyToNull(input.city);
  if (input.neighborhood !== undefined) data.neighborhood = emptyToNull(input.neighborhood);
  if (input.avatarHue !== undefined) data.avatarHue = input.avatarHue;

  if (Object.keys(data).length === 0) {
    throw new BadRequestError('Nenhum campo enviado para atualização');
  }

  return prisma.user.update({
    where: { id: userId },
    data,
    select: publicUserSelect,
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) throw new BadRequestError(strength.reason!);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('Usuário não encontrado');

  const currentOk = await verifyPassword(currentPassword, user.passwordHash);
  if (!currentOk) throw new UnauthorizedError('Senha atual incorreta');

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}

/**
 * Issue a password-reset token. We return `{ token: null }` for unknown
 * e-mails so callers can't probe which addresses are registered.
 */
export async function requestPasswordReset(email: string): Promise<{ token: string | null }> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { token: null };

  const raw = crypto.randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString(RESET_TOKEN_HASH_ENCODING);
  const hash = hashResetToken(raw);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
    },
  });

  return { token: raw };
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  const strength = validatePasswordStrength(newPassword);
  if (!strength.ok) throw new BadRequestError(strength.reason!);

  const hash = hashResetToken(token);
  const user = await prisma.user.findFirst({
    where: {
      passwordResetTokenHash: hash,
      passwordResetExpiresAt: { gt: new Date() },
    },
  });
  if (!user) throw new BadRequestError('Token inválido ou expirado');

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
        failedLogins: 0,
        lockedUntil: null,
      },
    }),
    prisma.refreshToken.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
}
