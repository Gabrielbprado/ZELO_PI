import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';
import {
  startTravel,
  arrivedTravel,
  cancelTravel,
  recordLocation,
  getCurrentLocation,
} from '../services/bookingTravel.service';

/**
 * Endpoints de ciclo de vida da sessão de deslocamento. Não logam coordenadas —
 * delegam tudo ao service, que cuida de validação, Redis e emissão de evento.
 *
 * Códigos HTTP:
 *   201 CREATED  — sessão iniciada
 *   200 OK       — operação idempotente bem-sucedida
 *   204 NO CONTENT — update aceito (socket é o canal preferido; REST é fallback)
 *   410 GONE     — sessão já encerrada
 *   503          — Redis indisponível (não dá para persistir ou ler posição)
 */

export const start = asyncHandler(async (req, res) => {
  const session = await startTravel(req.user!.sub, req.params.id);
  res.status(HttpStatus.CREATED).json({ session });
});

export const arrived = asyncHandler(async (req, res) => {
  const session = await arrivedTravel(req.user!.sub, req.params.id);
  res.json({ session });
});

export const cancel = asyncHandler(async (req, res) => {
  const session = await cancelTravel(req.user!.sub, req.params.id);
  res.json({ session });
});

export const locationSchema = {
  body: z.object({
    latitude: z.number().finite(),
    longitude: z.number().finite(),
    accuracy: z.number().finite().nullable().optional(),
    heading: z.number().finite().nullable().optional(),
    speed: z.number().finite().nullable().optional(),
    recordedAt: z.string().datetime(),
  }),
};

export const update = asyncHandler(async (req, res) => {
  const result = await recordLocation(req.user!.sub, req.params.id, req.body);
  if (result.accepted) {
    res.status(HttpStatus.NO_CONTENT).end();
    return;
  }
  // Traduz motivos em HTTP. `inactive` e `wrong_provider` viram 410 para indicar
  // "não existe sessão aqui" — não vazamos a diferença. `invalid_coord` é 400.
  // `redis_down` é 503.
  switch (result.reason) {
    case 'invalid_coord':
      res.status(HttpStatus.BAD_REQUEST).json({ error: { code: 'VALIDATION_ERROR', message: 'Coordenada inválida' } });
      return;
    case 'redis_down':
      res.status(HttpStatus.SERVICE_UNAVAILABLE).json({
        error: { code: 'LOCATION_UNAVAILABLE', message: 'Posição não pode ser registrada no momento' },
      });
      return;
    default:
      res.status(HttpStatus.GONE).json({ error: { code: 'TRAVEL_INACTIVE', message: 'Sessão inativa' } });
      return;
  }
});

export const current = asyncHandler(async (req, res) => {
  const location = await getCurrentLocation(req.user!.sub, req.params.id);
  // 200 com null é válido: sessão ativa, ainda aguardando primeiro update.
  res.json({ location });
});
