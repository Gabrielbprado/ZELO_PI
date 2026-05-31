import { api } from './client';
import type { Notification } from '../types';

export async function list(): Promise<Notification[]> {
  const { data } = await api.get<{ items: Notification[] }>('/notifications');
  return data.items;
}

export async function markAllRead(): Promise<void> {
  await api.post('/notifications/read-all');
}

export async function markRead(id: string): Promise<void> {
  await api.post(`/notifications/${id}/read`);
}

/** Persist this device's Expo push token server-side. */
export async function registerPushToken(token: string): Promise<void> {
  await api.post('/users/me/push-token', { token });
}

/** Drop this device's push token server-side (on logout). */
export async function deletePushToken(): Promise<void> {
  await api.delete('/users/me/push-token');
}
