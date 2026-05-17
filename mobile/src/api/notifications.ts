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
