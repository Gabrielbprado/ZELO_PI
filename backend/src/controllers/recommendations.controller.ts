import { asyncHandler } from '../utils/asyncHandler';
import { DEFAULT_REC_LIMIT } from '../constants/recommendations';
import { getForYou, trackEvents } from '../services/recommendations.service';
import { HttpStatus } from '../constants/http';

export const forYou = asyncHandler(async (req, res) => {
  const q = req.query as unknown as {
    categoryId?: string;
    limit?: number;
    lat?: number;
    lng?: number;
  };

  const result = await getForYou({
    userId: req.user!.sub,
    categoryId: q.categoryId,
    limit: q.limit ?? DEFAULT_REC_LIMIT,
    lat: q.lat,
    lng: q.lng,
  });

  res.json(result);
});

export const trackRecEvents = asyncHandler(async (req, res) => {
  const { requestId, events } = req.body as {
    requestId: string;
    events: Parameters<typeof trackEvents>[2];
  };

  await trackEvents(req.user!.sub, requestId, events);
  // 202 sem corpo: o app dispara isso sem esperar resposta, e nada no produto
  // depende do resultado.
  res.status(HttpStatus.ACCEPTED).end();
});
