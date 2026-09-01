import { api } from './client';

export type DocType = 'CPF' | 'RG' | 'CNH' | 'ADDRESS_PROOF' | 'CERTIFICATE';

export interface ProviderDocument {
  id: string;
  type: DocType;
  fileKey: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejectionReason?: string | null;
  createdAt: string;
}

export async function submitDocument(input: { type: DocType; fileKey: string }): Promise<ProviderDocument> {
  const { data } = await api.post<ProviderDocument>('/providers/me/documents', input);
  return data;
}

export async function listMyDocuments(): Promise<ProviderDocument[]> {
  const { data } = await api.get<{ items: ProviderDocument[] }>('/providers/me/documents');
  return data.items;
}
