'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { Pagination } from '@/components/pagination';
import { formatCif } from '@/lib/utils';
import {
  getMonitoringCases,
  formatCaseStatus,
  formatCaseType,
  formatSeverity,
  formatDate,
  formatDateTime,
  CASE_STATUS_LABELS,
  type MonitoringCase,
} from '@/lib/monitoring';

// ── Badge helpers ─────────────────────────────────────────────────────────────

function SeverityBadge({ severity }: { severity?: string | null }) {
  const cls =
    severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
    severity === 'HIGH'     ? 'bg-orange-100 text-orange-700' :
    severity === 'MEDIUM'   ? 'bg-amber-100 text-amber-700' :
    severity === 'LOW'      ? 'bg-emerald-100 text-emerald-700' :
                              'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatSeverity(severity)}
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

function StatusBadge({ status }: { status?: string | null }) {
  const cls =
    status === 'DETECTED'                ? 'bg-orange-100 text-orange-700' :
    status === 'UNDER_COMPLIANCE_REVIEW' ? 'bg-blue-100 text-blue-700' :
    status === 'NEED_CLARIFICATION'      ? 'bg-amber-100 text-amber-700' :
    status === 'CLOSED_FALSE_POSITIVE'   ? 'bg-slate-100 text-slate-500' :
    status === 'COMPLIANCE_APPROVED'     ? 'bg-teal-100 text-teal-700' :
    status === 'COMPLIANCE_REJECTED'     ? 'bg-red-100 text-red-700' :
    status === 'PENDING_DIRECTOR_REVIEW' ? 'bg-purple-100 text-purple-700' :
    status === 'DIRECTOR_APPROVED'       ? 'bg-emerald-100 text-emerald-700' :
    status === 'DIRECTOR_REJECTED'       ? 'bg-red-100 text-red-700' :
    status === 'READY_TO_REPORT'         ? 'bg-teal-100 text-teal-700' :
    status === 'REPORTED'                ? 'bg-green-100 text-green-700' :
    status === 'ARCHIVED'                ? 'bg-slate-100 text-slate-400' :
                                           'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatCaseStatus(status)}
    </span>
  );
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ label, value, loading }: { label: string; value: number; loading: boolean }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">
        {loading ? <span className="inline-block h-7 w-10 animate-pulse rounded bg-slate-100" /> : value}
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['SystemAdmin', 'ComplianceLead', 'Director', 'Auditor']);

