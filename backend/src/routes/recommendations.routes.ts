import { Router } from 'express';
import * as ctrl from '../controllers/recommendations.controller';
import { authenticate } from '../middleware/auth';
import { telemetryLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { forYouQuery, recEventsSchema } from '../validators/recommendations';

const router = Router();

// Personalização exige identidade — não há recomendação anônima.
router.get('/for-you', authenticate, validate({ query: forYouQuery }), ctrl.forYou);

router.post('/events', authenticate, telemetryLimiter, validate(recEventsSchema), ctrl.trackRecEvents);

export default router;
