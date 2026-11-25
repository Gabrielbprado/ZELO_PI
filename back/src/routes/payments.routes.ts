import { Router } from 'express';
import { Role } from '@prisma/client';
import * as ctrl from '../controllers/payments.controller';
import { authenticate, requireRole } from '../middleware/auth';
import { webhookLimiter } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { bookingIdParam, paymentCreateSchema } from '../validators/payments';

const router = Router();

// Webhook do Asaas — ANTES do authenticate: quem chama é o gateway, não um usuário. A
// origem é validada pelo token no header `asaas-access-token`, dentro do controller.
router.post('/webhook/asaas', webhookLimiter, ctrl.webhook);
// Qualquer OUTRO verb neste path responde 405. Sem este catch-all, GET/PUT/DELETE cairiam
// no `authenticate` abaixo e vazariam a existência da rota via mensagem "Token de acesso
// ausente" — ruído operacional que confundia diagnóstico de problemas de integração.
router.all('/webhook/asaas', (_req, res) => {
  res.setHeader('Allow', 'POST');
  res.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST neste endpoint' } });
});

router.use(authenticate);

router.post('/',                                 validate(paymentCreateSchema),           ctrl.create);
router.post('/:bookingId/confirm',               validate({ params: bookingIdParam }),    ctrl.confirm);
router.post('/:bookingId/admin/force-confirm',   requireRole(Role.ADMIN), validate({ params: bookingIdParam }), ctrl.adminForceConfirm);
router.get ('/:bookingId/pix',                   validate({ params: bookingIdParam }),    ctrl.getPix);
router.get ('/:bookingId',                       validate({ params: bookingIdParam }),    ctrl.getByBooking);
router.get ('/installments',                     validate({ query: z.object({ amount: z.coerce.number().positive() }) }), ctrl.getInstallments);

export default router;
