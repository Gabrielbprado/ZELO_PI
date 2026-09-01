import { api } from './client';

export interface AvailabilityRule {
  weekday: number; // 0 = domingo … 6 = sábado
  startMinute: number;
  endMinute: number;
}

export interface Slot {
  startsAt: string;
  endsAt: string;
}

export interface TimeOff {
  id: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export async function getMyAvailability(): Promise<AvailabilityRule[]> {
  const { data } = await api.get<{ rules: AvailabilityRule[] }>('/providers/me/availability');
  return data.rules;
}

export async function setMyAvailability(rules: AvailabilityRule[]): Promise<AvailabilityRule[]> {
  const { data } = await api.put<{ rules: AvailabilityRule[] }>('/providers/me/availability', { rules });
  return data.rules;
}

export async function getSlots(providerId: string, date: string): Promise<Slot[]> {
  const { data } = await api.get<{ slots: Slot[] }>(`/providers/${providerId}/slots`, { params: { date } });
  return data.slots;
}

export async function listMyTimeOff(): Promise<TimeOff[]> {
  const { data } = await api.get<{ items: TimeOff[] }>('/providers/me/time-off');
  return data.items;
}

export async function addMyTimeOff(input: { startsAt: string; endsAt: string; reason?: string }): Promise<TimeOff> {
  const { data } = await api.post<TimeOff>('/providers/me/time-off', input);
  return data;
}

export async function removeMyTimeOff(id: string): Promise<void> {
  await api.delete(`/providers/me/time-off/${id}`);
}
