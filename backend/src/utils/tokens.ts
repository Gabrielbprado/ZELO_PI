import crypto from 'crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import type { Role } from '@prisma/client';
import { ONE_DAY_MS, ONE_HOUR_MS, ONE_MINUTE_MS, ONE_SECOND_MS, ONE_WEEK_MS } from '../constants/time';
import { REFRESH_TOKEN_BYTES } from '../constants/security';

export interface AccessTokenPayload {
  sub: string;
  role: Role;
  email: string;
}

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex';

const DURATION_UNIT_MS: Readonly<Record<string, number>> = {
  s: ONE_SECOND_MS,
  m: ONE_MINUTE_MS,
  h: ONE_HOUR_MS,
  d: ONE_DAY_MS,
};

const DEFAULT_REFRESH_LIFETIME_MS = ONE_WEEK_MS;

export function signAccessToken(payload: AccessTokenPayload): string {
  const opts: SignOptions = { expiresIn: env.JWT_ACCESS_EXPIRES_IN as SignOptions['expiresIn'] };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, opts);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/**
 * Generate a high-entropy refresh token plus its SHA-256 hash.
 * Only the hash is ever persisted — the plaintext value is returned to
 * the caller so it can be handed back to the client.
 */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(REFRESH_TOKEN_BYTES).toString(HASH_ENCODING);
  return { token, hash: hashRefreshToken(token) };
}

/** Hash a refresh token so it can be looked up by hash without ever storing the plaintext. */
export function hashRefreshToken(token: string): string {
  return crypto.createHash(HASH_ALGORITHM).update(token).digest(HASH_ENCODING);
}

/**
 * Parse the short duration strings used in env vars (e.g. `15m`, `7d`)
 * into milliseconds. Falls back to one week when the input is malformed.
 */
export function parseDurationToMs(input: string): number {
  const match = input.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return DEFAULT_REFRESH_LIFETIME_MS;
  const [, amount, unit] = match;
  const multiplier = DURATION_UNIT_MS[unit.toLowerCase()];
  return Number(amount) * multiplier;
}
