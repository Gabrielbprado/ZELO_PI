import { Router } from 'express';
import * as ctrl from '../controllers/budget.controller';
import { optionalAuth } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { budgetSchema } from '../validators/common';

const router = Router();

router.post('/estimate', optionalAuth, validate(budgetSchema), ctrl.estimate);

export default router;
