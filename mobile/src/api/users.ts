import { api } from './client';
import type { User } from '../types';

export interface UpdateProfileInput {
  name?: string;
  phone?: string;
  city?: string;
  neighborhood?: string;
  avatarHue?: number;
}

export async function updateProfile(input: UpdateProfileInput): Promise<User> {
  const { data } = await api.patch<{ user: User }>('/users/me', input);
  return data.user;
}

export async function changePassword(input: { currentPassword: string; newPassword: string }): Promise<void> {
  await api.post('/users/me/change-password', input);
}

export async function forgotPassword(email: string): Promise<{ devToken?: string }> {
  const { data } = await api.post<{ devToken?: string }>('/users/forgot-password', { email });
  return data;
}

export async function resetPassword(input: { token: string; newPassword: string }): Promise<void> {
  await api.post('/users/reset-password', input);
}
