import { api, API_BASE_URL } from './client';
import type { MessageItem } from '../types';

export interface Conversation {
  user?: { id: string; name: string; avatarHue: number; role: string };
  lastAt: string;
  lastContent: string;
  unread: number;
}

export interface UploadedAttachment {
  url: string;
  name: string;
  type: string;
  size: number;
}

export interface SendMessageInput {
  receiverId: string;
  bookingId?: string;
  content?: string;
  attachmentUrl?: string;
  attachmentName?: string;
  attachmentType?: string;
  attachmentSize?: number;
}

// `API_BASE_URL` ends with `/api/v1`. Static `/uploads` is served from the
// root, so we drop the API suffix to build absolute file URLs.
const FILE_HOST = API_BASE_URL.replace(/\/api\/v1\/?$/, '');

export function resolveAttachmentUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${FILE_HOST}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
}

export async function listConversations(): Promise<Conversation[]> {
  const { data } = await api.get<{ items: Conversation[] }>('/messages');
  return data.items;
}

export async function listThread(otherUserId: string): Promise<MessageItem[]> {
  const { data } = await api.get<{ items: MessageItem[] }>(`/messages/${otherUserId}`);
  return data.items;
}

export async function sendMessage(input: SendMessageInput): Promise<MessageItem> {
  const { data } = await api.post<MessageItem>('/messages', input);
  return data;
}

export async function clearConversations(): Promise<{ deleted: number }> {
  const { data } = await api.delete<{ deleted: number }>('/messages');
  return data;
}

export async function clearThread(otherUserId: string): Promise<{ deleted: number }> {
  const { data } = await api.delete<{ deleted: number }>(`/messages/${otherUserId}`);
  return data;
}

export async function markAllAsRead(): Promise<{ updated: number }> {
  const { data } = await api.post<{ updated: number }>('/messages/read-all');
  return data;
}

export async function uploadAttachment(file: {
  uri: string;
  name: string;
  type: string;
}): Promise<UploadedAttachment> {
  const form = new FormData();
  // React Native's FormData accepts the `{ uri, name, type }` blob shape.
  form.append('file', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
  const { data } = await api.post<UploadedAttachment>('/messages/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
