import {
  createBooking,
  getBookingById,
  listUserBookings,
  updateBookingPrice,
  updateBookingStatus,
} from '../services/bookings.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

export const create = asyncHandler(async (req, res) => {
  const booking = await createBooking({ ...req.body, clientId: req.user!.sub });
  res.status(HttpStatus.CREATED).json(booking);
});

export const mine = asyncHandler(async (req, res) => {
  const items = await listUserBookings(req.user!.sub, req.user!.role);
  res.json({ items });
});

export const getById = asyncHandler(async (req, res) => {
  const item = await getBookingById(req.params.id, req.user!.sub, req.user!.role);
  res.json(item);
});

export const updateStatus = asyncHandler(async (req, res) => {
  const item = await updateBookingStatus(
    req.params.id,
    req.user!.sub,
    req.user!.role,
    req.body.status,
    req.body.priceFinal,
  );
  res.json(item);
});

export const updatePrice = asyncHandler(async (req, res) => {
  const item = await updateBookingPrice(
    req.params.id,
    req.user!.sub,
    req.user!.role,
    req.body.priceFinal,
  );
  res.json(item);
});
