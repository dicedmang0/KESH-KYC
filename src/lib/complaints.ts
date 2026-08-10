import { apiFetch } from './api';

// ── Status / type enums ───────────────────────────────────────────────────────

export type ComplaintStatus =
  | 'OPEN'
  | 'WAITING_CUSTOMER_DATA'
  | 'OPERATION_INVESTIGATION'
  | 'WAITING_BANK_CONFIRMATION'
  | 'AML_REVIEW'
  | 'AML_HOLD'
  | 'FINANCE_REVIEW'
  | 'REFUND_PROCESS'
  | 'REFUNDED'
  | 'RESOLVED'
  | 'CLOSED'
  | 'REJECTED'
  | 'IN_PROGRESS'; // legacy

export type ComplaintLevel        = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';
export type Level3RiskCategory =
  | 'FRAUD_SECURITY'
  | 'LEGAL_RISK'
  | 'REPUTATION_RISK'
  | 'COMPLIANCE_RISK'
  | 'FINANCIAL_IMPACT';

export type ComplaintCategory = 'TRANSFER' | 'KYC_DATA' | 'DOCUMENT' | 'SERVICE' | 'OTHER';
export type ComplaintChannel  = 'WALK_IN' | 'WHATSAPP' | 'EMAIL' | 'PHONE' | 'OTHER';
export type ComplaintPriority = 'LOW' | 'MEDIUM' | 'HIGH';

export type DataVerificationStatus = 'COMPLETE' | 'INCOMPLETE';
export type OperationInvestigationResult =
  | 'SUCCESS' | 'PENDING' | 'FAILED' | 'RETURNED' | 'NEED_AML_REVIEW' | 'NEED_FINANCE_REVIEW';
export type AmlDecision     = 'APPROVE' | 'REJECT' | 'HOLD';
export type FinanceDecision = 'NO_REFUND' | 'REFUND_REQUIRED';

// ── Entity types ──────────────────────────────────────────────────────────────

export type Complaint = {
  id: number | string;
  /** UUID publik dari backend — identitas teknis sekunder, bukan tampilan utama. */
  public_id?: string | null;
  complaint_no?: string | null;
  customer_application_id?: number | string | null;
  customer_name?: string | null;
  customer_cif_no?: string | null;
  customer_type?: string | null;
  transfer_id?: number | string | null;
  transaction_reference?: string | null;
  customer_contact?: string | null;
  transaction_amount?: string | number | null;
  transaction_date?: string | null;
  transaction_status?: string | null;
  transaction_partner_reference_no?: string | null;
  category?: ComplaintCategory | null;
  channel?: ComplaintChannel | null;
  priority?: ComplaintPriority | null;
  status?: ComplaintStatus | null;
  complaint_level?: ComplaintLevel | null;
  level_3_risk_category?: Level3RiskCategory | null;
  complaint_notes?: string | null;

  // Workflow trail — read-only, diisi oleh masing-masing endpoint aksi.
  data_verification_status?: DataVerificationStatus | null;
  data_verification_notes?: string | null;
  data_verified_at?: string | null;
  operation_investigation_result?: OperationInvestigationResult | null;
  operation_investigation_notes?: string | null;
  operation_investigated_at?: string | null;
  aml_decision?: AmlDecision | null;
  aml_notes?: string | null;
  aml_reviewed_at?: string | null;
  finance_decision?: FinanceDecision | null;
  finance_review_notes?: string | null;
  finance_reviewed_at?: string | null;

  resolution_notes?: string | null;
  customer_communication_notes?: string | null;
  closing_notes?: string | null;
  created_by?: string | null;
  // Nama aktor (COALESCE(users.name, users.email)) — UI memakai ini; *_by
  // hanya ID numerik internal dan tidak pernah ditampilkan ke user.
  created_by_name?: string | null;
  data_verified_by_name?: string | null;
  operation_investigated_by_name?: string | null;
  aml_reviewed_by_name?: string | null;
  finance_reviewed_by_name?: string | null;
  resolved_by_name?: string | null;
  closed_by_name?: string | null;
  created_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  updated_at?: string | null;
  /**
   * Refund statement yang tertaut — read-only. Adanya refund TIDAK mengubah
   * status pengaduan; penutupan tetap manual.
   */
  statement_refunds?: ComplaintLinkedRefund[] | null;
};

export type ComplaintLinkedRefund = {
  id: number | string;
  refund_no: string;
  amount?: string | number | null;
  currency?: string | null;
  status?: string | null;
  statement_date?: string | null;
  received_at?: string | null;
  original_transfer_id?: number | string | null;
  approved_at?: string | null;
  credited_at?: string | null;
  balance_credit_status?: string | null;
};

