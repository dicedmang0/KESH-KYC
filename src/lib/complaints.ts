import { apiFetch } from './api';

// ── Status / type enums ───────────────────────────────────────────────────────

export type ComplaintStatus =
  | 'OPEN'
  | 'WAITING_CUSTOMER_DATA'
  | 'OPERATION_INVESTIGATION'
  | 'WAITING_BANK_CONFIRMATION'
  // Alur berbasis complaint_level (backend migration 0070)
  | 'COO_REVIEW'
  | 'FINANCE_STAFF_REVIEW'
  | 'FINANCE_MANAGER_REVIEW'
  | 'COMPLIANCE_REVIEW'
  | 'COMPLIANCE_HOLD'
  | 'COMPLAINT_HANDLING_FINALIZATION'
  // Legacy — tiket lama masih memakai status ini
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
/** RETURN hanya di COMPLIANCE_REVIEW, RESUME hanya di COMPLIANCE_HOLD. */
export type AmlDecision     = 'APPROVE' | 'REJECT' | 'HOLD' | 'RETURN' | 'RESUME';
/** NO_REFUND/REFUND_REQUIRED = tahap legacy; APPROVE/RETURN = FINANCE_STAFF_REVIEW. */
export type FinanceDecision = 'NO_REFUND' | 'REFUND_REQUIRED' | 'APPROVE' | 'RETURN';
export type CooDecision            = 'APPROVE' | 'RETURN_TO_SUPERVISOR';
export type FinanceManagerDecision = 'APPROVE' | 'RETURN';

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
  coo_decision?: CooDecision | null;
  coo_notes?: string | null;
  coo_reviewed_at?: string | null;
  finance_manager_decision?: FinanceManagerDecision | null;
  finance_manager_notes?: string | null;
  finance_manager_reviewed_at?: string | null;
  /** Alias backend untuk aml_* saat tiket berada di tahap COMPLIANCE_REVIEW. */
  compliance_decision?: AmlDecision | null;
  compliance_notes?: string | null;
  compliance_reviewed_at?: string | null;

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
  compliance_reviewed_by_name?: string | null;
  finance_reviewed_by_name?: string | null;
  coo_reviewed_by_name?: string | null;
  finance_manager_reviewed_by_name?: string | null;
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

  /** OPEN vs CLOSED untuk resi cetak saja — tidak memengaruhi workflow. */
  receipt_state?: ComplaintReceiptState | null;
  /**
   * Ringkasan pengguna jasa & transaksi tertaut, ikut di respons detail. Field
   * lama di root (customer_name, transaction_amount, dst.) tetap ada, jadi ini
   * murni tambahan — bukan pengganti.
   */
  linked_customer?: ComplaintLinkedCustomer | null;
  linked_transfer?: ComplaintLinkedTransfer | null;
};

export type ComplaintReceiptState = 'OPEN' | 'CLOSED';

export type ComplaintLinkedCustomer = {
  application_id?: number | string | null;
  application_public_id?: string | null;
  cif_no?: string | null;
  customer_name?: string | null;
  customer_type?: string | null;
  customer_status?: string | null;
  risk_level?: string | null;
  contact?: string | null;
};

export type ComplaintLinkedTransfer = {
  transfer_id?: number | string | null;
  transfer_public_id?: string | null;
  partner_reference_no?: string | null;
  amount?: string | number | null;
  transaction_date?: string | null;
  status?: string | null;
  beneficiary_account_name?: string | null;
  beneficiary_account_number?: string | null;
  beneficiary_bank_name?: string | null;
};

/** Status yang dianggap selesai kalau backend belum mengirim receipt_state. */
const CLOSED_RECEIPT_STATUSES = ['RESOLVED', 'CLOSED', 'REJECTED'];

/**
 * OPEN vs CLOSED untuk resi. Backend mengirim `receipt_state`; turunan dari
 * status hanya dipakai untuk tiket lama yang belum membawanya. Daftar putih ada
 * di sisi CLOSED — status baru default ke OPEN, sama seperti backend.
 */
export function complaintReceiptState(c?: Complaint | null): ComplaintReceiptState {
  if (c?.receipt_state === 'OPEN' || c?.receipt_state === 'CLOSED') return c.receipt_state;
  return CLOSED_RECEIPT_STATUSES.includes(c?.status ?? '') ? 'CLOSED' : 'OPEN';
}

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
  COO_REVIEW:                     'Menunggu Review COO',
  FINANCE_STAFF_REVIEW:           'Menunggu Review Finance Staff',
  FINANCE_MANAGER_REVIEW:         'Menunggu Review Finance Manager',
  COMPLIANCE_REVIEW:              'Menunggu Review Compliance',
  COMPLIANCE_HOLD:                'Ditahan Compliance',
  COMPLAINT_HANDLING_FINALIZATION:'Menunggu Finalisasi Pengaduan',
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

