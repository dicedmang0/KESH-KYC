// src/lib/monitoring.ts — Transaction Monitoring (LTKT/LTKM) types + API helpers.

import { apiFetch } from './api';

// ── Status / type enums ───────────────────────────────────────────────────────

export type MonitoringCaseStatus =
  | 'DETECTED'
  | 'UNDER_COMPLIANCE_REVIEW'
  | 'NEED_CLARIFICATION'
  | 'CLOSED_FALSE_POSITIVE'
  | 'COMPLIANCE_APPROVED'
  | 'COMPLIANCE_REJECTED'
  | 'PENDING_DIRECTOR_REVIEW'
  | 'DIRECTOR_APPROVED'
  | 'DIRECTOR_REJECTED'
  | 'READY_TO_REPORT'
  | 'REPORTED'
  | 'ARCHIVED';

export type MonitoringCaseType = 'LTKT' | 'LTKM' | 'BOTH';

export type MonitoringReportStatus =
  | 'DRAFT'
  | 'READY_TO_SUBMIT'
  | 'SUBMITTED'
  | 'REJECTED_BY_REGULATOR'
  | 'ARCHIVED';

// ── Entity types ──────────────────────────────────────────────────────────────

export type MonitoringTrigger = {
  id?: number | string | null;
  rule_code?: string | null;
  rule_name?: string | null;
  trigger_type?: string | null;
  severity?: string | null;
  score?: number | null;
  amount?: number | string | null;
  supporting?: boolean | null;
  details?: Record<string, unknown> | string | null;
};

export type MonitoringCase = {
  id: number | string;
  case_no?: string | null;
  case_type?: MonitoringCaseType | null;
  status?: MonitoringCaseStatus | null;
  severity?: string | null;
  customer_name?: string | null;
  cif_no?: string | null;
  source_type?: string | null;
  transfer_id?: number | string | null;
  application_id?: number | string | null;
  detected_at?: string | null;
  due_date?: string | null;
  report_type?: string | null;
  trigger_summary?: string | null;
};

export type LinkedTransferSummary = {
  id?: number | string | null;
  amount?: string | number | null;
  currency?: string | null;
  transfer_method?: string | null;
  transfer_channel?: string | null;
  sender_name?: string | null;
  sender_cif_no?: string | null;
  source_of_funds?: string | null;
  transaction_purpose?: string | null;
  beneficiary_account_name?: string | null;
  beneficiary_account_number?: string | null;
  beneficiary_bank_name?: string | null;
  status?: string | null;
};

export type LinkedApplicationSummary = {
  id?: number | string | null;
  type?: string | null;
  risk_level?: string | null;
  status?: string | null;
  customer_name?: string | null;
};

