import {
  buildPixResponse,
  confirmPayment,
  confirmPaymentByExternalId,
  createPaymentForBooking,
  getPaymentByBooking,
} from '../services/payments.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const create = asyncHandler(async (req, res) => {
  const payment = await createPaymentForBooking(req.user!.sub, req.body);
  const pix = payment.method === 'pix' ? await buildPixResponse(payment) : undefined;
  res.status(HttpStatus.CREATED).json({ payment, pix });
});

export const confirm = asyncHandler(async (req, res) => {
  const payment = await confirmPayment(req.user!.sub, req.params.bookingId);
  res.json({ payment });
});

export const getByBooking = asyncHandler(async (req, res) => {
  const payment = await getPaymentByBooking(req.user!.sub, req.params.bookingId);
  res.json({ payment });
});

/** Eventos do Asaas que significam "pago". */
const PAID_EVENTS = new Set(['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED']);

/**
 * Webhook do Asaas — a fonte da verdade da confirmação de pagamento quando o gateway está
 * ligado. Não usa JWT (é o Asaas quem chama): a origem é validada pelo token que ele envia
 * no header `asaas-access-token`. Responde 200 mesmo para eventos que não nos interessam,
 * para o Asaas não ficar reenviando.
 */
export const webhook = asyncHandler(async (req, res) => {
  const token = req.header('asaas-access-token');
  if (env.ASAAS_WEBHOOK_TOKEN && token !== env.ASAAS_WEBHOOK_TOKEN) {
    res.status(HttpStatus.UNAUTHORIZED).end();
    return;
  }

  const event: unknown = req.body?.event;
  const asaasPaymentId: unknown = req.body?.payment?.id;
  if (typeof event === 'string' && typeof asaasPaymentId === 'string' && PAID_EVENTS.has(event)) {
    const found = await confirmPaymentByExternalId(asaasPaymentId);
    logger.info({ event, asaasPaymentId, found }, 'asaas webhook processado');
  }

  res.status(HttpStatus.OK).json({ received: true });
});