export default function MonitoringPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const isDirector = role === 'Director';

  // filters
  const [q, setQ] = useState('');
  const [caseType, setCaseType] = useState('');
  const [status, setStatus] = useState('');
  const [reportType, setReportType] = useState('');
  const [dueBefore, setDueBefore] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  // table data
  const [rows, setRows] = useState<MonitoringCase[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // summary cards
  const [summary, setSummary] = useState({ total: 0, compliance: 0, director: 0, ready: 0, reported: 0 });
  const [summaryLoading, setSummaryLoading] = useState(true);

  // fetch summary once on mount
  useEffect(() => {
    // Director only ever sees PENDING_DIRECTOR_REVIEW cases — one card is enough.
    if (isDirector) {
      getMonitoringCases({ limit: 1, page: 1, status: 'PENDING_DIRECTOR_REVIEW' })
        .then((dir) => {
          setSummary({ total: 0, compliance: 0, director: dir.total, ready: 0, reported: 0 });
        })
        .catch(() => {})
        .finally(() => setSummaryLoading(false));
      return;
    }
    Promise.all([
      getMonitoringCases({ limit: 1, page: 1 }),
      getMonitoringCases({ limit: 1, page: 1, status: 'UNDER_COMPLIANCE_REVIEW' }),
      getMonitoringCases({ limit: 1, page: 1, status: 'PENDING_DIRECTOR_REVIEW' }),
      getMonitoringCases({ limit: 1, page: 1, status: 'READY_TO_REPORT' }),
      getMonitoringCases({ limit: 1, page: 1, status: 'REPORTED' }),
    ])
      .then(([all, comp, dir, ready, rep]) => {
        setSummary({
          total: all.total,
          compliance: comp.total,
          director: dir.total,
          ready: ready.total,
          reported: rep.total,
        });
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));
  }, [isDirector]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await getMonitoringCases({
          page, limit,
          q: q || undefined,
          case_type: caseType || undefined,
          // Director is scoped to PENDING_DIRECTOR_REVIEW (also enforced by backend).
          status: isDirector ? 'PENDING_DIRECTOR_REVIEW' : (status || undefined),
          report_type: reportType || undefined,
          due_before: dueBefore || undefined,
        });
        if (!alive) return;
        setRows(res.data ?? []);
        setTotal(res.total ?? 0);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat data monitoring');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page, limit, q, caseType, status, reportType, dueBefore, isDirector]);

  const resetPage = () => setPage(1);

  if (!ALLOWED_ROLES.has(role ?? '')) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman Monitoring.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{isDirector ? 'Monitoring Dirut' : 'Transaction Monitoring'}</h1>
          <p className="text-sm text-slate-500">
            {isDirector ? 'Case yang menunggu review Direktur Utama' : 'Pemantauan LTKT dan LTKM'}
          </p>
        </div>
        {!isDirector && (
          <Link
            href="/monitoring/reports"
            className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
          >
            Antrean Laporan →
          </Link>
        )}
      </div>

      {/* Summary cards */}
      {isDirector ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Menunggu Review Dirut" value={summary.director} loading={summaryLoading} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <SummaryCard label="Total Case" value={summary.total} loading={summaryLoading} />
          <SummaryCard label="Menunggu Compliance" value={summary.compliance} loading={summaryLoading} />
          <SummaryCard label="Menunggu Dirut" value={summary.director} loading={summaryLoading} />
          <SummaryCard label="Siap Lapor" value={summary.ready} loading={summaryLoading} />
          <SummaryCard label="Terlapor" value={summary.reported} loading={summaryLoading} />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Cari</label>
          <input
            type="text"
            placeholder="No. case, nama, CIF…"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm w-52 outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Tipe</label>
          <select
            value={caseType}
            onChange={(e) => { setCaseType(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Tipe</option>
            <option value="LTKT">LTKT</option>
            <option value="LTKM">LTKM</option>
            <option value="BOTH">LTKT + LTKM</option>
          </select>
        </div>
        {isDirector ? (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <div className="rounded-lg border bg-slate-50 px-3 py-2 text-sm text-slate-500">
              Menunggu Review Dirut
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); resetPage(); }}
              className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
            >
              <option value="">Semua Status</option>
              {Object.entries(CASE_STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Report Type</label>
          <select
            value={reportType}
            onChange={(e) => { setReportType(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua</option>
            <option value="LTKT">LTKT</option>
            <option value="LTKM">LTKM</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Jatuh Tempo Sebelum</label>
          <input
            type="date"
            value={dueBefore}
            onChange={(e) => { setDueBefore(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
          />
        </div>
        {(q || caseType || status || reportType || dueBefore) && (
          <button
            onClick={() => { setQ(''); setCaseType(''); setStatus(''); setReportType(''); setDueBefore(''); resetPage(); }}
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
              <th className="px-3 py-3 font-medium">Tipe</th>
              <th className="px-3 py-3 font-medium">Nama Customer</th>
              <th className="px-3 py-3 font-medium">CIF</th>
              <th className="px-3 py-3 font-medium">Severity</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Jatuh Tempo</th>
              <th className="px-3 py-3 font-medium">Terdeteksi</th>
              <th className="px-3 py-3 font-medium">Ringkasan Trigger</th>
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
                <td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-400">Belum ada case monitoring.</td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50 transition-colors align-top">
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs font-medium text-slate-800">{c.case_no ?? `#${c.id}`}</div>
                  </td>
                  <td className="px-3 py-3"><CaseTypeBadge type={c.case_type} /></td>
                  <td className="px-3 py-3">
                    <div className="font-medium text-slate-800">{c.customer_name ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600">{formatCif(c.cif_no)}</td>
                  <td className="px-3 py-3"><SeverityBadge severity={c.severity} /></td>
                  <td className="px-3 py-3"><StatusBadge status={c.status} /></td>
                  <td className="px-3 py-3 text-xs text-slate-600">{formatDate(c.due_date)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600">{formatDateTime(c.detected_at)}</td>
                  <td className="px-3 py-3 text-xs text-slate-600 max-w-xs">
                    {c.trigger_summary ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/monitoring/${c.id}`}
                      className="text-sm font-medium text-kesh-700 hover:underline"
                    >
                      Detail
                    </Link>
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
