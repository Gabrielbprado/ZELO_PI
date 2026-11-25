import {
  authenticateUser,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
} from '../services/auth.service';
import { prisma } from '../config/prisma';
import { publicUserSelect } from '../selectors';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

interface RequestMetaSource {
  ip?: string;
  headers: { 'user-agent'?: string };
}

function requestMeta(req: RequestMetaSource): { ip?: string; ua?: string } {
  return { ip: req.ip, ua: req.headers['user-agent'] };
}

export const register = asyncHandler(async (req, res) => {
  const user = await registerUser(req.body);
  res.status(HttpStatus.CREATED).json({ user });
});

export const login = asyncHandler(async (req, res) => {
  const tokens = await authenticateUser(req.body.email, req.body.password, requestMeta(req));
  const user = await prisma.user.findUnique({
    where: { email: req.body.email },
    select: publicUserSelect,
  });
  res.json({ ...tokens, user });
});

export const refresh = asyncHandler(async (req, res) => {
  const tokens = await rotateRefreshToken(req.body.refreshToken, requestMeta(req));
  res.json(tokens);
});

export const logout = asyncHandler(async (req, res) => {
  await revokeRefreshToken(req.body.refreshToken);
  res.status(HttpStatus.NO_CONTENT).end();
});

export const me = asyncHandler(async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.sub },
    select: { ...publicUserSelect, providerProfile: true },
  });
  res.json({ user });
});
