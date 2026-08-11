// src/lib/transfers.ts
// Transfer Recording v2 (SNAP-ready) types + API helpers.

import { apiFetch } from "./api";

// ── Transfer permission helpers ───────────────────────────────────────────────
// Workflow: FrontDesk creates/submits → OperationSupervisor reviews → FinanceStaff reviews →
//           FinanceManager approves → FinanceManager sets result.
// SystemAdmin and Director have full access at every step.

export function canCreateTransfer(role: string | null | undefined): boolean {
  return role === 'FrontDesk' || role === 'SystemAdmin' || role === 'Director';
}

/**
 * Role yang boleh membuka /transfers dan /transfers/:id. ComplaintHandling dan
 * Auditor sengaja di luar daftar — backend menolak mereka dengan 403, jadi UI
 * lain tidak boleh menawarkan tautan ke sana.
 */
export const TRANSFER_VIEW_ROLES = [
  'FrontDesk',
  'OperationSupervisor',
  'ComplianceLead',
  'FinanceStaff',
  'FinanceManager',
  'SystemAdmin',
  'Director',
];

export function canViewTransfers(role: string | null | undefined): boolean {
  return !!role && TRANSFER_VIEW_ROLES.includes(role);
}

export function canSubmitTransfer(role: string | null | undefined): boolean {
  return role === 'FrontDesk' || role === 'SystemAdmin' || role === 'Director';
}

export function canSupervisorReviewTransfer(role: string | null | undefined): boolean {
  return role === 'OperationSupervisor' || role === 'SystemAdmin' || role === 'Director';
}

/** FrontDesk/Admin who may escalate a DRAFT transfer into compliance review. */
export function canSubmitTransferComplianceReview(role: string | null | undefined): boolean {
  return role === 'FrontDesk' || role === 'SystemAdmin' || role === 'Director';
}

/** ComplianceLead/Admin who may decide a PENDING_COMPLIANCE_REVIEW transfer. */
export function canDecideTransferComplianceReview(role: string | null | undefined): boolean {
  return role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';
}

export function canFinanceReviewTransfer(role: string | null | undefined): boolean {
  return role === 'FinanceStaff' || role === 'SystemAdmin' || role === 'Director';
}

export function canApproveTransfer(role: string | null | undefined): boolean {
  return role === 'FinanceManager' || role === 'SystemAdmin' || role === 'Director';
}

export function canUpdateTransferResult(role: string | null | undefined): boolean {
  return role === 'FinanceManager' || role === 'SystemAdmin' || role === 'Director';
}

export type TransferStatus =
  | "DRAFT"
  | "PENDING_COMPLIANCE_REVIEW"
  | "SUBMITTED"
  | "PENDING_FINANCE_STAFF_REVIEW"
  | "PENDING_FINANCE_MANAGER_APPROVAL"
  | "REVISION_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED";

/**
 * Statuses FrontDesk may still edit and (re)submit. REVISION_REQUIRED is a
 * transfer FinanceStaff returned for correction — non-final, and resubmitting
 * replays the whole flow (screening → supervisor → finance → manager).
 */
export const EDITABLE_TRANSFER_STATUSES: readonly TransferStatus[] = ["DRAFT", "REVISION_REQUIRED"];

export function isEditableTransferStatus(status?: TransferStatus | string | null): boolean {
  return EDITABLE_TRANSFER_STATUSES.includes(status as TransferStatus);
}

export type TransferResult = "SUCCESS" | "FAILED" | null;

// ── Compliance Review (migration 0050) ───────────────────────────────────────

