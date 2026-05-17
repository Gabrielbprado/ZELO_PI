import { Router } from 'express';
import * as ctrl from '../controllers/notifications.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { uuidParam } from '../validators/common';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.list);
router.post('/read-all', ctrl.markAllRead);
router.post('/:id/read', validate({ params: uuidParam }), ctrl.markRead);

export default router;
