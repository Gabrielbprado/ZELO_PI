import * as wallet from '../services/wallet.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';

export const getMine = asyncHandler(async (req, res) => {
  res.json(await wallet.getWallet(req.user!.sub));
});

export const statement = asyncHandler(async (req, res) => {
  res.json(await wallet.getStatement(req.user!.sub, req.query.cursor as string | undefined));
});

export const listPayouts = asyncHandler(async (req, res) => {
  res.json({ items: await wallet.listPayouts(req.user!.sub) });
});

export const requestPayout = asyncHandler(async (req, res) => {
  res.status(HttpStatus.CREATED).json(await wallet.requestPayout(req.user!.sub, req.body));
});