/** Internal red-flag checklist shown when escalating to compliance review. */
export const TRANSFER_RED_FLAGS = [
  ["AMOUNT_NOT_MATCH_PROFILE", "Nominal tidak sesuai profil"],
  ["PURPOSE_NOT_MATCH_PROFILE", "Tujuan transaksi tidak sesuai profil"],
  ["UNUSUAL_FREQUENCY", "Frekuensi transaksi tidak wajar"],
  ["UNUSUAL_VOLUME", "Volume transaksi tidak wajar"],
  ["NEW_BENEFICIARY_HIGH_AMOUNT", "Beneficiary baru dengan nominal besar"],
  ["STRUCTURING_PATTERN", "Pola transaksi terindikasi pecah nominal"],
  ["RBA_HIGH", "Profil risiko tinggi"],
  ["RBA_INCOMPLETE", "RBA belum lengkap"],
  ["WATCHLIST_NEAR_MATCH", "Watchlist near match"],
  // Raised automatically by beneficiary screening on submit (not user-picked).
  ["WATCHLIST_HIT", "Watchlist hit"],
  ["DTTOT_HIT", "DTTOT hit"],
  ["DOCUMENT_OR_INFORMATION_UNUSUAL", "Dokumen/informasi tidak wajar"],
  ["OTHER", "Lainnya"],
] as const;

/**
 * Red flags the backend sets itself from watchlist screening. They must not
 * appear in the manual "Ajukan Review Compliance" checklist — a user picking
 * them by hand would claim a screening result that never happened.
 */
export const AUTO_RED_FLAGS: readonly string[] = ["WATCHLIST_HIT", "DTTOT_HIT"];

export type TransferRedFlag = (typeof TRANSFER_RED_FLAGS)[number][0];

/** Readable label for a red-flag code (falls back to the raw code). */
export function transferRedFlagLabel(code: string): string {
  return TRANSFER_RED_FLAGS.find(([c]) => c === code)?.[1] ?? code;
}

export type ComplianceReviewAction =
  | "APPROVE_TO_CONTINUE"
  | "REJECT"
  | "REQUEST_ADDITIONAL_INFO"
  | "REQUEST_EDD"
  | "MARK_LTKM_CANDIDATE";

/** Snapshot of the latest compliance review returned in transfer detail/list. */
export type ComplianceReview = {
  id?: number | string | null;
  status?: string | null;
  red_flags?: string[] | null;
  report_notes?: string | null;
  reported_by?: number | string | null;
  reported_at?: string | null;
  reviewed_by?: number | string | null;
  reviewed_at?: string | null;
  // Backend belum mengirim nama aktor untuk snapshot compliance review — sampai
  // ada, UI menampilkan em dash daripada ID numerik internal.
  reported_by_name?: string | null;
  reviewed_by_name?: string | null;
  decision_notes?: string | null;
};

/** One beneficiary-name match against the watchlist, recorded on submit. */
export type WatchlistHit = {
  list_type: string | null;
  input_name: string | null;
  matched_name: string | null;
  matched_field: string | null;
  match_score: number | string | null;
  unique_id: string | null;
  subject_type: string | null;
  created_at: string | null;
};

/** Sanction lists that must block a transfer rather than merely warn. */
const BLOCKING_LIST_TYPES = ["DTTOT", "PPPSPM", "DPPPSPM"];

export function isBlockingListType(listType?: string | null): boolean {
  return BLOCKING_LIST_TYPES.includes(String(listType ?? '').toUpperCase());
}

/** Distinct list types across a hit set, sanction lists first. */
export function watchlistListTypes(hits?: WatchlistHit[] | null): string[] {
  const seen = [...new Set((hits ?? []).map((h) => String(h.list_type ?? '').toUpperCase()).filter(Boolean))];
  return seen.sort((a, b) => Number(isBlockingListType(b)) - Number(isBlockingListType(a)));
}

/** match_score arrives as a pg NUMERIC (string) or float — render as a percentage. */
export function formatMatchScore(score?: number | string | null): string {
  const n = Number(score);
  return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '-';
}

const MATCHED_FIELD_LABELS: Record<string, string> = {
  FULL_NAME: 'Nama Lengkap',
  ENTITY_NAME: 'Nama Entitas',
  ALIAS_NAME: 'Alias',
};

