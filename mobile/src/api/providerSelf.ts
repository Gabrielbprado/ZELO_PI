import { api } from './client';
import type { Provider, ProviderService, Category } from '../types';

export interface ProviderMe {
  id: string;
  userId: string;
  bio: string | null;
  yearsExp: number;
  jobsDone: number;
  ratingAvg: number;
  ratingCount: number;
  kycStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
  available: boolean;
  priceFrom: number;
  latitude: number | null;
  longitude: number | null;
  services: ProviderService[];
  categories: { categoryId: string; category: Category }[];
}

export async function getMyProvider(): Promise<ProviderMe> {
  const { data } = await api.get<ProviderMe>('/providers/me');
  return data;
}

export async function updateMyProvider(input: Partial<{
  bio: string;
  yearsExp: number;
  priceFrom: number;
  available: boolean;
  categoryIds: string[];
}>): Promise<ProviderMe> {
  const { data } = await api.patch<ProviderMe>('/providers/me', input);
  return data;
}

export async function createMyService(input: {
  title: string;
  description?: string;
  categoryId: string;
  priceMin: number;
  priceMax?: number;
  unit?: string;
}): Promise<ProviderService> {
  const { data } = await api.post<ProviderService>('/providers/me/services', input);
  return data;
}

export async function updateMyService(id: string, input: Partial<{
  title: string;
  description: string;
  categoryId: string;
  priceMin: number;
  priceMax: number;
  unit: string;
}>): Promise<ProviderService> {
  const { data } = await api.patch<ProviderService>(`/providers/me/services/${id}`, input);
  return data;
}

export async function deleteMyService(id: string): Promise<void> {
  await api.delete(`/providers/me/services/${id}`);
}

// Re-export so consumers can import via providerSelf
export type { Provider, ProviderService };
