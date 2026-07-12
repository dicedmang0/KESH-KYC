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
  // New workflow statuses
  | 'PENDING_COMPLIANCE_STAFF_REVIEW'
  | 'PENDING_COMPLIANCE_MANAGER_REVIEW'
  | 'STAFF_REVIEWED'
  | 'MANAGER_APPROVED'
  | 'MANAGER_REJECTED'
  // Legacy statuses (kept for historical data display)
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

export type AlertInformation = {
  report_type?: string | null;
  trigger_criteria?: string | null;
  parameters?: string[];
  analysis?: string | null;
  recommendation?: string | null;
  matched_conditions?: string[];
  evidence?: Record<string, unknown> | null;
  supported_by_system?: boolean | null;
  limitations?: string[];
  source?: string | null;
};

export type MonitoringTrigger = {
  id?: number | string | null;
  rule_code?: string | null;
  rule_name?: string | null;
  alert_code?: string | null;
  alert_name?: string | null;
  alert_information?: AlertInformation | null;
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
  alert_names?: string[] | null;
  alert_count?: number | null;
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

export type StaffReviewEntry = {
  action?: string | null;
  notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type ManagerReviewEntry = {
  action?: string | null;
  notes?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
};

export type ReviewSummary = {
  action: string | null;
  notes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  hasAny: boolean;
};

export type MonitoringCaseDetail = MonitoringCase & {
  triggers?: MonitoringTrigger[] | null;
  // Nested review objects
  staff_review?: StaffReviewEntry | null;
  manager_review?: ManagerReviewEntry | null;
  // New flat columns
  staff_action?: string | null;
  staff_notes?: string | null;
  staff_reviewed_by?: string | null;
  staff_reviewed_at?: string | null;
  manager_action?: string | null;
  manager_notes?: string | null;
  manager_reviewed_by?: string | null;
  manager_reviewed_at?: string | null;
  // Report tracking
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

// New action types
export type StaffReviewAction =
  | 'ESCALATE_TO_MANAGER'
  | 'REQUEST_CLARIFICATION'
  | 'RECOMMEND_CLOSE_FALSE_POSITIVE';

export type ManagerReviewAction =
  | 'APPROVE_REPORT'
  | 'CLOSE_FALSE_POSITIVE'
  | 'REJECT'
  | 'REQUEST_CLARIFICATION';

export type StaffReviewBody = {
  action: StaffReviewAction;
  notes: string;
};

export type ManagerReviewBody = {
  action: ManagerReviewAction;
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

export function staffReview(id: number | string, body: StaffReviewBody) {
  return apiFetch<MonitoringCaseDetail>(`/monitoring/cases/${id}/staff-review`, {
    method: 'PATCH',
    body,
  });
}

export function managerReview(id: number | string, body: ManagerReviewBody) {
  return apiFetch<MonitoringCaseDetail>(`/monitoring/cases/${id}/manager-review`, {
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
  DETECTED: 'Menunggu Review Compliance Staff',
  UNDER_COMPLIANCE_REVIEW: 'Review Compliance',
  NEED_CLARIFICATION: 'Butuh Klarifikasi',
  CLOSED_FALSE_POSITIVE: 'Ditutup / False Positive',
  COMPLIANCE_APPROVED: 'Disetujui Compliance',
  COMPLIANCE_REJECTED: 'Ditolak Compliance',
  PENDING_COMPLIANCE_STAFF_REVIEW: 'Menunggu Review Compliance Staff',
  PENDING_COMPLIANCE_MANAGER_REVIEW: 'Menunggu Approval Compliance Manager',
  STAFF_REVIEWED: 'Sudah Review Compliance Staff',
  MANAGER_APPROVED: 'Disetujui Compliance Manager',
  MANAGER_REJECTED: 'Ditolak Compliance Manager',
  READY_TO_REPORT: 'Disetujui Compliance Manager',
  REPORTED: 'Sudah Dilaporkan',
  ARCHIVED: 'Diarsipkan',
  // Legacy Director statuses — mapped to Compliance Manager wording (no "Dirut") for historical data.
  PENDING_DIRECTOR_REVIEW: 'Menunggu Approval Compliance Manager',
  DIRECTOR_APPROVED: 'Disetujui Compliance Manager',
  DIRECTOR_REJECTED: 'Ditolak Compliance Manager',
};

// Status options shown in the monitoring list filter — current workflow only.
// Legacy Director statuses are intentionally excluded so they never appear as filters.
export const CASE_STATUS_FILTER_OPTIONS: string[] = [
  'DETECTED',
  'PENDING_COMPLIANCE_MANAGER_REVIEW',
  'NEED_CLARIFICATION',
  'READY_TO_REPORT',
  'MANAGER_REJECTED',
  'REPORTED',
  'CLOSED_FALSE_POSITIVE',
  'ARCHIVED',
];

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

export const STAFF_ACTION_LABELS: Record<string, string> = {
  ESCALATE_TO_MANAGER: 'Lanjut ke Compliance Manager',
  REQUEST_CLARIFICATION: 'Minta Klarifikasi',
  RECOMMEND_CLOSE_FALSE_POSITIVE: 'Rekomendasikan False Positive',
};

export const MANAGER_ACTION_LABELS: Record<string, string> = {
  APPROVE_REPORT: 'Setujui untuk Pelaporan',
  CLOSE_FALSE_POSITIVE: 'Tutup sebagai False Positive',
  REJECT: 'Tolak',
  REQUEST_CLARIFICATION: 'Minta Klarifikasi',
};

export function formatCaseStatus(status?: string | null): string {
  return (status && CASE_STATUS_LABELS[status]) || status || '—';
}

export function formatStaffAction(action?: string | null): string {
  return (action && STAFF_ACTION_LABELS[action]) || action || '-';
}

export function formatManagerAction(action?: string | null): string {
  return (action && MANAGER_ACTION_LABELS[action]) || action || '-';
}

/** Backend may only send a numeric user id — label it so it isn't mistaken for something else. */
export function formatComplianceReviewer(reviewedBy?: string | null): string {
  if (reviewedBy === null || reviewedBy === undefined || reviewedBy === '') return '-';
  const s = String(reviewedBy);
  return /^\d+$/.test(s) ? `User ID: ${s}` : s;
}

export function getStaffReviewSummary(caseDetail: MonitoringCaseDetail): ReviewSummary {
  const action = caseDetail.staff_review?.action ?? caseDetail.staff_action ?? null;
  const notes = caseDetail.staff_review?.notes ?? caseDetail.staff_notes ?? null;
  const reviewedAt = caseDetail.staff_review?.reviewed_at ?? caseDetail.staff_reviewed_at ?? null;
  const reviewedBy = caseDetail.staff_review?.reviewed_by ?? caseDetail.staff_reviewed_by ?? null;
  return { action, notes, reviewedAt, reviewedBy, hasAny: !!(action || notes || reviewedAt || reviewedBy) };
}

export function getManagerReviewSummary(caseDetail: MonitoringCaseDetail): ReviewSummary {
  const action = caseDetail.manager_review?.action ?? caseDetail.manager_action ?? null;
  const notes = caseDetail.manager_review?.notes ?? caseDetail.manager_notes ?? null;
  const reviewedAt = caseDetail.manager_review?.reviewed_at ?? caseDetail.manager_reviewed_at ?? null;
  const reviewedBy = caseDetail.manager_review?.reviewed_by ?? caseDetail.manager_reviewed_by ?? null;
  return { action, notes, reviewedAt, reviewedBy, hasAny: !!(action || notes || reviewedAt || reviewedBy) };
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