/** Pilihan legacy (tahap AML_REVIEW/AML_HOLD) — tanpa RETURN. */
export const AML_DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Approve',
  REJECT:  'Reject',
  HOLD:    'Hold',
};

/** Pilihan compliance pada tahap COMPLIANCE_REVIEW — RETURN tersedia di sini. */
export const COMPLIANCE_DECISION_LABELS: Record<string, string> = {
  ...AML_DECISION_LABELS,
  HOLD:   'Tahan (Compliance Hold)',
  RETURN: 'Kembalikan ke COO',
};

/** Satu-satunya pilihan saat tiket ditahan: lanjutkan kembali ke review. */
export const COMPLIANCE_HOLD_DECISION_LABELS: Record<string, string> = {
  RESUME: 'Lanjutkan Review Compliance',
};

/** Pilihan legacy (tahap FINANCE_REVIEW/REFUND_PROCESS). */
export const FINANCE_DECISION_LABELS: Record<string, string> = {
  NO_REFUND:       'Tidak Perlu Refund',
  REFUND_REQUIRED: 'Perlu Refund',
};

/** Pilihan Finance Staff pada tahap FINANCE_STAFF_REVIEW (alur level). */
export const FINANCE_STAFF_DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Setujui — teruskan ke Finance Manager',
  RETURN:  'Kembalikan ke COO',
};

export const FINANCE_MANAGER_DECISION_LABELS: Record<string, string> = {
  APPROVE: 'Setujui — teruskan ke Complaint Handling',
  RETURN:  'Kembalikan ke Finance Staff',
};

export const COO_DECISION_LABELS: Record<string, string> = {
  APPROVE:              'Setujui',
  RETURN_TO_SUPERVISOR: 'Kembalikan ke Operation Supervisor',
};

/** Tahap kerja berjalan — diturunkan dari status (backend tidak menyimpan assignee). */
export const COMPLAINT_STAGE_LABELS: Record<string, string> = {
  OPEN:                      'Complaint Handling',
  WAITING_CUSTOMER_DATA:     'Complaint Handling',
  OPERATION_INVESTIGATION:   'Operation Supervisor',
  WAITING_BANK_CONFIRMATION: 'Operation Supervisor',
  COO_REVIEW:                     'COO',
  FINANCE_STAFF_REVIEW:           'Finance Staff',
  FINANCE_MANAGER_REVIEW:         'Finance Manager',
  COMPLIANCE_REVIEW:              'Compliance Lead',
  COMPLIANCE_HOLD:                'Compliance Lead',
  COMPLAINT_HANDLING_FINALIZATION:'Complaint Handling',
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
export const formatAmlDecision       = label({
  ...COMPLIANCE_DECISION_LABELS,
  ...COMPLIANCE_HOLD_DECISION_LABELS,
});
export const formatComplaintStage    = label(COMPLAINT_STAGE_LABELS);
export const formatCooDecision       = label(COO_DECISION_LABELS);
export const formatFinanceManagerDecision = label(FINANCE_MANAGER_DECISION_LABELS);

/** Finance memakai dua kosakata keputusan — satu formatter untuk keduanya. */
export const formatFinanceDecision = label({
  ...FINANCE_DECISION_LABELS,
  ...FINANCE_STAFF_DECISION_LABELS,
});

export function complaintStatusBadgeClass(status?: string | null): string {
  switch (status) {
    case 'OPEN':                      return 'bg-blue-100 text-blue-700';
    case 'WAITING_CUSTOMER_DATA':     return 'bg-amber-100 text-amber-700';
    case 'OPERATION_INVESTIGATION':   return 'bg-indigo-100 text-indigo-700';
    case 'WAITING_BANK_CONFIRMATION': return 'bg-amber-100 text-amber-700';
    case 'COO_REVIEW':                return 'bg-violet-100 text-violet-700';
    case 'FINANCE_STAFF_REVIEW':      return 'bg-cyan-100 text-cyan-700';
    case 'FINANCE_MANAGER_REVIEW':    return 'bg-sky-100 text-sky-700';
    case 'COMPLIANCE_REVIEW':         return 'bg-purple-100 text-purple-700';
    case 'COMPLIANCE_HOLD':           return 'bg-orange-100 text-orange-700';
    case 'COMPLAINT_HANDLING_FINALIZATION': return 'bg-blue-100 text-blue-700';
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

export const cooReviewComplaint = action<{
  decision: CooDecision;
  notes: string;
}>('coo-review');

// Backend melayani `compliance-review` dan alias lama `aml-review` di handler
// yang sama; FE memakai nama barunya.
export const amlReviewComplaint = action<{
  decision: AmlDecision;
  notes: string;
}>('compliance-review');

export const financeReviewComplaint = action<{
  decision: FinanceDecision;
  notes: string;
}>('finance-review');

export const financeManagerReviewComplaint = action<{
  decision: FinanceManagerDecision;
  notes: string;
}>('finance-manager-review');

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
  'COO',
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
    (c?.status === 'OPERATION_INVESTIGATION' || c?.status === 'WAITING_BANK_CONFIRMATION')
  );
}

/** Satu-satunya aksi COO, dan hanya pada tahapnya sendiri. */
export function canCooReview(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'COO') && c?.status === 'COO_REVIEW';
}

