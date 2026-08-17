// src/lib/data-review-drafts.ts
// Pengkinian Data — draft/change-set client (ADR-047).
//
// Perbedaan penting dengan lib/data-reviews.ts: file itu mengurus WORKFLOW
// (initiate/submit/decision/worklist), file ini mengurus ISI USULAN PERUBAHAN.
// Semua mutasi di sini hanya masuk change-set; data KYC/KYB live baru berubah
// saat Compliance menyetujui.

import { apiFetch, apiUpload } from './api';

export type DraftEntityType = 'PERSON' | 'BUSINESS' | 'PARTY' | 'DOCUMENT' | 'EDD';
export type DraftOperation = 'ADD' | 'UPDATE' | 'DELETE' | 'REPLACE';
export type DraftState = 'ADDED' | 'UPDATED' | 'DELETED' | 'REPLACED' | null;

export type DataReviewChange = {
  id: number;
  public_id?: string | null;
  entity_type: DraftEntityType;
  operation: DraftOperation;
  target_id: number | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  staged_object_key?: string | null;
  promoted_at?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
};

export type DataReviewDraftMeta = {
  id: number;
  public_id?: string | null;
  review_no: string;
  status: string;
  review_type: string;
  version: number;
  submitted_version: number | null;
  changes_model: 'V1' | 'V2';
  application_id: number;
  application_status: string;
  application_type: 'INDIVIDUAL' | 'BUSINESS';
  initiated_at: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  decision_notes: string | null;
  /** FrontDesk boleh menyunting (status DRAFT / RETURNED_FOR_REVISION). */
  editable: boolean;
  has_pending_changes: boolean;
};

export type DraftPartyRow = Record<string, unknown> & {
  id: number | null;
  draft_change_id?: number;
  role?: string;
  full_name?: string;
  _draft_state: DraftState;
};

export type DraftDocumentRow = Record<string, unknown> & {
  id: number | null;
  draft_change_id?: number;
  doc_type?: string;
  file_uri?: string | null;
  _draft_state: DraftState;
};

export type DataReviewDraft = {
  review: DataReviewDraftMeta;
  current: {
    person: Record<string, unknown> | null;
    business: Record<string, unknown> | null;
    parties: Record<string, unknown>[];
    documents: Record<string, unknown>[];
    edd: Record<string, unknown> | null;
  };
  proposed: {
    person: Record<string, unknown> | null;
    business: Record<string, unknown> | null;
    parties: DraftPartyRow[];
    documents: DraftDocumentRow[];
    edd: Record<string, unknown> | null;
  };
  changes: DataReviewChange[];
};

export type StageResult = { change: DataReviewChange | null; version: number };

// ── RBAC (mirror backend) ────────────────────────────────────────────────────

/** Hanya Frontline yang menyunting draft. Compliance mereview, tidak mengarang. */
export function canEditDataReviewDraft(role?: string | null): boolean {
  return role === 'FrontDesk' || role === 'SystemAdmin' || role === 'Director';
}

/** Compliance (dan admin) yang memutuskan. */
export function canDecideDataReviewDraft(role?: string | null): boolean {
  return role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';
}

const EDITABLE_REVIEW_STATUSES = ['DRAFT', 'RETURNED_FOR_REVISION'];

export function isDraftEditable(review?: { status?: string } | null): boolean {
  return !!review?.status && EDITABLE_REVIEW_STATUSES.includes(review.status);
}

// ── Label status (Bahasa Indonesia, dipakai banner konteks) ──────────────────

export const DRAFT_STATE_LABELS: Record<string, string> = {
  ADDED: 'Ditambahkan',
  UPDATED: 'Diubah',
  DELETED: 'Dihapus',
  REPLACED: 'Diganti',
};

export function draftStateLabel(state?: DraftState): string {
  return (state && DRAFT_STATE_LABELS[state]) || '';
}

export const ENTITY_TYPE_LABELS: Record<DraftEntityType, string> = {
  PERSON: 'Data Pribadi',
  BUSINESS: 'Data Badan Usaha',
  PARTY: 'Pengurus / Pemegang Saham',
  DOCUMENT: 'Dokumen',
  EDD: 'EDD',
};

export function entityTypeLabel(t?: string | null): string {
  return (t && ENTITY_TYPE_LABELS[t as DraftEntityType]) || t || '—';
}

// ── API calls ────────────────────────────────────────────────────────────────

export function getDataReviewDraft(reviewId: number | string) {
  return apiFetch<DataReviewDraft>(`/data-reviews/${reviewId}/draft`);
}

