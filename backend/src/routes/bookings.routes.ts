import { Router } from 'express';
import * as ctrl from '../controllers/bookings.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { bookingCreateSchema, bookingUpdateStatus, uuidParam } from '../validators/common';

const router = Router();
router.use(authenticate);

router.get('/mine', ctrl.mine);
router.post('/', validate(bookingCreateSchema), ctrl.create);
router.get('/:id', validate({ params: uuidParam }), ctrl.getById);
router.patch('/:id/status', validate(bookingUpdateStatus), ctrl.updateStatus);

export default router;
