import { api } from './client';

export interface Wallet {
  balanceCents: number;
  pendingCents: number;
}

export type LedgerCategory = 'ESCROW_HOLD' | 'PLATFORM_FEE' | 'PAYOUT' | 'REFUND';

export interface LedgerEntry {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  category: LedgerCategory;
  amountCents: number;
  description?: string | null;
  createdAt: string;
}

export interface Payout {
  id: string;
  amountCents: number;
  status: 'REQUESTED' | 'PROCESSING' | 'PAID' | 'FAILED';
  pixKey: string;
  createdAt: string;
  processedAt?: string | null;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export async function getWallet(): Promise<Wallet> {
  const { data } = await api.get<Wallet>('/wallet/me');
  return data;
}

export async function getStatement(cursor?: string): Promise<{ items: LedgerEntry[]; nextCursor: string | null }> {
  const { data } = await api.get<{ items: LedgerEntry[]; nextCursor: string | null }>('/wallet/me/statement', {
    params: cursor ? { cursor } : {},
  });
  return data;
}

export async function listPayouts(): Promise<Payout[]> {
  const { data } = await api.get<{ items: Payout[] }>('/wallet/me/payouts');
  return data.items;
}

export async function requestPayout(input: { amountCents: number; pixKey: string }): Promise<Payout> {
  const { data } = await api.post<Payout>('/wallet/me/payouts', input);
  return data;
}
