import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import * as Storage from '../utils/storage';
import {
  ANDROID_EMULATOR_LOOPBACK_HOST,
  API_PATH_PREFIX,
  API_REQUEST_TIMEOUT_MS,
  DEFAULT_DEV_BACKEND_PORT,
  StorageKey,
} from '../constants';

/**
 * Detecta se o app web está sendo servido pelo próprio backend (mesma origem).
 * Isso acontece quando WEB_DIST_DIR está configurado no backend e o build do Expo
 * é servido como arquivos estáticos. Nesse caso, usamos URL relativa para evitar CORS.
 */
function isSameOriginWeb(): boolean {
  return Platform.OS === 'web' && typeof window !== 'undefined' && window.location.port === '';
}

/**
 * Resolve the API base URL with the following precedence:
 *   1. `EXPO_PUBLIC_API_BASE_URL` — inlined at build time. Unlike
 *      `extra.apiBaseUrl`, which lives in the committed `app.json` and is
 *      shared by every target, this can be set per build. Accepts a relative
 *      value (`/api/v1`) so a web bundle served by the backend itself talks
 *      to it same-origin — no CORS, and no tunnel interstitial on XHR.
 *   2. `expoConfig.extra.apiBaseUrl` — explicit override per environment.
 *   3. On web served by backend (same origin), use relative path.
 *   4. On web (dev), derive from the current `window.location` so the app talks
 *      to a backend on the same host (works in LAN / tunnel previews).
 *   5. Expo Go / dev-client on a physical device: use Metro's `hostUri`
 *      (e.g. `"192.168.0.10:8081"`), which is the dev machine's LAN IP.
 *      Reusing it means the phone talks to the backend on the same host
 *      as the bundler — zero per-device config.
 *   6. Android emulator → `10.0.2.2` (loopback to the dev machine).
 *   7. Everything else (iOS simulator, web SSR, tests) → `localhost`.
 */
function resolveBaseUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (fromEnv) return fromEnv;

  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra;

  // Se o app web está sendo servido pelo backend (mesma origem), usa path relativo
  if (isSameOriginWeb()) {
    return API_PATH_PREFIX;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_DEV_BACKEND_PORT}${API_PATH_PREFIX}`;
  }

  const hostUri =
    Constants.expoConfig?.hostUri ??
    (Constants as unknown as { expoGoConfig?: { debuggerHost?: string } }).expoGoConfig?.debuggerHost;
  if (typeof hostUri === 'string' && hostUri.length > 0) {
    const lanHost = hostUri.split(':')[0];
    if (lanHost && lanHost !== 'localhost' && lanHost !== '127.0.0.1') {
      return `http://${lanHost}:${DEFAULT_DEV_BACKEND_PORT}${API_PATH_PREFIX}`;
    }
  }

  const host = Platform.OS === 'android' ? ANDROID_EMULATOR_LOOPBACK_HOST : 'localhost';
  return `http://${host}:${DEFAULT_DEV_BACKEND_PORT}${API_PATH_PREFIX}`;
}

export const API_BASE_URL: string = resolveBaseUrl();

/**
 * Secure store for the access + refresh JWTs. Plain-old object exposing
 * a tiny API so consumers don't need to know the storage keys.
 */
export const tokenStore = {
  getAccess: () => Storage.get(StorageKey.ACCESS_TOKEN),
  getRefresh: () => Storage.get(StorageKey.REFRESH_TOKEN),
  set: async (access: string, refresh: string) => {
    await Storage.set(StorageKey.ACCESS_TOKEN, access);
    await Storage.set(StorageKey.REFRESH_TOKEN, refresh);
  },
  clear: async () => {
    await Storage.remove(StorageKey.ACCESS_TOKEN);
    await Storage.remove(StorageKey.REFRESH_TOKEN);
  },
} as const;

export const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_REQUEST_TIMEOUT_MS,
});

api.interceptors.request.use(async (config) => {
  const token = await tokenStore.getAccess();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Single-flight refresh. If multiple 401s happen concurrently they all
 * await the same in-flight refresh instead of hammering `/auth/refresh`.
 */
let refreshing: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refresh = await tokenStore.getRefresh();
  if (!refresh) return null;
  try {
    // Usa a instância `api` para respeitar timeout, interceptors e baseURL corretos
    const res = await api.post('/auth/refresh', { refreshToken: refresh });
    const { accessToken, refreshToken } = res.data;
    await tokenStore.set(accessToken, refreshToken);
    return accessToken;
  } catch {
    await tokenStore.clear();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config as AxiosRequestConfig & { _retried?: boolean };
    const shouldRetry = error.response?.status === 401 && original && !original._retried;
    if (!shouldRetry) return Promise.reject(error);

    original._retried = true;
    // Single-flight real: antes a `refreshing` era zerada logo depois do await do
    // primeiro cliente, então uma segunda 401 concorrente via `refreshing` como null
    // e disparava um segundo POST /auth/refresh — quebrando o propósito do latch.
    // O `.finally` garante que todas as 401s que entrarem enquanto o refresh está
    // em voo latchem na MESMA promise; só quando ela resolve é que `refreshing`
    // volta a null, deixando futuras 401s dispararem um refresh novo.
    if (!refreshing) {
      refreshing = refreshAccessToken().finally(() => {
        refreshing = null;
      });
    }
    const newToken = await refreshing;

    if (!newToken) return Promise.reject(error);

    original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
    return api.request(original);
  },
);
