'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileBarChart, Download, RefreshCw } from 'lucide-react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Pagination } from '@/components/pagination';
import {
  generateReport,
  listReports,
  getReportStatus,
  downloadReport,
  formatReportType,
  formatGenerationMode,
  formatReportStatus,
  totalRowCount,
  formatFileSize,
  REPORT_TYPE_LABELS,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_CLASSES,
  type Report,
  type ReportType,
  type ReportFormat,
} from '@/lib/reports';

// ── Access roles ──────────────────────────────────────────────────────────────
const CAN_VIEW = new Set(['SystemAdmin', 'Director', 'ComplianceLead', 'Auditor']);
const CAN_GENERATE = new Set(['SystemAdmin', 'Director', 'ComplianceLead']);

// CSV can only carry a single report type — ALL / KYC_KYB are multi-sheet (XLSX only).
const CSV_BLOCKED = new Set<ReportType>(['ALL', 'KYC_KYB']);

const REPORT_TYPE_OPTIONS: ReportType[] = ['ALL', 'KYC_KYB', 'LTKT', 'LTKM', 'TRANSFERS', 'COMPLAINTS'];

// ── Date / format helpers ─────────────────────────────────────────────────────

/** date input "YYYY-MM-DD" → exact Asia/Jakarta ISO boundary. */
const jakartaStart = (d: string) => `${d}T00:00:00+07:00`;
const jakartaEnd = (d: string) => `${d}T23:59:59+07:00`;

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('id-ID');
}

