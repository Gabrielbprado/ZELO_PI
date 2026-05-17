import {
  createService,
  deleteService,
  getMyProviderProfile,
  updateMyProviderProfile,
  updateService,
} from '../services/providerSelf.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

export const getMe = asyncHandler(async (req, res) => {
  const profile = await getMyProviderProfile(req.user!.sub);
  res.json(profile);
});

export const updateMe = asyncHandler(async (req, res) => {
  const profile = await updateMyProviderProfile(req.user!.sub, req.body);
  res.json(profile);
});

export const addService = asyncHandler(async (req, res) => {
  const service = await createService(req.user!.sub, req.body);
  res.status(HttpStatus.CREATED).json(service);
});

export const editService = asyncHandler(async (req, res) => {
  const service = await updateService(req.user!.sub, req.params.id, req.body);
  res.json(service);
});

export const removeService = asyncHandler(async (req, res) => {
  await deleteService(req.user!.sub, req.params.id);
  res.status(HttpStatus.NO_CONTENT).end();
});
