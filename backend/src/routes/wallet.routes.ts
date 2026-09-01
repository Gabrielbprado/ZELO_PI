import { Router } from 'express';
import * as ctrl from '../controllers/wallet.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { payoutSchema, statementQuery } from '../validators/wallet';

/** Carteira do profissional: só faz sentido para quem recebe pagamentos. */
const router = Router();
router.use(authenticate, requireRole('PROVIDER'));

router.get ('/me',            ctrl.getMine);
router.get ('/me/statement',  validate(statementQuery), ctrl.statement);
router.get ('/me/payouts',    ctrl.listPayouts);
router.post('/me/payouts',    validate(payoutSchema),   ctrl.requestPayout);

export default router;
