/**
 * Security-related thresholds and TTLs.
 * Keep these tight — loosening them is a security decision, not a typo.
 */

/** Maximum consecutive failed logins before the account is temporarily locked. */
export const MAX_FAILED_LOGINS = 6;

/** Minutes the account stays locked after `MAX_FAILED_LOGINS` is reached. */
export const ACCOUNT_LOCK_MINUTES = 15;

/** Lifetime (minutes) of a password-reset token issued by `/users/forgot-password`. */
export const PASSWORD_RESET_TOKEN_TTL_MIN = 30;

/** Minimum length enforced by `validatePasswordStrength`. */
export const PASSWORD_MIN_LENGTH = 8;

/** Maximum length accepted for a password — mirrors validator schemas. */
export const PASSWORD_MAX_LENGTH = 128;

/** Bytes of entropy used to build a refresh token before SHA-256 storage. */
export const REFRESH_TOKEN_BYTES = 64;

/** Bytes of entropy used to build a password-reset token before SHA-256 storage. */
export const PASSWORD_RESET_TOKEN_BYTES = 32;
