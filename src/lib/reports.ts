// src/lib/reports.ts — Report Center types + API helpers.

import { apiFetch } from './api';

// ── Enums ─────────────────────────────────────────────────────────────────────

export type ReportType = 'ALL' | 'KYC_KYB' | 'LTKT' | 'LTKM' | 'TRANSFERS' | 'COMPLAINTS';
export type ReportFormat = 'XLSX' | 'CSV';
export type GenerationMode = 'ON_DEMAND' | 'SCHEDULED_DAILY' | 'SCHEDULED_MONTHLY';
export type ReportStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';

// ── Entity ────────────────────────────────────────────────────────────────────

export type Report = {
  id: number | string;
  report_no?: string | null;
  report_type?: ReportType | null;
  generation_mode?: GenerationMode | null;
  format?: ReportFormat | null;
  status?: ReportStatus | null;
  period_start?: string | null;
  period_end?: string | null;
  cutoff_at?: string | null;
  as_of?: string | null;
  row_counts?: Record<string, number> | number | null;
  file_name?: string | null;
  file_size?: number | null;
  generated_by?: string | null;
  generated_at?: string | null;
  completed_at?: string | null;
  error_message?: string | null;
};

export type ReportStatusResponse = {
  id: number | string;
  report_no?: string | null;
  status?: ReportStatus | null;
  error_message?: string | null;
  row_counts?: Record<string, number> | number | null;
  completed_at?: string | null;
};

export type GenerateReportPayload = {
  report_type: ReportType;
  format: ReportFormat;
  period_start: string;
  period_end: string;
  filters?: Record<string, unknown>;
};

export type ReportsQuery = {
  report_type?: string;
  generation_mode?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
};

export type PaginatedResponse<T> = {
  data: T[];
  page: number;
  limit: number;
  total: number;
};

// ── API functions ─────────────────────────────────────────────────────────────

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const q = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return q ? `?${q}` : '';
}

export function generateReport(payload: GenerateReportPayload) {
  return apiFetch<Report>('/reports/generate', { method: 'POST', body: payload });
}

export async function listReports(params: ReportsQuery = {}): Promise<PaginatedResponse<Report>> {
  const raw = await apiFetch<PaginatedResponse<Report> | { items?: Report[]; total?: number } | Report[]>(
    `/reports${buildQuery(params as Record<string, string | number | undefined>)}`
  );
  // Normalize the paginated shape defensively (data[] vs items[] vs bare array).
  if (Array.isArray(raw)) return { data: raw, page: 1, limit: raw.length, total: raw.length };
  const data = ('data' in raw ? raw.data : raw.items) ?? [];
  return {
    data,
    page: ('page' in raw && raw.page) || params.page || 1,
    limit: ('limit' in raw && raw.limit) || params.limit || 10,
    total: raw.total ?? data.length,
  };
}

export function getReportStatus(id: number | string) {
  return apiFetch<ReportStatusResponse>(`/reports/${id}/status`);
}

export function downloadReport(id: number | string) {
  return apiFetch<{ download_url: string; expires_in?: number; file_name?: string }>(
    `/reports/${id}/download`
  );
}

// ── Display labels ────────────────────────────────────────────────────────────

export const REPORT_TYPE_LABELS: Record<string, string> = {
  ALL: 'Semua Report',
  KYC_KYB: 'KYC/KYB',
  LTKT: 'LTKT',
  LTKM: 'LTKM',
  TRANSFERS: 'Pencatatan Transfer',
  COMPLAINTS: 'Pengaduan',
};

export const GENERATION_MODE_LABELS: Record<string, string> = {
  ON_DEMAND: 'On-demand',
  SCHEDULED_DAILY: 'Harian',
  SCHEDULED_MONTHLY: 'Bulanan',
};

export const REPORT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Menunggu Diproses',
  PROCESSING: 'Sedang Diproses',
  COMPLETED: 'Selesai',
  FAILED: 'Gagal',
  EXPIRED: 'Kedaluwarsa',
};

export const REPORT_STATUS_CLASSES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  COMPLETED: 'bg-emerald-100 text-emerald-700',
  FAILED: 'bg-red-100 text-red-700',
  EXPIRED: 'bg-slate-100 text-slate-500',
};

export function formatReportType(t?: string | null): string {
  return (t && REPORT_TYPE_LABELS[t]) || t || '—';
}

export function formatGenerationMode(m?: string | null): string {
  return (m && GENERATION_MODE_LABELS[m]) || m || '—';
}

export function formatReportStatus(s?: string | null): string {
  return (s && REPORT_STATUS_LABELS[s]) || s || '—';
}

/** Sum row_counts whether it's a number or a per-sheet record. */
export function totalRowCount(rc?: Record<string, number> | number | null): number | null {
  if (rc == null) return null;
  if (typeof rc === 'number') return rc;
  return Object.values(rc).reduce((a, b) => a + (Number(b) || 0), 0);
}

/** Human-readable file size (bytes → KB/MB). */
export function formatFileSize(bytes?: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