export function matchedFieldLabel(field?: string | null): string {
  const key = String(field ?? '').toUpperCase();
  return MATCHED_FIELD_LABELS[key] ?? (field || '-');
}

/**
 * Curated row returned by the list endpoint (GET /transfers).
 * Backend no longer SELECT *, so only these fields are guaranteed here.
 */
export type TransferListRow = {
  id: number;
  /** UUID publik dari backend. Identitas teknis sekunder — tampilan utama tetap
   *  partner_reference_no, dan rute masih memakai id numerik. */
  public_id?: string | null;
  partner_reference_no: string | null;
  reference_no: string | null;
  sender_application_id: number | string | null;
  // Enriched sender fields (backend now joins the sender application/CIF).
  sender_name?: string | null;
  sender_cif_no?: string | null;
  sender_cif_relationship_type?: string | null;
  sender_type?: string | null;
  amount: string; // pg NUMERIC → string
  currency: string;
  amount_value: string | null;
  amount_currency: string | null;
  beneficiary_account_name: string;
  beneficiary_account_number: string;
  beneficiary_bank_code: string | null;
  beneficiary_bank_name: string;
  beneficiary_relationship_to_sender?: string | null;
  status: TransferStatus;
  result: TransferResult;
  compliance_review_status?: string | null;
  latest_compliance_review?: ComplianceReview | null;
  // Beneficiary watchlist screening summary (list endpoint only — detail
  // carries the full `watchlist_hits` array instead).
  has_watchlist_hit?: boolean | null;
  watchlist_list_types?: string[] | null;
  // Bulk transfer batch info (migration 0057), present when created via /transfers/bulk.
  batch_id?: number | string | null;
  batch_no?: string | null;
  bulk_reference_no?: string | null;
  created_at: string;
  /** Diisi backend (waktu server) saat transfer diajukan — NULL selama DRAFT. */
  transaction_date?: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  completed_at: string | null;
  failed_at: string | null;
};

/**
 * Full detail returned by GET /transfers/:id (SELECT *).
 * All v2 fields included; everything optional/nullable for forward-compat.
 */
export type TransferDetail = TransferListRow & {
  branch_id?: number | null;
  description?: string | null;

  /** Beneficiary watchlist matches recorded at submit. Empty/absent = clean. */
  watchlist_hits?: WatchlistHit[] | null;

  // Transfer metadata (migration 0030)
  source_of_funds?: string | null;
  transaction_purpose?: string | null;

  requested_transfer_at?: string | null;
  attachment_uri?: string | null;

  external_reference_no?: string | null;
  bank_reference_no?: string | null;
  provider_reference_no?: string | null;
  result_reference_no?: string | null;

  source_account_no?: string | null;
  source_account_name?: string | null;
  source_bank_code?: string | null;
  source_bank_name?: string | null;

  beneficiary_address?: string | null;
  beneficiary_email?: string | null;
  beneficiary_customer_residence?: string | null;
  beneficiary_customer_type?: string | null;

  transfer_method?: string | null;
  transfer_channel?: string | null;
  requested_execution_date?: string | null;

  created_by?: number | string | null;
  submitted_by?: number | string | null;
  approved_by?: number | string | null;
  rejected_by?: number | string | null;
  rejected_at?: string | null;

  // Nama aktor (COALESCE(users.name, users.email)) — UI memakai ini; *_by di
  // atas hanya ID numerik internal dan tidak pernah ditampilkan ke user.
  created_by_name?: string | null;
  submitted_by_name?: string | null;
  approved_by_name?: string | null;
  rejected_by_name?: string | null;
  result_updated_by_name?: string | null;
  supervisor_reviewed_by_name?: string | null;
  finance_reviewed_by_name?: string | null;

  // FinanceStaff layer-2 review. `finance_notes` doubles as the reason shown to
  // FrontDesk when the transfer was returned (status REVISION_REQUIRED).
  finance_reviewed_by?: number | string | null;
  finance_reviewed_at?: string | null;
  finance_notes?: string | null;

  result_updated_by?: number | string | null;
  result_updated_at?: string | null;

  reject_reason?: string | null;
  decision_notes?: string | null;
  result_notes?: string | null;
  result_attachment_uri?: string | null;
  failed_reason?: string | null;

  latest_transaction_status?: string | null;
  transaction_status_desc?: string | null;
  provider_response_code?: string | null;
  provider_response_message?: string | null;

  additional_info?: Record<string, unknown> | null;
  provider_request?: Record<string, unknown> | null;
  provider_response?: Record<string, unknown> | null;

  updated_at?: string | null;
};

