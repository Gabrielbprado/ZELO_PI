import { api } from './client';

export type ReportReason = 'INAPPROPRIATE' | 'FRAUD' | 'NO_SHOW' | 'SAFETY' | 'OTHER';
export type ReportTargetType = 'USER' | 'SERVICE' | 'CONVERSATION';
export type ReportStatus = 'OPEN' | 'REVIEWING' | 'AWAITING_INFO' | 'RESOLVED' | 'DISMISSED';
export type ModerationCategory =
  | 'FRAUD' | 'SPAM' | 'INAPPROPRIATE' | 'HARASSMENT' | 'SAFETY' | 'OFF_PLATFORM' | 'NONE';
export type ModerationSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ModerationActionType =
  | 'AI_CLASSIFIED' | 'ACCEPT' | 'REJECT' | 'REQUEST_INFO' | 'WARN' | 'SUSPEND' | 'BLOCK' | 'UNBLOCK';

export interface AiSignal {
  code: string;
  weight: number;
  detail?: string | null;
}

export interface Report {
  id: string;
  reporterId: string;
  targetUserId: string;
  targetType: ReportTargetType;
  targetRefId: string | null;
  bookingId: string | null;
  reason: ReportReason;
  description: string | null;
  evidence: string[];
  status: ReportStatus;
  createdAt: string;
  // Nulos = ainda não triada pela IA (serviço fora do ar). NÃO significa "sem problema".
  aiCategory: ModerationCategory | null;
  aiSeverity: ModerationSeverity | null;
  aiPriority: number | null;
  aiConfidence: number | null;
  aiAction: Exclude<ModerationActionType, 'AI_CLASSIFIED'> | null;
  aiSignals: AiSignal[] | null;
  aiModelVersion: string | null;
  aiAnalyzedAt: string | null;
}

export interface ModerationAction {
  id: string;
  reportId: string | null;
  targetUserId: string;
  /** `null` = a própria IA. */
  actorId: string | null;
  type: ModerationActionType;
  reason: string | null;
  metadata?: Record<string, unknown> | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface ReportDetail extends Report {
  actions: ModerationAction[];
  targetHistory: ModerationAction[];
}

export interface CreateReportInput {
  targetType?: ReportTargetType;
  targetUserId?: string;
  serviceId?: string;
  reason: ReportReason;
  description?: string;
  bookingId?: string;
  evidence?: string[];
}

export async function createReport(input: CreateReportInput): Promise<Report> {
  const { data } = await api.post<Report>('/reports', input);
  return data;
}

// ─── Admin ───────────────────────────────────────────────────────────────────

export async function listReports(status?: ReportStatus): Promise<Report[]> {
  const { data } = await api.get<{ items: Report[] }>('/admin/reports', { params: status ? { status } : undefined });
  return data.items;
}

export async function getReport(id: string): Promise<ReportDetail> {
  const { data } = await api.get<ReportDetail>(`/admin/reports/${id}`);
  return data;
}

export async function reanalyze(id: string): Promise<Report> {
  const { data } = await api.post<Report>(`/admin/reports/${id}/reanalyze`);
  return data;
}

export async function moderate(
  id: string,
  body: { action: Exclude<ModerationActionType, 'AI_CLASSIFIED'>; reason?: string; days?: number },
): Promise<ModerationAction> {
  const { data } = await api.post<ModerationAction>(`/admin/reports/${id}/action`, body);
  return data;
}