export type ComplianceReviewEntry = {
  action?: string | null;
  notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type DirectorReviewEntry = {
  decision?: string | null;
  notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type ComplianceReviewSummary = {
  action: string | null;
  notes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  hasAny: boolean;
};

export type MonitoringCaseDetail = MonitoringCase & {
  triggers?: MonitoringTrigger[] | null;
  compliance_review?: ComplianceReviewEntry | null;
  director_review?: DirectorReviewEntry | null;
  // Backend may also surface compliance review as flat columns — kept optional
  // so the UI can read from either the nested object or these top-level fields.
  compliance_action?: string | null;
  compliance_notes?: string | null;
  compliance_reviewed_by?: string | null;
  compliance_reviewed_at?: string | null;
  report_status?: MonitoringReportStatus | null;
  report_reference_no?: string | null;
  report_file_uri?: string | null;
  reported_at?: string | null;
  linked_transfer?: LinkedTransferSummary | null;
  linked_application?: LinkedApplicationSummary | null;
};

export type MonitoringReport = {
  id: number | string;
  case_no?: string | null;
  case_type?: MonitoringCaseType | null;
  report_type?: string | null;
  report_status?: MonitoringReportStatus | null;
  customer_name?: string | null;
  cif_no?: string | null;
  case_status?: MonitoringCaseStatus | null;
  due_date?: string | null;
  report_reference_no?: string | null;
  reported_at?: string | null;
  case_id?: number | string | null;
};

// ── Paginated response ────────────────────────────────────────────────────────

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
};

// ── Query / payload types ─────────────────────────────────────────────────────

export type CasesQuery = {
  page?: number;
  limit?: number;
  status?: string;
  case_type?: string;
  report_type?: string;
  q?: string;
  due_before?: string;
};

export type ReportsQuery = {
  page?: number;
  limit?: number;
  report_status?: string;
  report_type?: string;
};

export type ComplianceReviewAction =
  | 'CLOSE_FALSE_POSITIVE'
  | 'NEED_CLARIFICATION'
  | 'ESCALATE_TO_DIRECTOR'
  | 'READY_TO_REPORT'
  | 'RECOMMEND_REPORT';

export type ComplianceReviewBody = {
  action: ComplianceReviewAction;
  notes: string;
};

export type DirectorDecision = 'APPROVED' | 'REJECTED' | 'REQUEST_MORE_INFO';

export type DirectorReviewBody = {
  decision: DirectorDecision;
  notes: string;
};

export type ReportUpdateBody = {
  report_status: MonitoringReportStatus;
  report_reference_no?: string;
  report_file_uri?: string;
  reported_at?: string;
};

// ── API functions ─────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export function getMonitoringCases(params: CasesQuery = {}) {
  return apiFetch<PaginatedResponse<MonitoringCase>>(
    `/monitoring/cases${buildQuery(params as Record<string, string | number | undefined>)}`
  );
}

export function getMonitoringCase(id: number | string) {
  return apiFetch<MonitoringCaseDetail>(`/monitoring/cases/${id}`);
}

export function getMonitoringReports(params: ReportsQuery = {}) {
  return apiFetch<PaginatedResponse<MonitoringReport>>(
    `/monitoring/reports${buildQuery(params as Record<string, string | number | undefined>)}`
  );
}

export function evaluateTransfer(transferId: number | string) {
  return apiFetch<{ message?: string }>(`/monitoring/evaluate-transfer/${transferId}`, {
    method: 'POST',
  });
}

export function complianceReview(id: number | string, body: ComplianceReviewBody) {
  return apiFetch<MonitoringCaseDetail>(`/monitoring/cases/${id}/compliance-review`, {
    method: 'PATCH',
    body,
  });
}

export function directorReview(id: number | string, body: DirectorReviewBody) {
  return apiFetch<MonitoringCaseDetail>(`/monitoring/cases/${id}/director-review`, {
    method: 'PATCH',
    body,
  });
}

export function updateMonitoringReport(id: number | string, body: ReportUpdateBody) {
  return apiFetch<MonitoringCaseDetail>(`/monitoring/cases/${id}/report`, {
    method: 'PATCH',
    body,
  });
}

// ── Display labels ────────────────────────────────────────────────────────────

export const CASE_STATUS_LABELS: Record<string, string> = {
  DETECTED: 'Terdeteksi',
  UNDER_COMPLIANCE_REVIEW: 'Review Compliance',
  NEED_CLARIFICATION: 'Butuh Klarifikasi',
  CLOSED_FALSE_POSITIVE: 'Ditutup / False Positive',
  COMPLIANCE_APPROVED: 'Disetujui Compliance',
  COMPLIANCE_REJECTED: 'Ditolak Compliance',
  PENDING_DIRECTOR_REVIEW: 'Menunggu Review Dirut',
  DIRECTOR_APPROVED: 'Disetujui Dirut',
  DIRECTOR_REJECTED: 'Ditolak Dirut',
  READY_TO_REPORT: 'Siap Dilaporkan',
  REPORTED: 'Sudah Dilaporkan',
  ARCHIVED: 'Diarsipkan',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  READY_TO_SUBMIT: 'Siap Kirim',
  SUBMITTED: 'Terkirim',
  REJECTED_BY_REGULATOR: 'Ditolak Regulator',
  ARCHIVED: 'Diarsipkan',
};

export const SEVERITY_LABELS: Record<string, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  CRITICAL: 'Kritikal',
};

