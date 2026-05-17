import { api } from './client';
import type { MessageItem } from '../types';

export interface Conversation {
  user?: { id: string; name: string; avatarHue: number; role: string };
  lastAt: string;
  lastContent: string;
  unread: number;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data } = await api.get<{ items: Conversation[] }>('/messages');
  return data.items;
}

export async function listThread(otherUserId: string): Promise<MessageItem[]> {
  const { data } = await api.get<{ items: MessageItem[] }>(`/messages/${otherUserId}`);
  return data.items;
}

export async function sendMessage(input: { receiverId: string; bookingId?: string; content: string }): Promise<MessageItem> {
  const { data } = await api.post<MessageItem>('/messages', input);
  return data;
}
