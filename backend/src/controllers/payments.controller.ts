import {
  buildPixPayload,
  confirmPayment,
  createPaymentForBooking,
  getPaymentByBooking,
} from '../services/payments.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

export const create = asyncHandler(async (req, res) => {
  const payment = await createPaymentForBooking(req.user!.sub, req.body);
  const pix =
    payment.method === 'pix'
      ? buildPixPayload(payment.amount, payment.externalId ?? payment.id)
      : undefined;
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