export const TRIGGER_LABELS: Record<string, string> = {
  LTKT_CASH_SINGLE_500M: 'Transaksi tunai tunggal ≥500 juta',
  LTKT_CASH_AGGREGATE_DAILY_500M: 'Akumulasi tunai harian ≥500 juta',
  LTKM_HIGH_RISK_CUSTOMER: 'Nasabah high risk',
  LTKM_PEP_RELATED: 'Terkait PEP',
  LTKM_SANCTION_RELATED: 'Terkait daftar sanksi',
  LTKM_EDD_RECOMMEND_LTKM: 'EDD merekomendasikan LTKM',
  LTKM_STRUCTURING_DAILY: 'Indikasi structuring harian',
  LTKM_MANY_BENEFICIARIES_DAILY: 'Banyak penerima dalam sehari',
  LTKM_HIGH_VALUE_TRANSFER: 'Transfer bernilai tinggi',
};

export const COMPLIANCE_ACTION_LABELS: Record<string, string> = {
  CLOSE_FALSE_POSITIVE: 'Tutup sebagai False Positive',
  NEED_CLARIFICATION: 'Butuh Klarifikasi',
  ESCALATE_TO_DIRECTOR: 'Eskalasi ke Direktur Utama',
  RECOMMEND_REPORT: 'Rekomendasikan Laporan',
  READY_TO_REPORT: 'Siap Dilaporkan',
};

export const DIRECTOR_DECISION_LABELS: Record<string, string> = {
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  REQUEST_MORE_INFO: 'Minta Informasi Tambahan',
};

export function formatCaseStatus(status?: string | null): string {
  return (status && CASE_STATUS_LABELS[status]) || status || '—';
}

export function formatComplianceAction(action?: string | null): string {
  return (action && COMPLIANCE_ACTION_LABELS[action]) || action || '-';
}

/** Backend may only send a numeric user id — label it so it isn't mistaken for something else. */
export function formatComplianceReviewer(reviewedBy?: string | null): string {
  if (reviewedBy === null || reviewedBy === undefined || reviewedBy === '') return '-';
  const s = String(reviewedBy);
  return /^\d+$/.test(s) ? `User ID: ${s}` : s;
}

/**
 * Reads the compliance review from either the nested `compliance_review` object
 * or the flat `compliance_*` columns. Shared by the Review Compliance and
 * Review Direktur Utama sections so both stay in sync.
 */
export function getComplianceReviewSummary(caseDetail: MonitoringCaseDetail): ComplianceReviewSummary {
  const action = caseDetail.compliance_review?.action ?? caseDetail.compliance_action ?? null;
  const notes = caseDetail.compliance_review?.notes ?? caseDetail.compliance_notes ?? null;
  const reviewedAt = caseDetail.compliance_review?.reviewed_at ?? caseDetail.compliance_reviewed_at ?? null;
  const reviewedBy = caseDetail.compliance_review?.reviewed_by ?? caseDetail.compliance_reviewed_by ?? null;
  return {
    action,
    notes,
    reviewedAt,
    reviewedBy,
    hasAny: !!(action || notes || reviewedAt || reviewedBy),
  };
}

export function formatReportStatus(status?: string | null): string {
  return (status && REPORT_STATUS_LABELS[status]) || status || '—';
}

export function formatSeverity(severity?: string | null): string {
  return (severity && SEVERITY_LABELS[severity]) || severity || '—';
}

export function formatCaseType(type?: string | null): string {
  if (type === 'BOTH') return 'LTKT + LTKM';
  return type || '—';
}

export function formatTriggerLabel(code?: string | null): string {
  return (code && TRIGGER_LABELS[code]) || code || '—';
}

export function formatMonitoringAmount(amount?: string | number | null, currency = 'IDR'): string {
  if (amount === null || amount === undefined) return '—';
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  try {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${new Intl.NumberFormat('id-ID').format(n)} ${currency}`;
  }
}

export function formatDateTime(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('id-ID');
}

export function formatDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('id-ID');
}
