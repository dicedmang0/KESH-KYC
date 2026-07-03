// src/lib/watchlist.ts
import { apiFetch } from '@/lib/api';

export type ListType = 'PEP' | 'DTTOT' | 'PPPSPM';
export type SubjectType = 'PERSON' | 'ENTITY';
export type UploadStatus = 'SUCCESS' | 'PARTIAL' | 'FAILED';

// ── Upload history ─────────────────────────────────────────────────────────
export type WatchlistHistoryItem = {
  id: number;
  list_type: string;
  source_list: string;
  uploaded_at: string;
  uploaded_by: string;
  total: number;
  success: number;
  error_count: number;
  status: UploadStatus;
  original_filename: string;
  error_message: string | null;
};

export async function getWatchlistHistory(limit = 20): Promise<WatchlistHistoryItem[]> {
  const data = await apiFetch<WatchlistHistoryItem[]>(`/watchlist/history?limit=${limit}`);
  return Array.isArray(data) ? data : [];
}

// ── Stored entries ─────────────────────────────────────────────────────────
export type WatchlistEntry = {
  id: number;
  unique_id: string | null;
  list_type: string | null;
  source_list: string | null;
  watchlist_type: string | null;
  subject_type: SubjectType | string | null;
  full_name: string | null;
  alias_name: string | null;
  entity_name: string | null;
  date_of_birth: string | null;
  raw_date_of_birth: string | null;
  place_of_birth: string | null;
  nationality: string | null;
  national_id_number: string | null;
  position_title: string | null;
  institution_name: string | null;
  address: string | null;
  sanction_number: string | null;
  source_url: string | null;
  description: string | null;
  remarks: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type WatchlistEntriesResponse = {
  data: WatchlistEntry[];
  page: number;
  limit: number;
  total: number;
};

export type WatchlistEntriesParams = {
  page?: number;
  limit?: number;
  list_type?: string;
  subject_type?: string;
  q?: string;
};

export async function getWatchlistEntries(
  params: WatchlistEntriesParams = {},
): Promise<WatchlistEntriesResponse> {
  const qs = new URLSearchParams();
  qs.set('page', String(params.page ?? 1));
  qs.set('limit', String(params.limit ?? 20));
  if (params.list_type) qs.set('list_type', params.list_type);
  if (params.subject_type) qs.set('subject_type', params.subject_type);
  if (params.q && params.q.trim()) qs.set('q', params.q.trim());

  const res = await apiFetch<WatchlistEntriesResponse>(`/watchlist/entries?${qs.toString()}`);
  return {
    data: Array.isArray(res?.data) ? res.data : [],
    page: Number(res?.page ?? params.page ?? 1),
    limit: Number(res?.limit ?? params.limit ?? 20),
    total: Number(res?.total ?? 0),
  };
}

// ── Display label helpers ──────────────────────────────────────────────────
export const SUBJECT_TYPE_LABEL: Record<string, string> = {
  PERSON: 'Orang',
  ENTITY: 'Entitas',
};

export const UPLOAD_STATUS_LABEL: Record<string, string> = {
  SUCCESS: 'Berhasil',
  PARTIAL: 'Sebagian',
  FAILED: 'Gagal',
};

export function subjectLabel(v?: string | null): string {
  if (!v) return '-';
  return SUBJECT_TYPE_LABEL[v] ?? v;
}
