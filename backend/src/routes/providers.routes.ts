import { Router } from 'express';
import * as ctrl from '../controllers/providers.controller';
import * as self from '../controllers/providerSelf.controller';
import * as avail from '../controllers/availability.controller';
import { validate } from '../middleware/validate';
import { proListQuery, uuidParam } from '../validators/common';
import { authenticate, requireRole } from '../middleware/auth';
import {
  profileUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from '../validators/providerSelf';
import { setAvailabilitySchema, slotsSchema, timeOffSchema } from '../validators/availability';
import * as trust from '../controllers/trust.controller';
import { documentSchema } from '../validators/trust';
import { getMyMetrics } from '../services/providerMetrics.service';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Public endpoints
router.get('/categories', ctrl.listCategories);
router.get('/',           validate({ query: proListQuery }), ctrl.list);

// Provider self-management — must come before the /:id wildcard so "me" isn't captured
router.get   ('/me',              authenticate, requireRole('PROVIDER'),                                     self.getMe);
router.patch ('/me',              authenticate, requireRole('PROVIDER'), validate(profileUpdateSchema),      self.updateMe);
router.post  ('/me/services',     authenticate, requireRole('PROVIDER'), validate(serviceCreateSchema),      self.addService);
router.patch ('/me/services/:id', authenticate, requireRole('PROVIDER'), validate(serviceUpdateSchema),      self.editService);
router.delete('/me/services/:id', authenticate, requireRole('PROVIDER'), validate({ params: uuidParam }),    self.removeService);

// Agenda e disponibilidade do profissional
router.get   ('/me/availability', authenticate, requireRole('PROVIDER'),                                   avail.getMine);
router.put   ('/me/availability', authenticate, requireRole('PROVIDER'), validate(setAvailabilitySchema),  avail.setMine);
router.get   ('/me/time-off',     authenticate, requireRole('PROVIDER'),                                   avail.listTimeOff);
router.post  ('/me/time-off',     authenticate, requireRole('PROVIDER'), validate(timeOffSchema),          avail.addTimeOff);
router.delete('/me/time-off/:id', authenticate, requireRole('PROVIDER'), validate({ params: uuidParam }),  avail.removeTimeOff);

// Verificação de documentos (KYC) do profissional
router.post('/me/documents', authenticate, requireRole('PROVIDER'), validate(documentSchema), trust.submitDocument);
router.get ('/me/documents', authenticate, requireRole('PROVIDER'),                            trust.listMyDocuments);

// Métricas do próprio profissional (dashboard)
router.get('/me/metrics', authenticate, requireRole('PROVIDER'), asyncHandler(async (req, res) => {
  res.json(await getMyMetrics(req.user!.sub));
}));

// Público: horários livres numa data. Antes do /:id para não ser capturado por ele.
router.get('/:id/slots', validate(slotsSchema), avail.slots);

// Public detail — kept after /me routes
router.get('/:id', validate({ params: uuidParam }), ctrl.getById);

export default router;
