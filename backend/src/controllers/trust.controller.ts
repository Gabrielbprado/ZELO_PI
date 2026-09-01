import * as kyc from '../services/kyc.service';
import * as reports from '../services/reports.service';
import { asyncHandler } from '../utils/asyncHandler';
import { HttpStatus } from '../constants/http';
import type { ReportStatus } from '@prisma/client';

// ─── KYC (profissional) ──────────────────────────────────────────────────────
export const submitDocument = asyncHandler(async (req, res) => {
  res.status(HttpStatus.CREATED).json(await kyc.submitDocument(req.user!.sub, req.body));
});

export const listMyDocuments = asyncHandler(async (req, res) => {
  res.json({ items: await kyc.listMyDocuments(req.user!.sub) });
});

// ─── KYC (admin) ─────────────────────────────────────────────────────────────
export const listPendingKyc = asyncHandler(async (_req, res) => {
  res.json({ items: await kyc.listPendingDocuments() });
});

export const approveKyc = asyncHandler(async (req, res) => {
  res.json(await kyc.approveDocument(req.user!.sub, req.params.id));
});

export const rejectKyc = asyncHandler(async (req, res) => {
  res.json(await kyc.rejectDocument(req.user!.sub, req.params.id, req.body.reason));
});

// ─── Denúncias ───────────────────────────────────────────────────────────────
export const createReport = asyncHandler(async (req, res) => {
  res.status(HttpStatus.CREATED).json(await reports.createReport(req.user!.sub, req.body));
});

export const listReports = asyncHandler(async (req, res) => {
  res.json({ items: await reports.listReports(req.query.status as ReportStatus | undefined) });
});

export const updateReport = asyncHandler(async (req, res) => {
  res.json(await reports.updateReportStatus(req.user!.sub, req.params.id, req.body.status));
});
