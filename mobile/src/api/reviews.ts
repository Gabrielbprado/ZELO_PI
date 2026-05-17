import { api } from './client';
import type { Review } from '../types';

export async function createReview(input: { bookingId: string; rating: number; comment?: string }): Promise<Review> {
  const { data } = await api.post<Review>('/reviews', input);
  return data;
}
