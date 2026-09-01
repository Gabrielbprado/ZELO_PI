import * as svc from '../services/availability.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

export const getMine = asyncHandler(async (req, res) => {
  res.json({ rules: await svc.getMyAvailability(req.user!.sub) });
});

export const setMine = asyncHandler(async (req, res) => {
  res.json({ rules: await svc.setMyAvailability(req.user!.sub, req.body.rules) });
});

export const listTimeOff = asyncHandler(async (req, res) => {
  res.json({ items: await svc.listMyTimeOff(req.user!.sub) });
});

export const addTimeOff = asyncHandler(async (req, res) => {
  res.status(HttpStatus.CREATED).json(await svc.addMyTimeOff(req.user!.sub, req.body));
});

export const removeTimeOff = asyncHandler(async (req, res) => {
  await svc.removeMyTimeOff(req.user!.sub, req.params.id);
  res.status(HttpStatus.NO_CONTENT).end();
});

/** Público: horários livres do profissional numa data. */
export const slots = asyncHandler(async (req, res) => {
  res.json({ slots: await svc.computeSlots(req.params.id, String(req.query.date)) });
});
