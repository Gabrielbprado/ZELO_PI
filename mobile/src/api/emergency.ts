import { api } from './client';
import type { Category } from '../types';

export interface EmergencyMatch {
  provider: {
    id: string;
    userId: string;
    name: string;
    avatarHue: number;
    neighborhood?: string | null;
    rating: number;
    jobsDone: number;
    priceFrom: number;
    categories: Category[];
    verified: boolean;
  };
  etaMin: number;
  distanceKm: number;
  nearbyCount: number;
}

export async function matchEmergency(input: { categoryId: string; city?: string; neighborhood?: string }): Promise<EmergencyMatch> {
  const { data } = await api.post<EmergencyMatch>('/emergency/match', input);
  return data;
}
