import { api } from './client';
import type { Booking, BookingStatus } from '../types';

export async function listMyBookings(): Promise<Booking[]> {
  const { data } = await api.get<{ items: Booking[] }>('/bookings/mine');
  return data.items;
}

export async function createBooking(input: {
  providerId: string;
  categoryId: string;
  title: string;
  description?: string;
  address: string;
  scheduledAt?: string;
  urgency?: 'EMERGENCY' | 'TODAY' | 'THIS_WEEK' | 'FLEXIBLE';
  priceEstimate?: number;
}): Promise<Booking> {
  const { data } = await api.post<Booking>('/bookings', input);
  return data;
}

export async function updateBookingStatus(
  id: string,
  status: Extract<BookingStatus, 'ACCEPTED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'>,
  priceFinal?: number,
): Promise<Booking> {
  const { data } = await api.patch<Booking>(`/bookings/${id}/status`, { status, priceFinal });
  return data;
}
