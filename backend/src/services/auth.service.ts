import { prisma } from '../config/prisma';
import { hashPassword, validatePasswordStrength, verifyPassword } from '../utils/password';
import {
  generateRefreshToken,
  hashRefreshToken,
  parseDurationToMs,
  signAccessToken,
} from '../utils/tokens';
import { env } from '../config/env';
import { BadRequestError, ConflictError, ForbiddenError, UnauthorizedError } from '../errors';
import { ACCOUNT_LOCK_MINUTES, MAX_FAILED_LOGINS } from '../constants/security';
import { ONE_MINUTE_MS } from '../constants/time';
import { publicUserSelect } from '../selectors';
import type { Role } from '@prisma/client';

const ACCOUNT_LOCK_DURATION_MS = ACCOUNT_LOCK_MINUTES * ONE_MINUTE_MS;

const AVATAR_HUE_RANGE = 360;

export interface RegisterInput {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: 'CLIENT' | 'PROVIDER';
  city?: string;
  neighborhood?: string;
}

export interface RequestMeta {
  ip?: string;
  ua?: string;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

function randomAvatarHue(): number {
  return Math.floor(Math.random() * AVATAR_HUE_RANGE);
}

export async function registerUser(input: RegisterInput) {
  const strength = validatePasswordStrength(input.password);
  if (!strength.ok) throw new BadRequestError(strength.reason!);

  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw new ConflictError('E-mail já cadastrado');

  const passwordHash = await hashPassword(input.password);

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: input.role as Role,
      city: input.city,
      neighborhood: input.neighborhood,
      avatarHue: randomAvatarHue(),
      ...(input.role === 'PROVIDER' && { providerProfile: { create: {} } }),
    },
    select: publicUserSelect,
  });
}

export async function authenticateUser(
  email: string,
  password: string,
  meta: RequestMeta,
): Promise<IssuedTokens> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) throw new UnauthorizedError('Credenciais inválidas');

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ForbiddenError(
      'Conta bloqueada temporariamente. Tente novamente em alguns minutos.',
    );
  }
  if (!user.isActive) throw new ForbiddenError('Conta desativada');

  const passwordOk = await verifyPassword(password, user.passwordHash);
  if (!passwordOk) {
    await registerFailedLogin(user.id, user.failedLogins, user.lockedUntil);
    throw new UnauthorizedError('Credenciais inválidas');
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { failedLogins: 0, lockedUntil: null },
  });

  return issueTokens(user.id, user.role, user.email, meta);
}

async function registerFailedLogin(
  userId: string,
  currentFailures: number,
  currentLockedUntil: Date | null,
): Promise<void> {
  const nextFailures = currentFailures + 1;
  const shouldLock = nextFailures >= MAX_FAILED_LOGINS;
  await prisma.user.update({
    where: { id: userId },
    data: {
      failedLogins: shouldLock ? 0 : nextFailures,
      lockedUntil: shouldLock
        ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MS)
        : currentLockedUntil,
    },
  });
}

export async function issueTokens(
  userId: string,
  role: Role,
  email: string,
  meta: RequestMeta,
): Promise<IssuedTokens> {
  const accessToken = signAccessToken({ sub: userId, role, email });
  const { token: refreshToken, hash } = generateRefreshToken();
  const expiresAt = new Date(Date.now() + parseDurationToMs(env.JWT_REFRESH_EXPIRES_IN));

  await prisma.refreshToken.create({
    data: { userId, tokenHash: hash, expiresAt, ip: meta.ip, userAgent: meta.ua },
  });

  return { accessToken, refreshToken, expiresAt };
}

/**
 * Rotate the refresh token. Re-using a previously rotated token (a sign of
 * token theft) revokes *all* live tokens for the user as a safety net.
 */
export async function rotateRefreshToken(
  rawToken: string,
  meta: RequestMeta,
): Promise<IssuedTokens> {
  const tokenHash = hashRefreshToken(rawToken);
  const record = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  const isExpired = record ? record.expiresAt < new Date() : false;
  if (!record || record.revokedAt || isExpired) {
    if (record && !record.revokedAt) {
      // Reuso de token rotacionado → revoga toda a árvore por segurança
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw new UnauthorizedError('Refresh token inválido ou expirado');
  }

  await prisma.refreshToken.update({
    where: { id: record.id },
    data: { revokedAt: new Date() },
  });

  return issueTokens(record.userId, record.user.role, record.user.email, meta);
}

export async function revokeRefreshToken(rawToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
