import { findEmergencyMatch } from '../services/emergency.service';
import { prisma } from '../config/prisma';
import { asyncHandler } from '../utils/asyncHandler';

export const match = asyncHandler(async (req, res) => {
  let { city, neighborhood } = req.body as { city?: string; neighborhood?: string };

  if (!city || !neighborhood) {
    const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
    city = city ?? user?.city ?? undefined;
    neighborhood = neighborhood ?? user?.neighborhood ?? undefined;
  }

  const result = await findEmergencyMatch({
    categoryId: req.body.categoryId,
    city,
    neighborhood,
  });
  res.json(result);
});
