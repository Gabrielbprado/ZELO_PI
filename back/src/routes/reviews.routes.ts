import { Router } from 'express';
import * as ctrl from '../controllers/reviews.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { reviewSchema, uuidParam } from '../validators/common';

const router = Router();

router.get('/provider/:id', validate({ params: uuidParam }), ctrl.byProvider);
router.post('/', authenticate, validate(reviewSchema), ctrl.create);

export default router;
