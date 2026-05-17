import { Router } from 'express';
import * as ctrl from '../controllers/payments.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { bookingIdParam, paymentCreateSchema } from '../validators/payments';

const router = Router();
router.use(authenticate);

router.post('/',                   validate(paymentCreateSchema),           ctrl.create);
router.post('/:bookingId/confirm', validate({ params: bookingIdParam }),    ctrl.confirm);
router.get ('/:bookingId',         validate({ params: bookingIdParam }),    ctrl.getByBooking);

export default router;
