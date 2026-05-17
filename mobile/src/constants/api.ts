/**
 * HTTP-client tuning. Keep these conservative — generous defaults make
 * the app feel sluggish on flaky networks.
 */

/** Per-request timeout (milliseconds) for the Axios instance. */
export const API_REQUEST_TIMEOUT_MS = 15_000;

/** Default port the local backend listens on during development. */
export const DEFAULT_DEV_BACKEND_PORT = 4000;

/** Path prefix every backend route lives under. */
export const API_PATH_PREFIX = '/api/v1';

/**
 * Loopback address used by the Android emulator to reach the host
 * machine's localhost.
 */
export const ANDROID_EMULATOR_LOOPBACK_HOST = '10.0.2.2';
