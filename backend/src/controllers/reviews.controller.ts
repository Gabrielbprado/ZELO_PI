import { createReview, listReviewsByProvider } from '../services/reviews.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

export const create = asyncHandler(async (req, res) => {
  const review = await createReview(req.user!.sub, req.body);
  res.status(HttpStatus.CREATED).json(review);
});

export const byProvider = asyncHandler(async (req, res) => {
  const items = await listReviewsByProvider(req.params.id);
  res.json({ items });
});
