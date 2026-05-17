import { Router } from 'express';
import * as ctrl from '../controllers/emergency.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { emergencyMatchSchema } from '../validators/emergency';

const router = Router();
router.use(authenticate);

router.post('/match', validate(emergencyMatchSchema), ctrl.match);

export default router;
