import { Router } from 'express';
import { authenticate, requireRole } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { getAdminOverview } from '../services/adminMetrics.service';

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

export default router;