/** Tahap yang menerima aksi compliance, beserta pilihan keputusannya. */
const COMPLIANCE_STAGE_OPTIONS: Record<string, Record<string, string>> = {
  COMPLIANCE_REVIEW: COMPLIANCE_DECISION_LABELS,
  COMPLIANCE_HOLD:   COMPLIANCE_HOLD_DECISION_LABELS,
  AML_REVIEW:        AML_DECISION_LABELS, // legacy
  AML_HOLD:          AML_DECISION_LABELS, // legacy
};

export function canAmlReview(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'ComplianceLead') && !!COMPLIANCE_STAGE_OPTIONS[c?.status ?? ''];
}

// Backend menerima finance review saat FINANCE_STAFF_REVIEW (alur level) atau
// FINANCE_REVIEW / REFUND_PROCESS (legacy).
export function canFinanceReview(role?: string | null, c?: Complaint | null): boolean {
  return (
    isRole(role, 'FinanceStaff') &&
    (c?.status === 'FINANCE_STAFF_REVIEW' ||
      c?.status === 'FINANCE_REVIEW' ||
      c?.status === 'REFUND_PROCESS')
  );
}

export function canFinanceManagerReview(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'FinanceManager') && c?.status === 'FINANCE_MANAGER_REVIEW';
}

/** Pilihan keputusan Finance Staff berbeda per tahap — sesuai kosakata backend. */
export function financeDecisionOptions(c?: Complaint | null): Record<string, string> {
  return c?.status === 'FINANCE_STAFF_REVIEW'
    ? FINANCE_STAFF_DECISION_LABELS
    : FINANCE_DECISION_LABELS;
}

/** Kosakata keputusan compliance sesuai tahap tiket — cerminan routing backend. */
export function complianceDecisionOptions(c?: Complaint | null): Record<string, string> {
  return COMPLIANCE_STAGE_OPTIONS[c?.status ?? ''] ?? AML_DECISION_LABELS;
}

/** Tahap milik role lain — ComplaintHandling belum boleh menyelesaikan tiket. */
const OTHER_ROLE_STAGES = [
  'COO_REVIEW',
  'FINANCE_STAFF_REVIEW',
  'FINANCE_MANAGER_REVIEW',
  'COMPLIANCE_REVIEW',
  'COMPLIANCE_HOLD',
];

export function canResolveComplaint(role?: string | null, c?: Complaint | null): boolean {
  return (
    isRole(role, 'ComplaintHandling') &&
    !isFinal(c?.status) &&
    c?.status !== 'RESOLVED' &&
    !OTHER_ROLE_STAGES.includes(c?.status ?? '')
  );
}

export function canCloseComplaint(role?: string | null, c?: Complaint | null): boolean {
  return isRole(role, 'ComplaintHandling') && (c?.status === 'RESOLVED' || c?.status === 'REJECTED');
}

/** True kalau role ini tidak punya satu pun aksi pada tiket (Auditor, tiket CLOSED, tahap milik role lain). */
export function isComplaintReadOnly(role?: string | null, c?: Complaint | null): boolean {
  return !(
    canVerifyComplaintData(role, c) ||
    canOperationInvestigate(role, c) ||
    canCooReview(role, c) ||
    canAmlReview(role, c) ||
    canFinanceReview(role, c) ||
    canFinanceManagerReview(role, c) ||
    canResolveComplaint(role, c) ||
    canCloseComplaint(role, c)
  );
}

// ── Timeline ──────────────────────────────────────────────────────────────────

export type ComplaintTimelineState = 'done' | 'current' | 'todo';

export type ComplaintTimelineStep = {
  /** Status yang mewakili tahap ini. */
  status: ComplaintStatus;
  /** Role pemegang tahap. */
  actor: string;
  /** Ringkasan hasil tahap ("Investigasi selesai", "Menunggu review", …). */
  detail: string;
  state: ComplaintTimelineState;
};

