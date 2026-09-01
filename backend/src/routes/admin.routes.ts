import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { asyncHandler } from '../utils/asyncHandler';
import { getAdminOverview, getFunnel } from '../services/adminMetrics.service';
import * as trust from '../controllers/trust.controller';
import { rejectSchema, reportListQuery, reportStatusSchema } from '../validators/trust';
import { uuidParam } from '../validators/common';

/**
 * Rotas administrativas (API). Sempre atrás de `authenticate` + `requireRole('ADMIN')`.
 * A UI de filas (Bull Board) é montada à parte, em /admin/queues, com Basic auth.
 */
const router = Router();
router.use(authenticate, requireRole('ADMIN'));

// Visão geral do painel: lê pelo cache (reaquecido por um job a cada 5 min).
router.get('/metrics/overview', asyncHandler(async (_req, res) => {
  res.json(await getAdminOverview());
}));

// Funil de conversão: solicitados → aceitos → concluídos → pagos.
router.get('/metrics/funnel', asyncHandler(async (_req, res) => {
  res.json(await getFunnel());
}));

// Moderação de KYC
router.get ('/kyc/pending',      trust.listPendingKyc);
router.post('/kyc/:id/approve',  validate({ params: uuidParam }), trust.approveKyc);
router.post('/kyc/:id/reject',   validate(rejectSchema),          trust.rejectKyc);

// Moderação de denúncias
router.get  ('/reports',      validate(reportListQuery),   trust.listReports);
router.patch('/reports/:id',  validate(reportStatusSchema), trust.updateReport);

export default router;