// ── Request payloads ─────────────────────────────────────────────────────────

/** "Hubungan dengan Pengirim" — dropdown options (free text also accepted by backend). */
export const BENEFICIARY_RELATIONSHIP_OPTIONS = [
  'Keluarga',
  'Teman',
  'Rekan Kerja',
  'Karyawan',
  'Vendor',
  'Customer',
  'Pemilik Usaha',
  'Lainnya',
] as const;

export type CreateTransferBody = {
  amount: number;
  currency?: string;
  beneficiary_relationship_to_sender: string;
  beneficiaryBankName: string;
  beneficiaryBankCode?: string;
  beneficiaryAccountNumber: string;
  beneficiaryAccountName: string;
  description?: string;
  requestedTransferAt?: string;
  sender_application_id: number;

  // Transfer metadata (migration 0030)
  source_of_funds?: string;
  transaction_purpose?: string;

  // SNAP / transfer metadata (optional, snake_case → maps 1:1 to DB)
  partner_reference_no?: string;
  source_account_no?: string;
  source_account_name?: string;
  source_bank_code?: string;
  source_bank_name?: string;
  beneficiary_address?: string;
  beneficiary_email?: string;
  beneficiary_customer_residence?: string;
  beneficiary_customer_type?: string;
  transfer_method?: string;
  transfer_channel?: string;
  // `transaction_date` sengaja tidak ada di sini: backend yang mengisinya dengan
  // waktu server saat pengajuan. FE tidak pernah mengirim tanggal transaksi.
  requested_execution_date?: string;
  additional_info?: Record<string, unknown>;
};

export type TransferReviewAction = "APPROVE" | "REJECT";

/** FinanceStaff may also RETURN a transfer for correction — non-final, sends it back to FrontDesk. */
export type FinanceReviewAction = TransferReviewAction | "RETURN";

export type TransferReviewBody = {
  action?: TransferReviewAction;
  notes?: string;
  decision?: TransferReviewAction;
  decision_notes?: string;
  reject_reason?: string;
};

/** RETURN requires `notes` — the backend rejects it without a reason. */
export type FinanceReviewBody = Omit<TransferReviewBody, "action"> & {
  action: FinanceReviewAction;
};

export type DecideTransferBody = TransferReviewBody;

export type SubmitComplianceReviewBody = {
  red_flags: string[];
  report_notes?: string;
};

export type DecideComplianceReviewBody = {
  action: ComplianceReviewAction;
  decision_notes?: string;
};

export type SetTransferResultBody = {
  result: "SUCCESS" | "FAILED";
  result_notes?: string;
  result_reference_no?: string;
  bank_reference_no?: string;
  external_reference_no?: string;
  provider_reference_no?: string;
  provider_response_code?: string;
  provider_response_message?: string;
  latest_transaction_status?: string;
  transaction_status_desc?: string;
  result_attachment_uri?: string;
  failed_reason?: string;
  provider_response?: Record<string, unknown>;
};

// ── Sender search / bank list ────────────────────────────────────────────────

/** Amount limits enforced by the backend (validated client-side too). */
export const TRANSFER_MIN_AMOUNT = 10000;
export const TRANSFER_MAX_AMOUNT = 500000000;
export const WIC_TRANSFER_MAX_AMOUNT = 100000000;

