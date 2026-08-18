import { api } from './client';
import type { ForYouResponse, RecEventInput } from '../types';

export async function getForYou(params: {
  categoryId?: string;
  limit?: number;
  lat?: number;
  lng?: number;
} = {}): Promise<ForYouResponse> {
  const { data } = await api.get<ForYouResponse>('/recommendations/for-you', { params });
  return data;
}

/**
 * Envia impressões e cliques do carrossel.
 *
 * Deliberadamente "dispara e esquece": telemetria nunca pode virar um erro na
 * tela do usuário nem atrasar uma navegação. O `.catch` vazio é intencional —
 * perder um evento é irrelevante; travar a UI por causa dele não é.
 */
export function trackRecEvents(requestId: string, events: RecEventInput[]): void {
  if (events.length === 0) return;
  void api.post('/recommendations/events', { requestId, events }).catch(() => {});
}
