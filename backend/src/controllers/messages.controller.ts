import {
  clearConversations,
  clearThread,
  listConversations,
  listThread,
  markAllAsRead,
  markAsRead,
  sendMessage,
} from '../services/messages.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';
import { BadRequestError } from '../errors';

export const send = asyncHandler(async (req, res) => {
  const message = await sendMessage(req.user!.sub, req.body);
  res.status(HttpStatus.CREATED).json(message);
});

export const conversations = asyncHandler(async (req, res) => {
  const items = await listConversations(req.user!.sub);
  res.json({ items });
});

export const thread = asyncHandler(async (req, res) => {
  const items = await listThread(req.user!.sub, req.params.id);
  await markAsRead(req.user!.sub, req.params.id);
  res.json({ items });
});

export const clear = asyncHandler(async (req, res) => {
  const result = await clearConversations(req.user!.sub);
  res.json(result);
});

export const readAll = asyncHandler(async (req, res) => {
  const result = await markAllAsRead(req.user!.sub);
  res.json(result);
});

export const clearOne = asyncHandler(async (req, res) => {
  const result = await clearThread(req.user!.sub, req.params.id);
  res.json(result);
});

export const uploadAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw new BadRequestError('Arquivo ausente');
  const publicUrl = `/uploads/attachments/${req.file.filename}`;
  res.status(HttpStatus.CREATED).json({
    url: publicUrl,
    name: req.file.originalname,
    type: req.file.mimetype,
    size: req.file.size,
  });
});
