import { Router } from 'express';
import * as ctrl from '../controllers/providers.controller';
import * as self from '../controllers/providerSelf.controller';
import { validate } from '../middleware/validate';
import { proListQuery, uuidParam } from '../validators/common';
import { authenticate, requireRole } from '../middleware/auth';
import {
  profileUpdateSchema,
  serviceCreateSchema,
  serviceUpdateSchema,
} from '../validators/providerSelf';

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

// Public detail — kept after /me routes
router.get('/:id', validate({ params: uuidParam }), ctrl.getById);

export default router;
