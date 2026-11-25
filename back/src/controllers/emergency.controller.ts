import { findEmergencyMatch } from '../services/emergency.service';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../utils/asyncHandler';

export const match = asyncHandler(async (req, res) => {
  let { city, neighborhood } = req.body as { city?: string; neighborhood?: string };
  const { categoryId, lat, lng, radiusKm } = req.body as {
    categoryId: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
  };

  if (!city || !neighborhood) {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    city = city ?? user?.city ?? undefined;
    neighborhood = neighborhood ?? user?.neighborhood ?? undefined;
  }

  const result = await findEmergencyMatch({
    categoryId,
    city,
    neighborhood,
    lat,
    lng,
    radiusKm,
  });
  res.json(result);
});
