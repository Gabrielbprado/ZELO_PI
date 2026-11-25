import { Router } from 'express';
import * as ctrl from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { loginSchema, refreshSchema, registerSchema, logoutSchema } from '../validators/auth';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';

const router = Router();

router.post('/register', authLimiter, validate(registerSchema), ctrl.register);
router.post('/login',    authLimiter, validate(loginSchema),    ctrl.login);
router.post('/refresh',  validate(refreshSchema),               ctrl.refresh);
router.post('/logout',   validate(logoutSchema),                ctrl.logout);
router.get ('/me',       authenticate,                          ctrl.me);

export default router;
