// src/lib/data-reviews.ts
// Pengkinian Data (periodic customer data review) — API helpers + display maps.
// Endpoints: GET/POST /applications/:id/data-review/{status,initiate,submit,decision}

import { apiFetch } from './api';

export type DataReviewDecision = 'APPROVED' | 'RETURN_FOR_REVISION' | 'REJECTED';

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
export function canInitiateDataReview(role?: string | null): boolean {
  return role === 'FrontDesk' || role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';
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
  DRAFT: 'Draft Pengkinian',
  SUBMITTED: 'Menunggu Review Compliance',
  IN_COMPLIANCE_REVIEW: 'Dalam Review Compliance',
  RETURNED_FOR_REVISION: 'Dikembalikan untuk Perbaikan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
};

export function dataReviewStatusLabel(status?: string | null): string {
  return (status && DATA_REVIEW_STATUS_LABELS[status]) || status || '—';
}

/** Period (in years) per risk level: HIGH=1, MEDIUM=2, LOW=3. */
export function riskPeriodLabel(riskLevel?: string | null): string {
  const map: Record<string, string> = { HIGH: '1 tahun', MEDIUM: '2 tahun', LOW: '3 tahun' };
  return (riskLevel && map[riskLevel.toUpperCase()]) || '—';
}

export function getDataReviewStatus(appId: number | string) {
  return apiFetch<DataReviewStatusResponse>(`/applications/${appId}/data-review/status`);
}

export function initiateDataReview(appId: number | string) {
  return apiFetch(`/applications/${appId}/data-review/initiate`, { method: 'POST', body: {} });
}

export function submitDataReview(appId: number | string) {
  return apiFetch(`/applications/${appId}/data-review/submit`, { method: 'POST' });
}

export function decideDataReview(appId: number | string, decision: DataReviewDecision, reason?: string) {
  return apiFetch(`/applications/${appId}/data-review/decision`, {
    method: 'POST',
    body: { decision, ...(reason ? { reason } : {}) },
  });
}
