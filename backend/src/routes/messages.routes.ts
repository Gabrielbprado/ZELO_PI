import { Router } from 'express';
import * as ctrl from '../controllers/messages.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { messageSchema, uuidParam } from '../validators/common';

const router = Router();
router.use(authenticate);

router.get('/', ctrl.conversations);
router.delete('/', ctrl.clear);
router.post('/read-all', ctrl.readAll);
router.get('/:id', validate({ params: uuidParam }), ctrl.thread);
router.post('/', validate(messageSchema), ctrl.send);

export default router;