function StatusBadge({ s }: { s?: string | null }) {
  const cls = (s && REPORT_STATUS_CLASSES[s]) || 'bg-slate-100 text-slate-500';
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{formatReportStatus(s)}</span>;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ReportCenterPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const canGenerate = CAN_GENERATE.has(role ?? '');

  // Generate form state
  const [reportType, setReportType] = useState<ReportType>('ALL');
  const [format, setFormat] = useState<ReportFormat>('XLSX');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [formError, setFormError] = useState('');
  const [generating, setGenerating] = useState(false);

  // Filter state
  const [fReportType, setFReportType] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fDateFrom, setFDateFrom] = useState('');
  const [fDateTo, setFDateTo] = useState('');

  // List state
  const [reports, setReports] = useState<Report[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listReports({
        report_type: fReportType || undefined,
        status: fStatus || undefined,
        date_from: fDateFrom || undefined,
        date_to: fDateTo || undefined,
        page,
        limit,
      });
      setReports(res.data);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal memuat daftar report.');
    } finally {
      setLoading(false);
    }
  }, [fReportType, fStatus, fDateFrom, fDateTo, page, limit]);

  useEffect(() => {
    if (token && CAN_VIEW.has(role ?? '')) load();
  }, [token, role, load]);

  // Poll a freshly generated report until it settles, then refresh the list.
  const pollNewReport = useCallback(
    (id: number | string, attempt = 0) => {
      pollRef.current = setTimeout(async () => {
        try {
          const s = await getReportStatus(id);
          if (s.status === 'COMPLETED' || s.status === 'FAILED' || s.status === 'EXPIRED') {
            load();
            return;
          }
        } catch {
          /* keep polling */
        }
        if (attempt < 9) pollNewReport(id, attempt + 1);
        else load();
      }, 3000);
    },
    [load]
  );

  useEffect(() => () => { if (pollRef.current) clearTimeout(pollRef.current); }, []);

  // ── Generate ────────────────────────────────────────────────────────────────
  async function onGenerate() {
    setFormError('');
    if (!periodStart || !periodEnd) {
      setFormError('Periode mulai dan periode akhir wajib diisi.');
      return;
    }
    if (periodEnd < periodStart) {
      setFormError('Periode akhir harus setelah atau sama dengan periode mulai.');
      return;
    }
    const days = (new Date(periodEnd).getTime() - new Date(periodStart).getTime()) / 86_400_000;
    if (days > 31) {
      setFormError('Maksimal periode on-demand adalah 31 hari.');
      return;
    }
    const fmt: ReportFormat = CSV_BLOCKED.has(reportType) ? 'XLSX' : format;

    setGenerating(true);
    try {
      const res = await generateReport({
        report_type: reportType,
        format: fmt,
        period_start: jakartaStart(periodStart),
        period_end: jakartaEnd(periodEnd),
        filters: {},
      });
      toast.success('Report sedang diproses.');
      setPage(1);
      await load();
      if (res?.id) pollNewReport(res.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Gagal membuat report.');
    } finally {
      setGenerating(false);
    }
  }

  // ── Download ──────────────────────────────────────────────────────────────────
  async function onDownload(id: number | string) {
    setDownloadingId(String(id));
    // Pre-open so the async response still lands in a user-gesture tab (avoids popup block).
    const newTab = window.open('about:blank', '_blank');
    try {
      const res = await downloadReport(id);
      if (res?.download_url) {
        if (newTab) newTab.location.replace(res.download_url);
        else if (!window.open(res.download_url, '_blank', 'noopener,noreferrer'))
          toast.error('Gagal mengambil link download report.');
      } else {
        newTab?.close();
        toast.error('Gagal mengambil link download report.');
      }
    } catch {
      newTab?.close();
      toast.error('Gagal mengambil link download report.');
    } finally {
      setDownloadingId(null);
    }
  }

  const csvDisabled = CSV_BLOCKED.has(reportType);

  // ── Access guard ────────────────────────────────────────────────────────────
  if (!CAN_VIEW.has(role ?? '')) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman Report Center.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <FileBarChart className="h-6 w-6 text-slate-700" />
        <div>
          <h1 className="text-xl font-semibold">Report Center</h1>
          <p className="text-xs text-slate-500">
            Generate dan download report KYC/KYB, LTKT, LTKM, transfer, dan pengaduan.
          </p>
        </div>
      </div>

      {/* Generate card / Auditor notice */}
      {canGenerate ? (
        <div className="rounded-xl border bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Generate Report</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Jenis Report</label>
              <select
                value={reportType}
                onChange={(e) => {
                  const t = e.target.value as ReportType;
                  setReportType(t);
                  if (CSV_BLOCKED.has(t)) setFormat('XLSX');
                }}
                className="rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                {REPORT_TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Format</label>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value as ReportFormat)}
                className="rounded-md border bg-white px-2 py-1.5 text-sm"
              >
                <option value="XLSX">XLSX</option>
                <option value="CSV" disabled={csvDisabled}>CSV</option>
              </select>
              {csvDisabled && (
                <p className="text-[11px] text-amber-700">
                  CSV hanya dapat digunakan untuk satu jenis report. Gunakan XLSX untuk report multi-sheet.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Periode Mulai</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600">Periode Akhir</label>
              <input
                type="date"
                value={periodEnd}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
              />
            </div>
          </div>
          {formError && <p className="mt-2 text-xs text-red-600">{formError}</p>}
          <div className="mt-3">
            <button
              onClick={onGenerate}
              disabled={generating}
              className="rounded-md bg-kesh-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-kesh-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? 'Memproses…' : 'Generate Report'}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Auditor hanya dapat melihat dan mengunduh report yang sudah dibuat.
        </div>
      )}

      {/* History */}
      <div className="rounded-xl border bg-white">
        {/* Filters */}
        <div className="flex flex-wrap items-end gap-3 border-b p-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Jenis Report</label>
            <select
              value={fReportType}
              onChange={(e) => { setFReportType(e.target.value); setPage(1); }}
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Semua</option>
              {REPORT_TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>{REPORT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Status</label>
            <select
              value={fStatus}
              onChange={(e) => { setFStatus(e.target.value); setPage(1); }}
              className="rounded-md border bg-white px-2 py-1.5 text-sm"
            >
              <option value="">Semua</option>
              {Object.entries(REPORT_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Tanggal Dari</label>
            <input
              type="date"
              value={fDateFrom}
              onChange={(e) => { setFDateFrom(e.target.value); setPage(1); }}
              className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Tanggal Sampai</label>
            <input
              type="date"
              value={fDateTo}
              onChange={(e) => { setFDateTo(e.target.value); setPage(1); }}
              className="rounded-md border px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Table */}
        <div className="p-4">
          {error ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Memuat…</p>
          ) : reports.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">Belum ada report.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="px-2 py-2 font-medium">Report No</th>
                    <th className="px-2 py-2 font-medium">Jenis Report</th>
                    <th className="px-2 py-2 font-medium">Mode</th>
                    <th className="px-2 py-2 font-medium">Format</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                    <th className="px-2 py-2 font-medium">Periode</th>
                    <th className="px-2 py-2 font-medium">Row Count</th>
                    <th className="px-2 py-2 font-medium">File Size</th>
                    <th className="px-2 py-2 font-medium">Generated At</th>
                    <th className="px-2 py-2 font-medium">Completed At</th>
                    <th className="px-2 py-2 font-medium">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => {
                    const rows = totalRowCount(r.row_counts);
                    return (
                      <tr key={String(r.id)} className="border-b last:border-0 align-top">
                        <td className="px-2 py-2 font-mono text-xs text-slate-600">{r.report_no ?? '—'}</td>
                        <td className="px-2 py-2">{formatReportType(r.report_type)}</td>
                        <td className="px-2 py-2 text-slate-600">{formatGenerationMode(r.generation_mode)}</td>
                        <td className="px-2 py-2 text-slate-600">{r.format ?? '—'}</td>
                        <td className="px-2 py-2"><StatusBadge s={r.status} /></td>
                        <td className="px-2 py-2 text-xs text-slate-600">
                          {fmtDate(r.period_start)} – {fmtDate(r.period_end)}
                        </td>
                        <td className="px-2 py-2 text-slate-600">{rows ?? '—'}</td>
                        <td className="px-2 py-2 text-slate-600">{formatFileSize(r.file_size)}</td>
                        <td className="px-2 py-2 text-xs text-slate-600">{fmtDateTime(r.generated_at)}</td>
                        <td className="px-2 py-2 text-xs text-slate-600">{fmtDateTime(r.completed_at)}</td>
                        <td className="px-2 py-2">
                          {r.status === 'COMPLETED' ? (
                            <button
                              onClick={() => onDownload(r.id)}
                              disabled={downloadingId === String(r.id)}
                              className="inline-flex items-center gap-1 rounded-md bg-kesh-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-kesh-600 disabled:opacity-50"
                            >
                              <Download className="h-3.5 w-3.5" />
                              {downloadingId === String(r.id) ? 'Memuat…' : 'Download'}
                            </button>
                          ) : r.status === 'FAILED' ? (
                            <span className="text-xs text-red-600" title={r.error_message ?? undefined}>
                              {r.error_message ? `Gagal: ${r.error_message}` : 'Gagal'}
                            </span>
                          ) : r.status === 'EXPIRED' ? (
                            <span className="text-xs text-slate-400">Kedaluwarsa</span>
                          ) : (
                            <span className="text-xs text-slate-400">Diproses</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            page={page}
            pageSize={limit}
            total={total}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
            disabled={loading}
            pageSizeOptions={[10, 20, 50]}
          />
        </div>
      </div>
    </div>
  );
}
