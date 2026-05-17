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
 * Resolve the API base URL with the following precedence:
 *   1. `expoConfig.extra.apiBaseUrl` — explicit override per environment.
 *   2. On web, derive from the current `window.location` so the app talks
 *      to a backend on the same host (works in LAN / tunnel previews).
 *   3. Android emulator → `10.0.2.2` (loopback to the dev machine).
 *   4. Everything else (iOS simulator, web SSR, tests) → `localhost`.
 */
function resolveBaseUrl(): string {
  const fromExtra = (Constants.expoConfig?.extra as { apiBaseUrl?: string } | undefined)?.apiBaseUrl;
  if (fromExtra) return fromExtra;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.protocol}//${window.location.hostname}:${DEFAULT_DEV_BACKEND_PORT}${API_PATH_PREFIX}`;
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
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken: refresh });
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
    refreshing = refreshing ?? refreshAccessToken();
    const newToken = await refreshing;
    refreshing = null;

    if (!newToken) return Promise.reject(error);

    original.headers = { ...(original.headers ?? {}), Authorization: `Bearer ${newToken}` };
    return api.request(original);
  },
);
