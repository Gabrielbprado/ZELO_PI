import { api } from './client';

export interface TravelSession {
  id: string;
  bookingId: string;
  providerId: string;
  status: 'ACTIVE' | 'ARRIVED' | 'CANCELLED';
  startedAt: string;
  arrivedAt: string | null;
  endedAt: string | null;
  endReason: string | null;
}

export interface TravelLocationInput {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  heading?: number | null;
  speed?: number | null;
  recordedAt: string;
}

/** (Prestador) Abre a sessão de deslocamento. Idempotente enquanto estiver ACTIVE. */
export async function startTravel(bookingId: string): Promise<TravelSession> {
  const { data } = await api.post<{ session: TravelSession }>(`/bookings/${bookingId}/travel/start`);
  return data.session;
}

/** (Prestador) Marca chegada e encerra a sessão. */
export async function markArrived(bookingId: string): Promise<TravelSession> {
  const { data } = await api.post<{ session: TravelSession }>(`/bookings/${bookingId}/travel/arrived`);
  return data.session;
}

/** (Prestador) Cancela a sessão de deslocamento. */
export async function cancelTravel(bookingId: string): Promise<TravelSession> {
  const { data } = await api.post<{ session: TravelSession }>(`/bookings/${bookingId}/travel/cancel`);
  return data.session;
}

/** Fallback REST para publicar posição (usado quando o socket não está disponível). */
export async function postLocation(bookingId: string, input: TravelLocationInput): Promise<void> {
  await api.post(`/bookings/${bookingId}/travel/location`, input);
}
