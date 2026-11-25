import { Router } from 'express';
import * as ctrl from '../controllers/users.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  pushTokenSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/auth';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

router.patch ('/me',                 authenticate, validate(updateProfileSchema),  ctrl.updateMe);
router.post  ('/me/change-password', authenticate, validate(changePasswordSchema), ctrl.changeMyPassword);
router.post  ('/me/push-token',      authenticate, validate(pushTokenSchema),      ctrl.upsertPushToken);
router.delete('/me/push-token',      authenticate,                                 ctrl.deletePushToken);
router.post  ('/forgot-password',    authLimiter,  validate(forgotPasswordSchema), ctrl.forgotPassword);
router.post  ('/reset-password',     authLimiter,  validate(resetPasswordSchema),  ctrl.resetPassword);

export default router;
