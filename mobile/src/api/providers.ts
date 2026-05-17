import { api } from './client';
import type { Category, Provider, Review } from '../types';

export async function getCategories(): Promise<Category[]> {
  const { data } = await api.get<{ items: Category[] }>('/providers/categories');
  return data.items;
}

export async function listProviders(params: {
  category?: string;
  city?: string;
  q?: string;
  verified?: boolean;
  sort?: 'rating' | 'price' | 'distance';
  page?: number;
  perPage?: number;
} = {}): Promise<{ items: Provider[]; total: number }> {
  const { data } = await api.get('/providers', { params });
  return data;
}

export async function getProvider(id: string): Promise<Provider> {
  const { data } = await api.get<Provider>(`/providers/${id}`);
  return data;
}

export async function getProviderReviews(providerId: string): Promise<Review[]> {
  const { data } = await api.get<{ items: Review[] }>(`/reviews/provider/${providerId}`);
  return data.items;
}