export type ComplaintCustomerSearchItem = {
  application_id: number | string;
  display_name?: string | null;
  cif_no?: string | null;
  customer_type?: string | null;
};

export type ComplaintTransactionSearchItem = {
  transfer_id: number | string;
  transaction_reference?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
  result?: string | null;
  created_at?: string | null;
};

export type CreateComplaintPayload = {
  customer_application_id: number | string;
  transfer_id?: number | string;
  transaction_reference: string;
  category: ComplaintCategory;
  channel: ComplaintChannel;
  priority: ComplaintPriority;
  complaint_level: ComplaintLevel;
  level_3_risk_category?: Level3RiskCategory;
  complaint_notes: string;
};

export type PaginatedComplaints = {
  data: Complaint[];
  page: number;
  limit: number;
  total: number;
};

// ── Display labels ────────────────────────────────────────────────────────────

export const COMPLAINT_CATEGORY_LABELS: Record<string, string> = {
  TRANSFER:  'Transfer',
  KYC_DATA:  'Data KYC',
  DOCUMENT:  'Dokumen',
  SERVICE:   'Layanan',
  OTHER:     'Lainnya',
};

export const COMPLAINT_CHANNEL_LABELS: Record<string, string> = {
  WALK_IN:   'Walk-in',
  WHATSAPP:  'WhatsApp',
  EMAIL:     'Email',
  PHONE:     'Telepon',
  OTHER:     'Lainnya',
};

export const COMPLAINT_PRIORITY_LABELS: Record<string, string> = {
  LOW:    'Low',
  MEDIUM: 'Medium',
  HIGH:   'High',
};

export const COMPLAINT_STATUS_LABELS: Record<string, string> = {
  OPEN:                      'Open',
  WAITING_CUSTOMER_DATA:     'Waiting Customer Data',
  OPERATION_INVESTIGATION:   'Operation Investigation',
  WAITING_BANK_CONFIRMATION: 'Waiting Bank Confirmation',
  AML_REVIEW:                'AML Review',
  AML_HOLD:                  'AML Hold',
  FINANCE_REVIEW:            'Finance Review',
  REFUND_PROCESS:            'Refund Process',
  REFUNDED:                  'Refunded',
  RESOLVED:                  'Resolved',
  CLOSED:                    'Closed',
  REJECTED:                  'Rejected',
  IN_PROGRESS:               'In Progress',
};

export const COMPLAINT_LEVEL_LABELS: Record<string, string> = {
  LEVEL_1: 'Level 1',
  LEVEL_2: 'Level 2',
  LEVEL_3: 'Level 3',
};

export const LEVEL_3_RISK_CATEGORY_LABELS: Record<string, string> = {
  FRAUD_SECURITY:  'Risiko Fraud/Security',
  LEGAL_RISK:      'Risiko Hukum',
  REPUTATION_RISK: 'Risiko Reputasi',
  COMPLIANCE_RISK: 'Risiko Kepatuhan',
  FINANCIAL_IMPACT:'Risiko Berdampak Finansial',
};

export const DATA_VERIFICATION_LABELS: Record<string, string> = {
  COMPLETE:   'Lengkap',
  INCOMPLETE: 'Tidak Lengkap',
};

export const OPERATION_RESULT_LABELS: Record<string, string> = {
  SUCCESS:             'Success',
  PENDING:             'Pending',
  FAILED:              'Failed',
  RETURNED:            'Returned',
  NEED_AML_REVIEW:     'Need AML Review',
  NEED_FINANCE_REVIEW: 'Need Finance Review',
};

export const AML_DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Approve',
  REJECT:  'Reject',
  HOLD:    'Hold',
};

export const FINANCE_DECISION_LABELS: Record<string, string> = {
  NO_REFUND:       'Tidak Perlu Refund',
  REFUND_REQUIRED: 'Perlu Refund',
};

/** Tahap kerja berjalan — diturunkan dari status (backend tidak menyimpan assignee). */
export const COMPLAINT_STAGE_LABELS: Record<string, string> = {
  OPEN:                      'Complaint Handling',
  WAITING_CUSTOMER_DATA:     'Complaint Handling',
  OPERATION_INVESTIGATION:   'Operation Supervisor',
  WAITING_BANK_CONFIRMATION: 'Operation Supervisor',
  AML_REVIEW:                'Compliance Lead',
  AML_HOLD:                  'Compliance Lead',
  FINANCE_REVIEW:            'Finance Staff',
  REFUND_PROCESS:            'Finance — Pencatatan Refund',
  REFUNDED:                  'Complaint Handling',
  RESOLVED:                  'Complaint Handling',
  IN_PROGRESS:               'Complaint Handling',
  CLOSED:                    'Selesai',
  REJECTED:                  'Selesai',
};

