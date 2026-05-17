import { estimateBudget } from '../services/budget.service';
import { asyncHandler } from '../utils/asyncHandler';

export const estimate = asyncHandler(async (req, res) => {
  const result = await estimateBudget(req.user?.sub, req.body.categoryId, req.body.answers);
  res.json(result);
});
