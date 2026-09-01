import { Router } from 'express';
import * as trust from '../controllers/trust.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { reportCreateSchema } from '../validators/trust';

/** Qualquer usuário autenticado pode denunciar outro. A moderação é em /admin/reports. */
const router = Router();
router.use(authenticate);
router.post('/', validate(reportCreateSchema), trust.createReport);

export default router;
