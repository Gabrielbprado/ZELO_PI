/**
 * Keys used for the encrypted/local storage layer (`utils/storage`).
 *
 * Centralising them avoids stale strings drifting across the codebase
 * and gives us a single place to bump if we ever need to invalidate a
 * stored value during an app migration.
 */
export const StorageKey = {
  ACCESS_TOKEN: 'zero.access',
  REFRESH_TOKEN: 'zero.refresh',
  THEME: 'zero.theme',
  ONBOARDED_HOME: 'zelo.onboarded.home.v1',
} as const;

export type StorageKey = (typeof StorageKey)[keyof typeof StorageKey];
