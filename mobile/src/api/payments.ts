import { AxiosError } from 'axios';
import { api } from './client';

export interface Payment {
  id: string;
  bookingId: string;
  amount: number;
  currency: string;
  method: string;
  status: 'PENDING' | 'AUTHORIZED' | 'PAID' | 'REFUNDED' | 'FAILED';
  externalId?: string | null;
  installments?: number;
  installmentAmount?: number;
  totalAmount?: number;
}

export interface PixInfo {
  qrCode: string;
  qrCopyPaste: string;
  expiresInSec: number;
  amount: number;
  currency: string;
}

export type PaymentMethod = 'pix' | 'cash' | 'credit_card' | 'debit_card';

export interface CardInput {
  holderName: string;
  number: string;
  expiryMonth: string;
  expiryYear: string;
  ccv: string;
}

export interface CardHolderInfoInput {
  postalCode: string;
  addressNumber: string;
  phone: string;
}

export interface InstallmentOption {
  installments: number;
  installmentAmount: number;
  totalAmount: number;
  interestRate: number;
  hasInterest: boolean;
}

export interface CreatePaymentInput {
  bookingId: string;
  method: PaymentMethod;
  installments?: number;
  card?: CardInput;
  cardHolderInfo?: CardHolderInfoInput;
}

export interface CreatePaymentResult {
  payment: Payment;
  pix?: PixInfo;
  installments?: number;
  installmentAmount?: number;
  totalAmount?: number;
}

export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const { data } = await api.post<CreatePaymentResult>('/payments', input);
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

export async function getPixForBooking(bookingId: string): Promise<PixInfo | null> {
  try {
    const { data } = await api.get<{ pix: PixInfo }>(`/payments/${bookingId}/pix`);
    return data.pix ?? null;
  } catch (err) {
    if (err instanceof AxiosError && err.response?.status === 404) return null;
    throw err;
  }
}

export async function getInstallmentOptions(amount: number): Promise<InstallmentOption[]> {
  const { data } = await api.get<{ options: InstallmentOption[] }>(`/payments/installments`, {
    params: { amount }
  });
  return data.options;
}