export function listDataReviewChanges(reviewId: number | string) {
  return apiFetch<{ data: DataReviewChange[] }>(`/data-reviews/${reviewId}/changes`);
}

/** expected_version dikirim agar edit bersamaan ditolak 409, bukan saling timpa. */
export function stagePersonDraft(
  reviewId: number | string,
  patch: Record<string, unknown>,
  expectedVersion?: number,
) {
  return apiFetch<StageResult>(`/data-reviews/${reviewId}/draft/person`, {
    method: 'PATCH',
    body: { ...patch, ...(expectedVersion != null ? { expected_version: expectedVersion } : {}) },
  });
}

export function stageBusinessDraft(
  reviewId: number | string,
  patch: Record<string, unknown>,
  expectedVersion?: number,
) {
  return apiFetch<StageResult>(`/data-reviews/${reviewId}/draft/business`, {
    method: 'PATCH',
    body: { ...patch, ...(expectedVersion != null ? { expected_version: expectedVersion } : {}) },
  });
}

export function stagePartyDraft(
  reviewId: number | string,
  payload: {
    operation: 'ADD' | 'UPDATE' | 'DELETE';
    target_id?: number;
    data?: Record<string, unknown>;
    expected_version?: number;
  },
) {
  return apiFetch<StageResult>(`/data-reviews/${reviewId}/draft/parties`, {
    method: 'POST',
    body: payload,
  });
}

export function stageDocumentDraft(
  reviewId: number | string,
  payload: {
    operation: 'ADD' | 'REPLACE' | 'DELETE';
    doc_type?: string;
    file_uri?: string;
    target_id?: number;
    expected_version?: number;
  },
) {
  return apiFetch<StageResult>(`/data-reviews/${reviewId}/draft/documents`, {
    method: 'POST',
    body: payload,
  });
}

export function uploadDataReviewDocument(
  reviewId: number | string,
  payload: {
    operation: 'ADD' | 'REPLACE';
    file: File;
    doc_type?: string;
    target_id?: number;
    expected_version?: number;
  },
) {
  const form = new FormData();
  form.append('file', payload.file);
  form.append('operation', payload.operation);
  if (payload.doc_type) form.append('doc_type', payload.doc_type);
  if (payload.target_id != null) form.append('target_id', String(payload.target_id));
  if (payload.expected_version != null) {
    form.append('expected_version', String(payload.expected_version));
  }
  return apiUpload(`/data-reviews/${reviewId}/draft/documents/upload`, form, true);
}

export function stageEddDraft(
  reviewId: number | string,
  patch: Record<string, unknown>,
  expectedVersion?: number,
) {
  return apiFetch<StageResult>(`/data-reviews/${reviewId}/draft/edd`, {
    method: 'PATCH',
    body: { ...patch, ...(expectedVersion != null ? { expected_version: expectedVersion } : {}) },
  });
}

export function discardDataReviewChange(reviewId: number | string, changeId: number | string) {
  return apiFetch<{ discarded: boolean; version: number }>(
    `/data-reviews/${reviewId}/draft/changes/${changeId}`,
    { method: 'DELETE' },
  );
}

// ── Adapter CDD ──────────────────────────────────────────────────────────────
// Form KYC/KYB yang sudah ada tidak perlu tahu ia sedang menulis ke data live
// atau ke draft pengkinian. Ia cukup memanggil adapter; route/konteks yang
// menentukan implementasi mana yang dipakai.

export type CddDataSource = {
  /** true bila tulisan masuk change-set (bukan langsung ke data live). */
  readonly isDraft: boolean;
  savePerson(patch: Record<string, unknown>): Promise<unknown>;
  saveBusiness(patch: Record<string, unknown>): Promise<unknown>;
};

/** Konteks onboarding/REVISION_REQUIRED biasa — menulis langsung ke aplikasi. */
export function normalCddAdapter(applicationId: number | string): CddDataSource {
  return {
    isDraft: false,
    savePerson: (patch) =>
      apiFetch(`/applications/${applicationId}`, { method: 'PATCH', body: patch }),
    saveBusiness: (patch) =>
      apiFetch(`/applications/${applicationId}/business`, { method: 'PATCH', body: patch }),
  };
}

/** Konteks Pengkinian Data — menulis ke change-set, bukan ke data live. */
export function dataReviewDraftAdapter(
  reviewId: number | string,
  getVersion?: () => number | undefined,
): CddDataSource {
  return {
    isDraft: true,
    savePerson: (patch) => stagePersonDraft(reviewId, patch, getVersion?.()),
    saveBusiness: (patch) => stageBusinessDraft(reviewId, patch, getVersion?.()),
  };
}
