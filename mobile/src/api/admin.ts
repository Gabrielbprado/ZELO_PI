import { api } from './client';

export interface AdminOverview {
  users: number;
  providers: number;
  verifiedProviders: number;
  bookings: { total: number; byStatus: Record<string, number> };
  gmv: number; // reais
  paidCount: number;
  avgTicket: number; // reais
  commissionCents: number;
  payoutsPaidCents: number;
  computedAt: string;
}

export interface Funnel {
  stages: { key: string; label: string; count: number }[];
  rates: { acceptedFromRequested: number; completedFromAccepted: number; paidFromCompleted: number };
  computedAt: string;
}

export async function getOverview(): Promise<AdminOverview> {
  const { data } = await api.get<AdminOverview>('/admin/metrics/overview');
  return data;
}

export async function getFunnel(): Promise<Funnel> {
  const { data } = await api.get<Funnel>('/admin/metrics/funnel');
  return data;
}