export type SenderSearchItem = {
  application_id: number | string;
  display_name?: string | null;
  cif_no?: string | null;
  cif_relationship_type?: string | null;
  application_type?: string | null;
  status?: string | null;
};

export type TransferBank = {
  code?: string | null;
  name?: string | null;
};

/** GET /transfers/senders/search — searchable sender picker source. */
export async function searchSenders(q: string, page = 1, limit = 10): Promise<SenderSearchItem[]> {
  const query = buildTransferQuery({ q, page, limit });
  const res = await apiFetch<
    SenderSearchItem[] | { data?: SenderSearchItem[]; items?: SenderSearchItem[] }
  >(`/transfers/senders/search${query}`);
  if (Array.isArray(res)) return res;
  return res.data ?? res.items ?? [];
}

/** GET /transfers/banks — dropdown source for Bank Penerima. */
export async function getTransferBanks(): Promise<TransferBank[]> {
  const res = await apiFetch<
    TransferBank[] | { data?: TransferBank[]; banks?: TransferBank[] }
  >(`/transfers/banks`);
  if (Array.isArray(res)) return res;
  return res.data ?? res.banks ?? [];
}

/** Fallback bank list used when GET /transfers/banks fails. */
export const FALLBACK_BANKS: TransferBank[] = [
  { code: 'BCA', name: 'Bank Central Asia' },
  { code: 'MANDIRI', name: 'Bank Mandiri' },
  { code: 'BRI', name: 'Bank Rakyat Indonesia' },
  { code: 'BNI', name: 'Bank Negara Indonesia' },
  { code: 'CIMB', name: 'CIMB Niaga' },
  { code: 'DANAMON', name: 'Bank Danamon' },
  { code: 'PERMATA', name: 'Bank Permata' },
  { code: 'BTN', name: 'Bank Tabungan Negara' },
  { code: 'BSI', name: 'Bank Syariah Indonesia' },
  { code: 'MAYBANK', name: 'Maybank Indonesia' },
  { code: 'OCBC', name: 'OCBC Indonesia' },
  { code: 'PANIN', name: 'Panin Bank' },
  { code: 'NOBU', name: 'Bank Nobu' },
];

