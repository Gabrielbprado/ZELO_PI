import {
  changePassword,
  requestPasswordReset,
  resetPasswordWithToken,
  updateOwnProfile,
} from '../services/users.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';
import { isProd } from '../config/env';

export const updateMe = asyncHandler(async (req, res) => {
  const user = await updateOwnProfile(req.user!.sub, req.body);
  res.json({ user });
});

export const changeMyPassword = asyncHandler(async (req, res) => {
  await changePassword(req.user!.sub, req.body.currentPassword, req.body.newPassword);
  res.status(HttpStatus.NO_CONTENT).end();
});

/**
 * `/users/forgot-password` is intentionally lenient — it always responds with 202
 * regardless of whether the e-mail exists, so attackers can't enumerate accounts.
 * In non-production the dev token is also returned so the QA flow can be
 * exercised without a real e-mail provider.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
  const { token } = await requestPasswordReset(req.body.email);
  const body: { ok: true; devToken?: string | null } = { ok: true };
  if (!isProd) body.devToken = token;
  res.status(HttpStatus.ACCEPTED).json(body);
});

export const resetPassword = asyncHandler(async (req, res) => {
  await resetPasswordWithToken(req.body.token, req.body.newPassword);
  res.status(HttpStatus.NO_CONTENT).end();
});
