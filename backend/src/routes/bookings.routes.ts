import { Router } from 'express';
import * as ctrl from '../controllers/bookings.controller';
import * as travel from '../controllers/bookingTravel.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { bookingCreateSchema, bookingUpdatePrice, bookingUpdateStatus, uuidParam } from '../validators/common';

const router = Router();
router.use(authenticate);

router.get('/mine', ctrl.mine);
router.post('/', validate(bookingCreateSchema), ctrl.create);
router.get('/:id', validate({ params: uuidParam }), ctrl.getById);
router.patch('/:id/status', validate(bookingUpdateStatus), ctrl.updateStatus);
router.patch('/:id/price', validate(bookingUpdatePrice), ctrl.updatePrice);

// Rastreamento em tempo real (sessão de deslocamento)
router.post('/:id/travel/start', validate({ params: uuidParam }), travel.start);
router.post('/:id/travel/arrived', validate({ params: uuidParam }), travel.arrived);
router.post('/:id/travel/cancel', validate({ params: uuidParam }), travel.cancel);
router.post('/:id/travel/location', validate({ params: uuidParam, ...travel.locationSchema }), travel.update);
router.get('/:id/travel/location', validate({ params: uuidParam }), travel.current);

export default router;