// ── Formatters ────────────────────────────────────────────────────────────────

const label = (map: Record<string, string>) => (v?: string | null) => (v && map[v]) || v || '—';

export const formatComplaintStatus   = label(COMPLAINT_STATUS_LABELS);
export const formatComplaintCategory = label(COMPLAINT_CATEGORY_LABELS);
export const formatComplaintChannel  = label(COMPLAINT_CHANNEL_LABELS);
export const formatComplaintPriority = label(COMPLAINT_PRIORITY_LABELS);
export const formatComplaintLevel    = label(COMPLAINT_LEVEL_LABELS);
export const formatLevel3Risk        = label(LEVEL_3_RISK_CATEGORY_LABELS);
export const formatDataVerification  = label(DATA_VERIFICATION_LABELS);
export const formatOperationResult   = label(OPERATION_RESULT_LABELS);
export const formatAmlDecision       = label(AML_DECISION_LABELS);
export const formatFinanceDecision   = label(FINANCE_DECISION_LABELS);
export const formatComplaintStage    = label(COMPLAINT_STAGE_LABELS);

export function complaintStatusBadgeClass(status?: string | null): string {
  switch (status) {
    case 'OPEN':                      return 'bg-blue-100 text-blue-700';
    case 'WAITING_CUSTOMER_DATA':     return 'bg-amber-100 text-amber-700';
    case 'OPERATION_INVESTIGATION':   return 'bg-indigo-100 text-indigo-700';
    case 'WAITING_BANK_CONFIRMATION': return 'bg-amber-100 text-amber-700';
    case 'AML_REVIEW':                return 'bg-purple-100 text-purple-700';
    case 'AML_HOLD':                  return 'bg-orange-100 text-orange-700';
    case 'FINANCE_REVIEW':            return 'bg-cyan-100 text-cyan-700';
    case 'REFUND_PROCESS':            return 'bg-teal-100 text-teal-700';
    case 'REFUNDED':                  return 'bg-teal-100 text-teal-700';
    case 'RESOLVED':                  return 'bg-emerald-100 text-emerald-700';
    case 'REJECTED':                  return 'bg-red-100 text-red-700';
    case 'IN_PROGRESS':               return 'bg-amber-100 text-amber-700';
    default:                          return 'bg-slate-100 text-slate-500';
  }
}

export function complaintLevelBadgeClass(level?: string | null): string {
  switch (level) {
    case 'LEVEL_3': return 'bg-red-100 text-red-700';
    case 'LEVEL_2': return 'bg-amber-100 text-amber-700';
    case 'LEVEL_1': return 'bg-emerald-100 text-emerald-700';
    default:        return 'bg-slate-100 text-slate-500';
  }
}

// ── Query builder ─────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

// ── API functions ─────────────────────────────────────────────────────────────

// Both search endpoints may return a plain array or a paginated envelope.
// Always extract to a plain array so callers never need to handle the envelope.
type MaybeList<T> = T[] | { data: T[] };

function extractList<T>(res: MaybeList<T>): T[] {
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as { data: T[] }).data)) return (res as { data: T[] }).data;
  return [];
}

export async function searchComplaintCustomers(q: string): Promise<ComplaintCustomerSearchItem[]> {
  const res = await apiFetch<MaybeList<ComplaintCustomerSearchItem>>(
    `/complaints/customers/search${buildQuery({ q })}`
  );
  return extractList(res);
}

export async function searchComplaintTransactions(
  customer_application_id: number | string,
  q: string,
): Promise<ComplaintTransactionSearchItem[]> {
  const res = await apiFetch<MaybeList<ComplaintTransactionSearchItem>>(
    `/complaints/transactions/search${buildQuery({ customer_application_id, q })}`
  );
  return extractList(res);
}

export function getComplaints(params: {
  status?: string;
  complaint_level?: string;
  q?: string;
  customer_application_id?: number | string;
  page?: number;
  limit?: number;
} = {}) {
  return apiFetch<PaginatedComplaints>(
    `/complaints${buildQuery(params as Record<string, string | number | undefined>)}`
  );
}

export function getComplaint(id: number | string) {
  return apiFetch<Complaint>(`/complaints/${id}`);
}