/**
 * Urutan tahap alur berbasis level. Hanya tahap yang relevan dengan level tiket
 * yang ikut: LEVEL_1 tanpa Finance/Compliance, LEVEL_3 tanpa Finance.
 */
function levelStages(level?: ComplaintLevel | null): ComplaintStatus[] {
  const finance: ComplaintStatus[] = ['FINANCE_STAFF_REVIEW', 'FINANCE_MANAGER_REVIEW'];
  const middle: ComplaintStatus[] =
    level === 'LEVEL_2' ? finance : level === 'LEVEL_3' ? ['COMPLIANCE_REVIEW'] : [];
  return [
    'OPEN',
    'OPERATION_INVESTIGATION',
    'COO_REVIEW',
    ...middle,
    'COMPLAINT_HANDLING_FINALIZATION',
  ];
}

/** Kapan tiap tahap dianggap selesai — diturunkan dari timestamp keputusannya. */
const STAGE_COMPLETED_AT: Record<string, (c: Complaint) => string | null | undefined> = {
  OPEN:                            (c) => c.data_verified_at,
  OPERATION_INVESTIGATION:         (c) => c.operation_investigated_at,
  COO_REVIEW:                      (c) => c.coo_reviewed_at,
  FINANCE_STAFF_REVIEW:            (c) => c.finance_reviewed_at,
  FINANCE_MANAGER_REVIEW:          (c) => c.finance_manager_reviewed_at,
  COMPLIANCE_REVIEW:               (c) => c.compliance_reviewed_at ?? c.aml_reviewed_at,
  COMPLAINT_HANDLING_FINALIZATION: (c) => c.closed_at ?? c.resolved_at,
};

const STAGE_DONE_DETAIL: Record<string, string> = {
  OPEN:                            'Data diterima',
  OPERATION_INVESTIGATION:         'Investigasi selesai',
  COO_REVIEW:                      'Disetujui',
  FINANCE_STAFF_REVIEW:            'Review selesai',
  FINANCE_MANAGER_REVIEW:          'Review selesai',
  COMPLIANCE_REVIEW:               'Review selesai',
  COMPLAINT_HANDLING_FINALIZATION: 'Selesai',
};

/** Tiket berada di alur COO kalau statusnya tahap baru atau COO sudah memutus. */
export function isLevelFlowComplaint(c?: Complaint | null): boolean {
  if (!c) return false;
  return (
    c.coo_reviewed_at != null ||
    OTHER_ROLE_STAGES.includes(c.status ?? '') ||
    c.status === 'COMPLAINT_HANDLING_FINALIZATION'
  );
}

/**
 * Timeline tahap untuk detail pengaduan. Hanya tahap yang relevan dengan level
 * tiket yang muncul — LEVEL_1 tidak menampilkan Finance/Compliance sama sekali.
 * Tahap dianggap selesai kalau timestamp keputusannya sudah terisi; tahap
 * berjalan diambil dari status saat ini.
 */
export function complaintTimeline(c?: Complaint | null): ComplaintTimelineStep[] {
  if (!c) return [];
  const stages = levelStages(c.complaint_level);
  const finished = c.status === 'RESOLVED' || c.status === 'CLOSED';
  // Status yang bukan tahap tersendiri di timeline tapi menandai tahap mana
  // yang sedang berjalan (tiket ditahan masih milik Compliance).
  const currentStage = c.status === 'COMPLIANCE_HOLD' ? 'COMPLIANCE_REVIEW' : c.status;

  return stages.map((status) => {
    const completedAt = STAGE_COMPLETED_AT[status]?.(c);
    // Tahap bisa dikunjungi ulang setelah RETURN — status saat ini menang atas
    // timestamp keputusan lama supaya tahap berjalan tetap benar.
    const isCurrent = !finished && currentStage === status;
    const state: ComplaintTimelineState = isCurrent
      ? 'current'
      : completedAt || finished
        ? 'done'
        : 'todo';
    const pending =
      status === 'COMPLIANCE_REVIEW' && c.status === 'COMPLIANCE_HOLD'
        ? 'Ditahan Compliance'
        : status === 'COMPLAINT_HANDLING_FINALIZATION'
          ? 'Finalisasi'
          : 'Menunggu review';
    return {
      status,
      actor: COMPLAINT_STAGE_LABELS[status] ?? status,
      detail:
        state === 'done'
          ? STAGE_DONE_DETAIL[status] ?? 'Selesai'
          : state === 'current'
            ? pending
            : 'Belum dimulai',
      state,
    };
  });
}
