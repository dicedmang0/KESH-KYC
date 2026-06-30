// src/lib/transfers.ts
// Transfer Recording v2 (SNAP-ready) types + API helpers.

import { apiFetch } from "./api";

export type TransferStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "APPROVED"
  | "REJECTED"
  | "COMPLETED";

export type TransferResult = "SUCCESS" | "FAILED" | null;

/**
 * Curated row returned by the list endpoint (GET /transfers).
 * Backend no longer SELECT *, so only these fields are guaranteed here.
 */
export type TransferListRow = {
  id: number;
  partner_reference_no: string | null;
  reference_no: string | null;
  sender_application_id: number | string | null;
  amount: string; // pg NUMERIC → string
  currency: string;
  amount_value: string | null;
  amount_currency: string | null;
  beneficiary_account_name: string;
  beneficiary_account_number: string;
  beneficiary_bank_code: string | null;
  beneficiary_bank_name: string;
  status: TransferStatus;
  result: TransferResult;
  created_at: string;
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
  transaction_date?: string | null;
  requested_execution_date?: string | null;

  created_by?: number | string | null;
  submitted_by?: number | string | null;
  approved_by?: number | string | null;
  rejected_by?: number | string | null;
  rejected_at?: string | null;
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

export type CreateTransferBody = {
  amount: number;
  currency?: string;
  beneficiaryBankName: string;
  beneficiaryBankCode?: string;
  beneficiaryAccountNumber: string;
  beneficiaryAccountName: string;
  description?: string;
  requestedTransferAt?: string;
  sender_application_id: number;

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
  transaction_date?: string;
  requested_execution_date?: string;
  additional_info?: Record<string, unknown>;
};

export type DecideTransferBody = {
  decision: "APPROVE" | "REJECT";
  decision_notes?: string;
  reject_reason?: string;
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

// ── API functions ────────────────────────────────────────────────────────────

export function getTransfers(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
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

export function submitTransfer(id: number | string) {
  return apiFetch<TransferDetail>(`/transfers/${id}/submit`, { method: "POST" });
}

export function decideTransfer(id: number | string, body: DecideTransferBody) {
  return apiFetch<TransferDetail>(`/transfers/${id}/decision`, {
    method: "POST",
    body,
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