export function createComplaint(body: CreateComplaintPayload) {
  return apiFetch<Complaint>('/complaints', { method: 'POST', body });
}

// ── Workflow actions ──────────────────────────────────────────────────────────

const action = <B extends Record<string, unknown>>(path: string) =>
  (id: number | string, body: B) =>
    apiFetch<Complaint>(`/complaints/${id}/${path}`, { method: 'POST', body });

export const verifyComplaintData = action<{
  data_verification_status: DataVerificationStatus;
  notes?: string;
}>('verify-data');

export const operationInvestigation = action<{
  result: OperationInvestigationResult;
  notes: string;
}>('operation-investigation');

export const amlReviewComplaint = action<{
  decision: AmlDecision;
  notes: string;
}>('aml-review');

export const financeReviewComplaint = action<{
  decision: FinanceDecision;
  notes: string;
}>('finance-review');

export const resolveComplaint = action<{
  resolution_notes: string;
  customer_communication_notes?: string;
}>('resolve');

export const closeComplaint = action<{ closing_notes: string }>('close');

// ── Permission helpers ────────────────────────────────────────────────────────
// Cerminan RolesGuard backend: SystemAdmin & Director bypass semua @Roles.

const FULL_ACCESS_ROLES = ['SystemAdmin', 'Director'];

function isRole(role: string | null | undefined, ...allowed: string[]): boolean {
  if (!role) return false;
  return FULL_ACCESS_ROLES.includes(role) || allowed.includes(role);
}

/** Role yang boleh membuka menu & halaman pengaduan. FrontDesk tidak termasuk. */
export const COMPLAINT_VIEW_ROLES = [
  'ComplaintHandling',
  'OperationSupervisor',
  'ComplianceLead',
  'FinanceStaff',
  'FinanceManager',
  'Auditor',
  'SystemAdmin',
  'Director',
];

export function canViewComplaints(role?: string | null): boolean {
  return !!role && COMPLAINT_VIEW_ROLES.includes(role);
}

/** CLOSED/REJECTED/RESOLVED = terkunci untuk verify/investigation/AML/finance/resolve — hanya close yang masih diizinkan backend. */
function isFinal(status?: string | null): boolean {
  return status === 'CLOSED' || status === 'REJECTED' || status === 'RESOLVED';
}

export function canCreateComplaint(role?: string | null): boolean {
  return isRole(role, 'ComplaintHandling');
}

// Setiap aksi workflow hanya sah pada tahapnya sendiri. Tanpa gate tahap ini
// form lama tetap terlihat setelah tiket pindah tahap (mis. Ops SPV masih
// melihat form investigasi saat status sudah AML_REVIEW) dan baru ditolak
// backend dengan 400 setelah user menekan simpan.
export function canVerifyComplaintData(role?: string | null, c?: Complaint | null): boolean {
  return (
    isRole(role, 'ComplaintHandling') &&
    !isFinal(c?.status) &&
    (c?.status === 'OPEN' || c?.status === 'WAITING_CUSTOMER_DATA')
  );
}

export function canOperationInvestigate(role?: string | null, c?: Complaint | null): boolean {
  return (
    isRole(role, 'OperationSupervisor') &&
    !isFinal(c?.status) &&
    c?.status === 'OPERATION_INVESTIGATION'
  );
}

// Backend hanya menerima AML review saat status AML_REVIEW / AML_HOLD.
export function canAmlReview(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'ComplianceLead') && (c?.status === 'AML_REVIEW' || c?.status === 'AML_HOLD');
}

// Backend hanya menerima finance review saat status FINANCE_REVIEW / REFUND_PROCESS.
export function canFinanceReview(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'FinanceStaff') && (c?.status === 'FINANCE_REVIEW' || c?.status === 'REFUND_PROCESS');
}

export function canResolveComplaint(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'ComplaintHandling') && !isFinal(c?.status) && c?.status !== 'RESOLVED';
}

export function canCloseComplaint(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'ComplaintHandling') && (c?.status === 'RESOLVED' || c?.status === 'REJECTED');
}

/** True kalau role ini tidak punya satu pun aksi pada tiket (Auditor, FinanceManager, tiket CLOSED). */
export function isComplaintReadOnly(role?: string | null, c?: Complaint | null): boolean {
  return !(
    canVerifyComplaintData(role, c) ||
    canOperationInvestigate(role, c) ||
    canAmlReview(role, c) ||
    canFinanceReview(role, c) ||
    canResolveComplaint(role, c) ||
    canCloseComplaint(role, c)
  );
}
