import { api } from './client';

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  currency: string;
  method: string;
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'REFUNDED' | 'FAILED';
  externalId?: string | null;
}

export interface PixInfo {
  qrCode: string;
  qrCopyPaste: string;
  expiresInSec: number;
  amount: number;
  currency: string;
}

export async function createPayment(input: { bookingId: string; method: 'pix' | 'card' }): Promise<{ payment: Payment; pix?: PixInfo }> {
  const { data } = await api.post<{ payment: Payment; pix?: PixInfo }>('/payments', input);
  return data;
}

export async function confirmPayment(bookingId: string): Promise<Payment> {
  const { data } = await api.post<{ payment: Payment }>(`/payments/${bookingId}/confirm`);
  return data.payment;
}

export async function getPaymentByBooking(bookingId: string): Promise<Payment | null> {
  const { data } = await api.get<{ payment: Payment | null }>(`/payments/${bookingId}`);
  return data.payment;
}
