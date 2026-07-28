// src/lib/data-reviews.ts
// Pengkinian Data (periodic customer data review) — API helpers + display maps.
// Endpoints: GET/POST /applications/:id/data-review/{status,initiate,submit,decision}

import { apiFetch } from './api';

export type DataReviewDecision = 'APPROVED' | 'RETURN_FOR_REVISION' | 'REJECTED';

export type DataReviewDecisionPayload = { decision: DataReviewDecision; reason?: string };

export type DataReviewDueStatus =
  | 'NOT_DUE' | 'DUE_SOON' | 'DUE' | 'OVERDUE' | 'NEED_RISK_SCORE' | 'NO_SUBMITTED_DATE';

export type DataReviewListItem = {
  application_id: number;
  cif_no: string | null;
  customer_name: string | null;
  customer_type: 'INDIVIDUAL' | 'BUSINESS' | null;
  status: string | null;
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH' | null;
  first_submitted_at: string | null;
  due_at: string | null;
  review_period_years: number | null;
  due_status: DataReviewDueStatus | null;
  days_until_due: number | null;
  active_review: {
    id: number;
    review_no: string;
    review_type: 'PERIODIC' | 'MANUAL';
    status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'RETURNED_FOR_REVISION' | 'REJECTED';
    initiated_by: number | null;
    initiated_at: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    decision_notes: string | null;
  } | null;
};

export type DataReviewListParams = {
  q?: string;
  risk_level?: string;
  due_status?: string;
  review_status?: string;
  customer_type?: string;
  page?: number;
  limit?: number;
};

export type DataReviewListResponse = {
  data: DataReviewListItem[];
  total: number;
  page: number;
  limit: number;
};

export type DataReviewStatusResponse = {
  application_id: number | string;
  risk_level: string | null;
  base_submitted_at: string | null;
  due_at: string | null;
  is_due: boolean;
  status: string;
  active_review: { id: number | string; review_no: string; status: string } | null;
  last_review: {
    id: number | string;
    review_no: string;
    review_type: string;
    status: string;
    initiated_at: string | null;
    submitted_at: string | null;
    reviewed_at: string | null;
    decision_notes: string | null;
  } | null;
};

// Roles allowed to read the status endpoint (mirrors backend RolesGuard + admin bypass).
export const DATA_REVIEW_VIEW_ROLES = ['FrontDesk', 'ComplianceLead', 'Auditor', 'SystemAdmin', 'Director'];

export function canViewDataReview(role?: string | null): boolean {
  return !!role && DATA_REVIEW_VIEW_ROLES.includes(role);
}
// Initiate is ComplianceLead-only (FrontDesk gets 403); submit is FrontDesk-only
// (ComplianceLead gets 403). SystemAdmin/Director bypass both.
export function canInitiateDataReview(role?: string | null): boolean {
  return role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';
}
export function canSubmitDataReview(role?: string | null): boolean {
  return role === 'FrontDesk' || role === 'SystemAdmin' || role === 'Director';
}
export function canDecideDataReview(role?: string | null): boolean {
  return role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';
}

export const DATA_REVIEW_STATUS_LABELS: Record<string, string> = {
  NEED_RISK_SCORE: 'Perlu Risk Score',
  NOT_DUE: 'Belum Jatuh Tempo',
  DUE: 'Jatuh Tempo',
  DRAFT: 'Menunggu Update Frontline',
  SUBMITTED: 'Menunggu Review Compliance',
  IN_COMPLIANCE_REVIEW: 'Dalam Review Compliance',
  RETURNED_FOR_REVISION: 'Dikembalikan untuk Revisi',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export function dataReviewStatusLabel(status?: string | null): string {
  return (status && DATA_REVIEW_STATUS_LABELS[status]) || status || '—';
}

export const DUE_STATUS_LABELS: Record<string, string> = {
  NOT_DUE: 'Belum Jatuh Tempo',
  DUE_SOON: 'Akan Jatuh Tempo',
  DUE: 'Jatuh Tempo',
  OVERDUE: 'Terlambat',
  NEED_RISK_SCORE: 'Butuh Risk Score',
  NO_SUBMITTED_DATE: 'Belum Ada Tanggal Submit',
};

export function dueStatusLabel(status?: string | null): string {
  return (status && DUE_STATUS_LABELS[status]) || '—';
}

/** Review status of the worklist row — no active review means it hasn't started. */
export function reviewStatusLabel(status?: string | null): string {
  return status ? dataReviewStatusLabel(status) : 'Belum Dimulai';
}

/** Review period as reported by the backend, e.g. "2 tahun". */
export function periodLabel(years?: number | null): string {
  return typeof years === 'number' ? `${years} tahun` : '—';
}

/** Period (in years) per risk level: HIGH=1, MEDIUM=2, LOW=3. */
export function riskPeriodLabel(riskLevel?: string | null): string {
  const map: Record<string, string> = { HIGH: '1 tahun', MEDIUM: '2 tahun', LOW: '3 tahun' };
  return (riskLevel && map[riskLevel.toUpperCase()]) || '—';
}

export function listDataReviews(params: DataReviewListParams = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return apiFetch<DataReviewListResponse>(`/data-reviews${s ? `?${s}` : ''}`);
}

export function getDataReviewStatus(appId: number | string) {
  return apiFetch<DataReviewStatusResponse>(`/applications/${appId}/data-review/status`);
}

export function initiateDataReview(appId: number | string, payload: Record<string, unknown> = {}) {
  return apiFetch(`/applications/${appId}/data-review/initiate`, { method: 'POST', body: payload });
}

export function submitDataReview(appId: number | string) {
  return apiFetch(`/applications/${appId}/data-review/submit`, { method: 'POST' });
}

export function decideDataReview(appId: number | string, payload: DataReviewDecisionPayload) {
  const { decision, reason } = payload;
  return apiFetch(`/applications/${appId}/data-review/decision`, {
    method: 'POST',
    body: { decision, ...(reason ? { reason } : {}) },
  });
}
