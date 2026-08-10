// src/lib/statement-refunds.ts
// Pencatatan Refund (statement refund) — API helpers + display maps.
// Endpoints: /statement-refunds{,/:id,/:id/match,/:id/submit,/:id/decision}
//
// Tiga layer terpisah: complaint → statement refund → balance event.
// Refund tidak menutup complaint, dan approval belum mengkredit saldo partner
// (modul balance belum ada di backend → balance_credit_status PENDING_EXTERNAL_POSTING).

import { apiFetch } from './api';

export type RefundStatus =
  | 'UNMATCHED'
  | 'MATCHED'
  | 'NEED_INVESTIGATION'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'BALANCE_CREDITED'
  | 'REJECTED'
  | 'DUPLICATE';

export type MatchConfidence = 'HIGH' | 'MEDIUM' | 'LOW';
export type MatchMethod = 'MANUAL' | 'AUTO_SUGGESTED';
export type BalanceCreditStatus = 'PENDING_EXTERNAL_POSTING' | 'CREDITED' | null;

export type StatementRefundListItem = {
  id: number | string;
  /** UUID publik dari backend — identitas teknis sekunder; tampilan utama refund_no. */
  public_id?: string | null;
  refund_no: string;
  complaint_id: number | string | null;
  // Nomor pengaduan (KESH-CMP-…) — identitas yang dipakai user; complaint_id
  // hanya penyimpanan internal dan tidak pernah jadi tampilan utama.
  complaint_no: string | null;
  complaint_status: string | null;
  complaint_customer_name: string | null;
  original_transfer_id: number | string | null;
  transfer_reference_no: string | null;
  // Nomor referensi partner transaksi awal (KESH-TRF-…) — identitas yang
  // dipakai user, sementara original_transfer_id hanya ID internal.
  original_transfer_reference_no: string | null;
  original_transfer_amount: string | number | null;
  partner_name: string | null;
  partner_application_id: number | string | null;
  statement_date: string | null;
  received_at: string | null;
  amount: string | number | null;
  currency: string | null;
  bank_reference_no: string | null;
  status: RefundStatus | null;
  match_confidence: MatchConfidence | null;
  created_by: number | string | null;
  approved_by: number | string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type StatementRefundComplaint = {
  id: number | string;
  complaint_no?: string | null;
  customer_name?: string | null;
  transaction_reference?: string | null;
  status?: string | null;
  resolution_notes?: string | null;
  created_at?: string | null;
};

export type StatementRefundTransfer = {
  id: number | string;
  amount?: string | number | null;
  currency?: string | null;
  status?: string | null;
  result?: string | null;
  sender_application_id?: number | string | null;
  reference_no?: string | null;
  partner_reference_no?: string | null;
  bank_reference_no?: string | null;
  beneficiary_account_number?: string | null;
  beneficiary_account_name?: string | null;
  beneficiary_bank_name?: string | null;
  transaction_date?: string | null;
  created_at?: string | null;
};

export type StatementRefundPartner = {
  application_id: number | string;
  customer_type?: string | null;
  cif_no?: string | null;
  display_name?: string | null;
};

export type StatementRefund = {
  id: number | string;
  /** UUID publik dari backend — identitas teknis sekunder; tampilan utama refund_no. */
  public_id?: string | null;
  refund_no: string;
  complaint_id: number | string | null;
  original_transfer_id: number | string | null;
  partner_application_id: number | string | null;
  statement_date: string | null;
  received_at: string | null;
  amount: string | number | null;
  currency: string | null;
  bank_account_no: string | null;
  bank_name: string | null;
  bank_reference_no: string | null;
  statement_description: string | null;
  evidence_uri: string | null;
  match_method: MatchMethod | null;
  match_confidence: MatchConfidence | null;
  status: RefundStatus;
  investigation_notes: string | null;
  finance_notes: string | null;
  rejection_reason: string | null;
  created_by: number | string | null;
  matched_by: number | string | null;
  submitted_by: number | string | null;
  approved_by: number | string | null;
  rejected_by: number | string | null;
  balance_event_id: number | string | null;
  created_at: string | null;
  updated_at: string | null;
  matched_at: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  credited_at: string | null;
  // hanya pada GET /:id
  complaint?: StatementRefundComplaint | null;
  transfer?: StatementRefundTransfer | null;
  partner?: StatementRefundPartner | null;
  balance_event?: unknown | null;
  balance_credit_status?: BalanceCreditStatus;
  original_transfer_reference_no?: string | null;
  original_transfer_amount?: string | number | null;
  complaint_no?: string | null;
  complaint_status?: string | null;
  complaint_customer_name?: string | null;
  // Nama aktor (COALESCE(users.name, users.email)) — dipakai UI menggantikan
  // *_by yang hanya berisi ID numerik internal.
  created_by_name?: string | null;
  matched_by_name?: string | null;
  submitted_by_name?: string | null;
  approved_by_name?: string | null;
  rejected_by_name?: string | null;
};

export type StatementRefundListParams = {
  q?: string;
  status?: string;
  statement_date_from?: string;
  statement_date_to?: string;
  received_from?: string;
  received_to?: string;
  partner_application_id?: number | string;
  page?: number;
  limit?: number;
};

export type StatementRefundListResponse = {
  data: StatementRefundListItem[];
  total: number;
  page: number;
  limit: number;
};

export type CreateStatementRefundPayload = {
  /** Dipakai UI. Backend resolve ke complaints.complaint_no. */
  complaint_no?: string;
  /** Legacy — masih diterima backend, tapi UI tidak lagi meminta ID internal. */
  complaint_id?: number;
  /** Dipakai UI. Backend resolve ke transfers.partner_reference_no. */
  original_transfer_reference_no?: string;
  /** Legacy — masih diterima backend, tapi UI tidak lagi meminta ID internal. */
  original_transfer_id?: number;
  statement_date: string;
  received_at: string;
  amount: number;
  currency?: string;
  bank_account_no?: string;
  bank_name?: string;
  bank_reference_no?: string;
  statement_description?: string;
  investigation_notes?: string;
  evidence_uri?: string;
};

export type UpdateStatementRefundPayload = {
  bank_name?: string;
  bank_account_no?: string;
  statement_description?: string;
  investigation_notes?: string;
  evidence_uri?: string;
  complaint_no?: string;
  complaint_id?: number;
};

// Backend butuh salah satu dari reference/id — UI selalu mengirim reference.
export type MatchStatementRefundPayload = {
  original_transfer_reference_no?: string;
  original_transfer_id?: number;
  complaint_no?: string;
  complaint_id?: number;
  match_method?: MatchMethod;
  investigation_notes?: string;
};

export type StatementRefundDecisionPayload = {
  decision: 'APPROVED' | 'REJECTED';
  finance_notes?: string;
  reason?: string;
};

// ── RBAC (mirrors backend RolesGuard + SystemAdmin/Director bypass) ───────────

export const REFUND_VIEW_ROLES = [
  'FinanceStaff',
  'FinanceManager',
  'ComplianceLead',
  'Auditor',
  'SystemAdmin',
  'Director',
];

export function canViewStatementRefund(role?: string | null): boolean {
  return !!role && REFUND_VIEW_ROLES.includes(role);
}

/**
 * Maker = FinanceStaff. Backend juga mengizinkan FinanceManager create/match,
 * tapi pemisahan maker/checker di UI sengaja lebih ketat: FinanceManager hanya
 * approve/reject supaya tidak menyetujui pekerjaannya sendiri.
 */
export function canCreateStatementRefund(role?: string | null): boolean {
  return role === 'FinanceStaff' || role === 'SystemAdmin' || role === 'Director';
}
export const canUpdateStatementRefund = canCreateStatementRefund;
export const canMatchStatementRefund = canCreateStatementRefund;
export const canSubmitStatementRefund = canCreateStatementRefund;

/** Checker = FinanceManager. Satu-satunya gerbang menuju posting saldo. */
export function canDecideStatementRefund(role?: string | null): boolean {
  return role === 'FinanceManager' || role === 'SystemAdmin' || role === 'Director';
}

// ── Status gates (mirrors backend transition rules) ───────────────────────────

const OPEN_STATUSES: RefundStatus[] = ['UNMATCHED', 'MATCHED', 'NEED_INVESTIGATION'];

export function isRefundEditable(status?: string | null): boolean {
  return OPEN_STATUSES.includes(status as RefundStatus);
}
export function isRefundMatchable(status?: string | null): boolean {
  return OPEN_STATUSES.includes(status as RefundStatus) || status === 'DUPLICATE';
}
export function isRefundSubmittable(status?: string | null): boolean {
  return status === 'MATCHED' || status === 'NEED_INVESTIGATION';
}
export function isRefundDecidable(status?: string | null): boolean {
  return status === 'PENDING_APPROVAL';
}

// ── Display maps ─────────────────────────────────────────────────────────────

export const REFUND_STATUS_LABELS: Record<string, string> = {
  UNMATCHED: 'Belum Dicocokkan',
  MATCHED: 'Sudah Dicocokkan',
  NEED_INVESTIGATION: 'Perlu Investigasi',
  PENDING_APPROVAL: 'Menunggu Approval Finance',
  APPROVED: 'Disetujui',
  BALANCE_CREDITED: 'Saldo Dikreditkan',
  REJECTED: 'Ditolak',
  DUPLICATE: 'Duplikat',
};

export function refundStatusLabel(status?: string | null): string {
  return (status && REFUND_STATUS_LABELS[status]) || status || '—';
}

export function refundStatusBadgeClass(status?: string | null): string {
  switch (status) {
    case 'UNMATCHED':          return 'bg-slate-100 text-slate-600';
    case 'MATCHED':            return 'bg-blue-100 text-blue-700';
    case 'NEED_INVESTIGATION': return 'bg-amber-100 text-amber-700';
    case 'PENDING_APPROVAL':   return 'bg-orange-100 text-orange-700';
    case 'APPROVED':           return 'bg-emerald-100 text-emerald-700';
    case 'BALANCE_CREDITED':   return 'bg-teal-100 text-teal-700';
    case 'REJECTED':           return 'bg-red-100 text-red-700';
    case 'DUPLICATE':          return 'bg-purple-100 text-purple-700';
    default:                   return 'bg-slate-100 text-slate-500';
  }
}

export function balanceCreditStatusLabel(status?: string | null): string {
  if (status === 'CREDITED') return 'Saldo Sudah Dikreditkan';
  if (status === 'PENDING_EXTERNAL_POSTING') return 'Menunggu Posting Saldo Eksternal';
  return 'Belum Ada Posting Saldo';
}

export const MATCH_CONFIDENCE_LABELS: Record<string, string> = {
  HIGH: 'Tinggi (nominal sama persis)',
  MEDIUM: 'Sedang',
  LOW: 'Rendah (nominal berbeda)',
};

export function matchConfidenceLabel(confidence?: string | null): string {
  return (confidence && MATCH_CONFIDENCE_LABELS[confidence]) || '—';
}

export function matchMethodLabel(method?: string | null): string {
  if (method === 'MANUAL') return 'Manual';
  if (method === 'AUTO_SUGGESTED') return 'Saran Otomatis';
  return '—';
}

// ── API calls ────────────────────────────────────────────────────────────────

export function listStatementRefunds(params: StatementRefundListParams = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, String(v));
  }
  const s = qs.toString();
  return apiFetch<StatementRefundListResponse>(`/statement-refunds${s ? `?${s}` : ''}`);
}

export function getStatementRefund(id: number | string) {
  return apiFetch<StatementRefund>(`/statement-refunds/${id}`);
}

export function createStatementRefund(payload: CreateStatementRefundPayload) {
  return apiFetch<StatementRefund>('/statement-refunds', { method: 'POST', body: payload });
}

export function updateStatementRefund(id: number | string, payload: UpdateStatementRefundPayload) {
  return apiFetch<StatementRefund>(`/statement-refunds/${id}`, { method: 'PATCH', body: payload });
}

export function matchStatementRefund(id: number | string, payload: MatchStatementRefundPayload) {
  return apiFetch<StatementRefund>(`/statement-refunds/${id}/match`, { method: 'POST', body: payload });
}

export function submitStatementRefund(id: number | string) {
  return apiFetch<StatementRefund>(`/statement-refunds/${id}/submit`, { method: 'POST' });
}

export function decideStatementRefund(id: number | string, payload: StatementRefundDecisionPayload) {
  return apiFetch<StatementRefund>(`/statement-refunds/${id}/decision`, {
    method: 'POST',
    body: payload,
  });
}
