import { api } from './client';

export type ReportReason = 'INAPPROPRIATE' | 'FRAUD' | 'NO_SHOW' | 'SAFETY' | 'OTHER';

export async function createReport(input: {
  targetUserId: string;
  reason: ReportReason;
  description?: string;
  bookingId?: string;
}): Promise<{ id: string }> {
  const { data } = await api.post<{ id: string }>('/reports', input);
  return data;
}
