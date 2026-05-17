import { api, tokenStore } from './client';
import type { User, Role } from '../types';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export async function register(input: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role: Role;
  city?: string;
  neighborhood?: string;
}): Promise<User> {
  const { data } = await api.post('/auth/register', input);
  return data.user;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const { data } = await api.post<AuthResponse>('/auth/login', { email, password });
  await tokenStore.set(data.accessToken, data.refreshToken);
  return data;
}

export async function logout(): Promise<void> {
  const refresh = await tokenStore.getRefresh();
  try {
    if (refresh) await api.post('/auth/logout', { refreshToken: refresh });
  } catch { /* tolerável — limpamos tokens locais de qualquer forma */ }
  await tokenStore.clear();
}

export async function me(): Promise<User | null> {
  try {
    const { data } = await api.get<{ user: User }>('/auth/me');
    return data.user;
  } catch {
    return null;
  }
}
