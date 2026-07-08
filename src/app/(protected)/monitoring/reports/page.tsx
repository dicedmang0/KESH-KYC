'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { Pagination } from '@/components/pagination';
import {
  getMonitoringReports,
  formatCaseType,
  formatCaseStatus,
  formatReportStatus,
  formatDate,
  formatDateTime,
  REPORT_STATUS_LABELS,
  type MonitoringReport,
} from '@/lib/monitoring';

// ── Badge helpers ─────────────────────────────────────────────────────────────

function ReportStatusBadge({ status }: { status?: string | null }) {
  const cls =
    status === 'DRAFT'                ? 'bg-slate-100 text-slate-500' :
    status === 'READY_TO_SUBMIT'      ? 'bg-teal-100 text-teal-700' :
    status === 'SUBMITTED'            ? 'bg-green-100 text-green-700' :
    status === 'REJECTED_BY_REGULATOR'? 'bg-red-100 text-red-700' :
    status === 'ARCHIVED'             ? 'bg-slate-100 text-slate-400' :
                                        'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatReportStatus(status)}
    </span>
  );
}

function CaseTypeBadge({ type }: { type?: string | null }) {
  const cls =
    type === 'LTKT' ? 'bg-blue-100 text-blue-700' :
    type === 'LTKM' ? 'bg-purple-100 text-purple-700' :
    type === 'BOTH' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatCaseType(type)}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

// Director is intentionally excluded — backend returns 403 for the reports endpoint.
const ALLOWED_ROLES = new Set(['SystemAdmin', 'ComplianceLead', 'Auditor']);

export default function MonitoringReportsPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [reportStatus, setReportStatus] = useState('');
  const [reportType, setReportType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<MonitoringReport[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const resetPage = () => setPage(1);
  const allowed = ALLOWED_ROLES.has(role ?? '');

  useEffect(() => {
    if (!allowed) return;
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await getMonitoringReports({
          page,
          limit,
          report_status: reportStatus || undefined,
          report_type: reportType || undefined,
        });
        if (!alive) return;
        setRows(res.data ?? []);
        setTotal(res.total ?? 0);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat antrean laporan');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page, limit, reportStatus, reportType, allowed]);

  if (!allowed) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman ini.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/monitoring" className="text-sm text-slate-500 hover:text-slate-800">← Monitoring</Link>
          <h1 className="text-xl font-semibold mt-1">Antrean Laporan Regulasi</h1>
          <p className="text-sm text-slate-500">LTKT/LTKM siap dan sudah dilaporkan ke regulator</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status Laporan</label>
          <select
            value={reportStatus}
            onChange={(e) => { setReportStatus(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Status</option>
            {(Object.keys(REPORT_STATUS_LABELS) as string[]).map((k) => (
              <option key={k} value={k}>{REPORT_STATUS_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tipe Laporan</label>
          <select
            value={reportType}
            onChange={(e) => { setReportType(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Tipe</option>
            <option value="LTKT">LTKT</option>
            <option value="LTKM">LTKM</option>
          </select>
        </div>
        {(reportStatus || reportType) && (
          <button
            onClick={() => { setReportStatus(''); setReportType(''); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            Reset
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Table */}
      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium">No. Case</th>
              <th className="px-3 py-3 font-medium">Tipe Laporan</th>
              <th className="px-3 py-3 font-medium">Status Laporan</th>
              <th className="px-3 py-3 font-medium">Nama Customer</th>
              <th className="px-3 py-3 font-medium">CIF</th>
              <th className="px-3 py-3 font-medium">Status Case</th>
              <th className="px-3 py-3 font-medium">Jatuh Tempo</th>
              <th className="px-3 py-3 font-medium">No. Referensi</th>
              <th className="px-3 py-3 font-medium">Tgl Dilaporkan</th>
              <th className="px-3 py-3 font-medium text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-400">Memuat…</td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-400">
                  Belum ada laporan dalam antrean.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t hover:bg-slate-50 transition-colors align-middle">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-800">
                    {r.case_no ?? `#${r.case_id ?? r.id}`}
                  </td>
                  <td className="px-3 py-3"><CaseTypeBadge type={r.report_type ?? r.case_type} /></td>
                  <td className="px-3 py-3"><ReportStatusBadge status={r.report_status} /></td>
                  <td className="px-3 py-3 text-slate-800">{r.customer_name ?? '—'}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{r.cif_no ?? '—'}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{formatCaseStatus(r.case_status)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{formatDate(r.due_date)}</td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">
                    {r.report_reference_no ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(r.reported_at)}</td>
                  <td className="px-3 py-3 text-right">
                    {r.case_id && (
                      <Link
                        href={`/monitoring/${r.case_id}`}
                        className="text-sm font-medium text-kesh-700 hover:underline"
                      >
                        Detail
                      </Link>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={limit}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        disabled={loading}
      />
    </div>
  );
}