function buildTransferQuery(params: Record<string, string | number | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

// ── API functions ────────────────────────────────────────────────────────────

/** `single` = normal transfers (batch_id IS NULL); `bulk_item` = bulk child transfers; `all` = unfiltered (backward compatible). */
export type TransferMode = "single" | "bulk_item" | "all";

export function getTransfers(params?: { status?: string; transfer_mode?: TransferMode }) {
  const q = buildTransferQuery({
    status: params?.status,
    transfer_mode: params?.transfer_mode && params.transfer_mode !== "all" ? params.transfer_mode : undefined,
  });
  return apiFetch<TransferListRow[]>(`/transfers${q}`);
}

export function getTransfer(id: number | string) {
  return apiFetch<TransferDetail>(`/transfers/${id}`);
}

export function getTransferSnapPreview(id: number | string) {
  return apiFetch<Record<string, unknown>>(`/transfers/${id}/snap-preview`);
}

export function createTransfer(body: CreateTransferBody) {
  return apiFetch<TransferDetail>(`/transfers`, { method: "POST", body });
}

/**
 * PATCH /transfers/:id — edit a DRAFT or returned (REVISION_REQUIRED) transfer.
 * The backend replaces the core fields outright, so send the full body.
 */
export function updateTransfer(id: number | string, body: CreateTransferBody) {
  return apiFetch<TransferDetail>(`/transfers/${id}`, { method: "PATCH", body });
}

// ── Bulk transfer (POST /transfers/bulk) ─────────────────────────────────────
// One item = one normal DRAFT transfer; sender is set once at batch level.

export type BulkTransferItem = {
  amount: number;
  beneficiary_relationship_to_sender: string;
  beneficiaryBankName: string;
  beneficiaryBankCode?: string;
  beneficiaryAccountNumber: string;
  beneficiaryAccountName: string;
  currency?: string;
  transaction_purpose?: string;
  source_of_funds?: string;
  description?: string;
};

export type CreateBulkTransferBody = {
  sender_application_id: number;
  bulk_reference_no: string;
  items: BulkTransferItem[];
};

export type BulkTransferResult = {
  batch_id: number | string;
  batch_no: string;
  bulk_reference_no: string;
  total_count: number;
  total_amount: number;
  transfers: TransferDetail[];
};

export const BULK_REFERENCE_NO_MAX_LENGTH = 150;

export const BULK_TRANSFER_MAX_ROWS = 20;

export function createBulkTransfers(body: CreateBulkTransferBody) {
  return apiFetch<BulkTransferResult>(`/transfers/bulk`, { method: "POST", body });
}

// ── Bulk batches (GET /transfers/bulk-batches) ────────────────────────────────
// One row per batch — for the Bulk Transfer list tab, as opposed to
// GET /transfers?transfer_mode=bulk_item which returns one row per child transfer.

/** Per-status transfer counts within a batch, e.g. `{ DRAFT: 5, SUBMITTED: 3 }`. */
export type BulkBatchStatusSummary = Record<string, number>;

export type BulkBatchListRow = {
  id: number | string;
  batch_no: string;
  bulk_reference_no: string;
  sender_application_id: number | string | null;
  sender_display_name?: string | null;
  total_count: number;
  total_amount: number | string;
  created_by?: number | string | null;
  created_at: string;
  updated_at?: string | null;
  status_summary?: BulkBatchStatusSummary | string | null;
};

export type BulkBatchListResponse = {
  data: BulkBatchListRow[];
  page: number;
  limit: number;
  total: number;
};

export type BulkBatchDetail = {
  batch: BulkBatchListRow;
  transfers: TransferListRow[];
};

export function getBulkTransferBatches(params?: {
  q?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}) {
  const q = buildTransferQuery({
    q: params?.q,
    date_from: params?.date_from,
    date_to: params?.date_to,
    page: params?.page,
    limit: params?.limit,
  });
  return apiFetch<BulkBatchListResponse>(`/transfers/bulk-batches${q}`);
}

export function getBulkTransferBatchById(id: number | string) {
  return apiFetch<BulkBatchDetail>(`/transfers/bulk-batches/${id}`);
}

export function submitTransfer(id: number | string) {
  return apiFetch<TransferDetail>(`/transfers/${id}/submit`, { method: "POST" });
}

/** POST /transfers/:id/submit-compliance-review — escalate a DRAFT into compliance review. */
export function submitTransferComplianceReview(
  id: number | string,
  body: SubmitComplianceReviewBody,
) {
  return apiFetch<TransferDetail>(`/transfers/${id}/submit-compliance-review`, {
    method: "POST",
    body,
  });
}

/** POST /transfers/:id/compliance-review — ComplianceLead decision on a review. */
export function decideTransferComplianceReview(
  id: number | string,
  body: DecideComplianceReviewBody,
) {
  return apiFetch<TransferDetail>(`/transfers/${id}/compliance-review`, {
    method: "POST",
    body,
  });
}

/** Rescreen stats nested in the response when the transfer is not settled (a real rewrite happened). */
export type RescreenWatchlistStats = {
  read_only: false;
  old_hit_count: number;
  new_hit_count: number;
  old_match_count: number;
  new_match_count: number;
  can_continue: boolean;
};

/** Non-final transfer: backend rewrites transfer_watchlist_hits and returns the fresh detail + stats. */
export type RescreenWatchlistLive = TransferDetail & { rescreen: RescreenWatchlistStats };

/** COMPLETED/REJECTED transfer without `force`: preview only, nothing is written. */
export type RescreenWatchlistPreview = {
  transfer_id: number;
  transfer_status: string;
  read_only: true;
  reason: string;
  old_hits: WatchlistHit[];
  new_hits: unknown[];
  old_match_count: number;
  new_match_count: number;
};

export type RescreenWatchlistResult = RescreenWatchlistLive | RescreenWatchlistPreview;

/**
 * POST /transfers/:id/rescreen-watchlist — re-evaluate stored watchlist hits
 * against current classifier rules (clears stale false positives, e.g. the
 * historical "MARIA ANIRA" vs "MIRA ARIANI" 41.2% near-match). `force` is a
 * backend-only escape hatch to rewrite a settled transfer; the UI never sends it.
 */
export function rescreenTransferWatchlist(
  id: number | string,
  payload: { force?: boolean } = {},
) {
  return apiFetch<RescreenWatchlistResult>(`/transfers/${id}/rescreen-watchlist`, {
    method: "POST",
    body: payload,
  });
}

function toActionPayload(body: TransferReviewBody | FinanceReviewBody = { action: "APPROVE" }) {
  const action = body.action ?? body.decision ?? "APPROVE";
  const notes = body.notes ?? body.decision_notes ?? body.reject_reason;

  return {
    action,
    ...(notes ? { notes } : {}),
  };
}

export function supervisorReviewTransfer(
  id: number | string,
  body: TransferReviewBody = { action: "APPROVE" },
) {
  return apiFetch<TransferDetail>(`/transfers/${id}/supervisor-review`, {
    method: "POST",
    body: toActionPayload(body),
  });
}

export function financeReviewTransfer(
  id: number | string,
  body: TransferReviewBody | FinanceReviewBody = { action: "APPROVE" },
) {
  return apiFetch<TransferDetail>(`/transfers/${id}/finance-review`, {
    method: "POST",
    body: toActionPayload(body),
  });
}

function toDecisionPayload(body: DecideTransferBody | TransferReviewBody) {
  const decision = body.decision ?? body.action ?? "APPROVE";
  const decision_notes = body.decision_notes ?? body.notes;
  const reject_reason = body.reject_reason ?? body.notes;

  return {
    decision,
    ...(decision_notes ? { decision_notes } : {}),
    ...(decision === "REJECT" && reject_reason ? { reject_reason } : {}),
  };
}

export function decideTransfer(id: number | string, body: DecideTransferBody) {
  return apiFetch<TransferDetail>(`/transfers/${id}/decision`, {
    method: "POST",
    body: toDecisionPayload(body),
  });
}

export function setTransferResult(
  id: number | string,
  body: SetTransferResultBody,
) {
  return apiFetch<TransferDetail>(`/transfers/${id}/result`, {
    method: "POST",
    body,
  });
}

// ── Display helpers ──────────────────────────────────────────────────────────

/** Format an amount with its currency; falls back to amount/currency. */
export function formatTransferAmount(t: {
  amount?: string | number | null;
  currency?: string | null;
  amount_value?: string | number | null;
  amount_currency?: string | null;
}): string {
  const rawValue = t.amount_value ?? t.amount;
  const currency = (t.amount_currency || t.currency || "IDR").toUpperCase();
  const n = Number(rawValue);
  if (rawValue === null || rawValue === undefined || Number.isNaN(n)) {
    return rawValue != null ? `${rawValue} ${currency}` : "-";
  }
  try {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    // Unknown currency code → plain number + code
    return `${new Intl.NumberFormat("id-ID").format(n)} ${currency}`;
  }
}

/** Primary reference shown to users (partner ref first, then fallbacks). */
export function transferReference(t: {
  partner_reference_no?: string | null;
  reference_no?: string | null;
  id: number | string;
}): string {
  return t.partner_reference_no || t.reference_no || `#${t.id}`;
}

export function formatDateTime(v?: string | null): string {
  if (!v) return "-";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString("id-ID");
}
