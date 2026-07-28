'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { Pagination } from '@/components/pagination';
import { toast } from '@/lib/toast';
import { formatCif } from '@/lib/utils';
import {
  listDataReviews,
  initiateDataReview,
  submitDataReview,
  decideDataReview,
  dueStatusLabel,
  reviewStatusLabel,
  periodLabel,
  canViewDataReview,
  canInitiateDataReview,
  canSubmitDataReview,
  canDecideDataReview,
  DUE_STATUS_LABELS,
  type DataReviewListItem,
  type DataReviewDecision,
} from '@/lib/data-reviews';

function fmtDate(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

function RiskBadge({ level }: { level?: string | null }) {
  if (!level) return <span className="text-slate-400">—</span>;
  const cls =
    level === 'HIGH'   ? 'bg-red-100 text-red-700' :
    level === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
    level === 'LOW'    ? 'bg-emerald-100 text-emerald-700' :
                         'bg-slate-100 text-slate-500';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{level}</span>;
}

function DueBadge({ status }: { status?: string | null }) {
  const cls =
    status === 'OVERDUE'           ? 'bg-red-100 text-red-700' :
    status === 'DUE'               ? 'bg-orange-100 text-orange-700' :
    status === 'DUE_SOON'          ? 'bg-amber-100 text-amber-700' :
    status === 'NOT_DUE'           ? 'bg-emerald-100 text-emerald-700' :
    status === 'NEED_RISK_SCORE'   ? 'bg-purple-100 text-purple-700' :
                                     'bg-slate-100 text-slate-500';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{dueStatusLabel(status)}</span>;
}

function ReviewBadge({ status }: { status?: string | null }) {
  const cls =
    status === 'SUBMITTED'             ? 'bg-blue-100 text-blue-700' :
    status === 'DRAFT'                 ? 'bg-slate-100 text-slate-600' :
    status === 'APPROVED'              ? 'bg-emerald-100 text-emerald-700' :
    status === 'RETURNED_FOR_REVISION' ? 'bg-orange-100 text-orange-700' :
    status === 'REJECTED'              ? 'bg-red-100 text-red-700' :
                                         'bg-slate-100 text-slate-400';
  return <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>{reviewStatusLabel(status)}</span>;
}

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

const REVIEW_STATUS_OPTIONS = ['DRAFT', 'SUBMITTED', 'APPROVED', 'RETURNED_FOR_REVISION', 'REJECTED'];

export default function DataReviewsPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  // filters
  const [q, setQ] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [dueStatus, setDueStatus] = useState('');
  const [reviewStatus, setReviewStatus] = useState('');
  const [customerType, setCustomerType] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<DataReviewListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  // row-level action state
  const [busyId, setBusyId] = useState<number | null>(null);
  const [decisionFor, setDecisionFor] = useState<{ row: DataReviewListItem; decision: DataReviewDecision } | null>(null);
  const [reason, setReason] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await listDataReviews({
          page, limit,
          q: q || undefined,
          risk_level: riskLevel || undefined,
          due_status: dueStatus || undefined,
          review_status: reviewStatus || undefined,
          customer_type: customerType || undefined,
        });
        if (!alive) return;
        setRows(res.data ?? []);
        setTotal(res.total ?? 0);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat data pengkinian');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page, limit, q, riskLevel, dueStatus, reviewStatus, customerType, reload]);

  const resetPage = () => setPage(1);

  if (!canViewDataReview(role)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman Pengkinian Data.
      </div>
    );
  }

  const showInitiate = canInitiateDataReview(role);
  const showSubmit = canSubmitDataReview(role);
  const showDecide = canDecideDataReview(role);

  // Summary is derived from the current page only — backend does not expose aggregates yet.
  // ponytail: per-page counts; swap for a backend summary endpoint when totals must be global.
  const summary = {
    overdue: rows.filter((r) => r.due_status === 'OVERDUE').length,
    dueSoon: rows.filter((r) => r.due_status === 'DUE_SOON').length,
    submitted: rows.filter((r) => r.active_review?.status === 'SUBMITTED').length,
    returned: rows.filter((r) => r.active_review?.status === 'RETURNED_FOR_REVISION').length,
  };

  async function run(id: number, fn: () => Promise<unknown>, okMsg: string) {
    setBusyId(id);
    try {
      await fn();
      toast.success(okMsg);
      setDecisionFor(null);
      setReason('');
      setReload((n) => n + 1);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Aksi gagal. Silakan coba lagi.');
    } finally {
      setBusyId(null);
    }
  }

  function confirmDecision() {
    if (!decisionFor) return;
    const { row, decision } = decisionFor;
    if (decision !== 'APPROVED' && !reason.trim()) {
      toast.error('Alasan wajib diisi untuk aksi ini.');
      return;
    }
    run(
      row.application_id,
      () => decideDataReview(row.application_id, { decision, reason: reason.trim() || undefined }),
      decision === 'APPROVED' ? 'Pengkinian data disetujui.'
        : decision === 'REJECTED' ? 'Pengkinian data ditolak.'
        : 'Pengkinian data dikembalikan untuk revisi.',
    );
  }

  const hasFilter = q || riskLevel || dueStatus || reviewStatus || customerType;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Pengkinian Data</h1>
        <p className="text-sm text-slate-500">
          Pantau jadwal dan proses pengkinian data pengguna jasa berdasarkan tingkat risiko.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Terlambat" value={summary.overdue} loading={loading} />
        <SummaryCard label="Akan Jatuh Tempo" value={summary.dueSoon} loading={loading} />
        <SummaryCard label="Menunggu Review Compliance" value={summary.submitted} loading={loading} />
        <SummaryCard label="Dikembalikan untuk Revisi" value={summary.returned} loading={loading} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Cari</label>
          <input
            type="text"
            placeholder="CIF atau nama…"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm w-52 outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Risk Level</label>
          <select
            value={riskLevel}
            onChange={(e) => { setRiskLevel(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Risk Level</option>
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Due Status</label>
          <select
            value={dueStatus}
            onChange={(e) => { setDueStatus(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Due Status</option>
            {Object.entries(DUE_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status Pengkinian</label>
          <select
            value={reviewStatus}
            onChange={(e) => { setReviewStatus(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Status</option>
            {REVIEW_STATUS_OPTIONS.map((k) => (
              <option key={k} value={k}>{reviewStatusLabel(k)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Jenis</label>
          <select
            value={customerType}
            onChange={(e) => { setCustomerType(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Jenis</option>
            <option value="INDIVIDUAL">Individual</option>
            <option value="BUSINESS">Business</option>
          </select>
        </div>
        {hasFilter && (
          <button
            onClick={() => {
              setQ(''); setRiskLevel(''); setDueStatus(''); setReviewStatus(''); setCustomerType(''); resetPage();
            }}
            className="rounded-lg border px-3 py-2 text-sm text-slate-500 hover:bg-slate-50"
          >
            Reset
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Worklist */}
      <div className="rounded-2xl border overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium whitespace-nowrap">CIF</th>
              <th className="px-3 py-3 font-medium">Nama Pengguna Jasa</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Jenis</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Risk Level</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Periode</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Tanggal Submit Pertama</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Jatuh Tempo</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Due Status</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Status Pengkinian</th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-400">Memuat…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-slate-400">Belum ada data pengkinian.</td></tr>
            ) : (
              rows.map((r) => {
                const active = r.active_review;
                const busy = busyId === r.application_id;
                const canStart = showInitiate && !active;
                const canSend = showSubmit && (active?.status === 'DRAFT' || active?.status === 'RETURNED_FOR_REVISION');
                const canJudge = showDecide && active?.status === 'SUBMITTED';
                return (
                  <tr key={r.application_id} className="border-t hover:bg-slate-50 transition-colors align-top">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600 break-all">{formatCif(r.cif_no)}</td>
                    <td className="px-3 py-3 min-w-[160px]">
                      <div className="font-medium text-slate-800 whitespace-normal break-words">{r.customer_name ?? '—'}</div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">
                      {r.customer_type === 'BUSINESS' ? 'Business' : r.customer_type === 'INDIVIDUAL' ? 'Individual' : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap"><RiskBadge level={r.risk_level} /></td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">{periodLabel(r.review_period_years)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">{fmtDate(r.first_submitted_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">{fmtDate(r.due_at)}</td>
                    <td className="px-3 py-3 whitespace-nowrap"><DueBadge status={r.due_status} /></td>
                    <td className="px-3 py-3 whitespace-nowrap"><ReviewBadge status={active?.status} /></td>
                    <td className="px-3 py-3 text-right whitespace-nowrap">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Link
                          href={`/users/${r.application_id}`}
                          className="text-xs font-medium text-kesh-700 hover:underline whitespace-nowrap"
                        >
                          Detail
                        </Link>
                        {canStart && (
                          <button
                            disabled={busy}
                            onClick={() => run(r.application_id, () => initiateDataReview(r.application_id), 'Permintaan pengkinian data dikirim ke Frontline.')}
                            className="rounded-md bg-kesh-700 px-2.5 py-1 text-xs font-medium text-white hover:bg-kesh-600 disabled:opacity-60 whitespace-nowrap"
                          >
                            Minta Pengkinian Data
                          </button>
                        )}
                        {canSend && (
                          <button
                            disabled={busy}
                            onClick={() => run(r.application_id, () => submitDataReview(r.application_id), 'Hasil pengkinian data diajukan untuk review Compliance.')}
                            className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60 whitespace-nowrap"
                          >
                            {active?.status === 'RETURNED_FOR_REVISION' ? 'Ajukan Ulang Hasil Pengkinian' : 'Ajukan Hasil Pengkinian'}
                          </button>
                        )}
                        {canJudge && (
                          <>
                            <button
                              disabled={busy}
                              onClick={() => run(r.application_id, () => decideDataReview(r.application_id, { decision: 'APPROVED' }), 'Pengkinian data disetujui.')}
                              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-60 whitespace-nowrap"
                            >
                              Setujui
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => { setDecisionFor({ row: r, decision: 'RETURN_FOR_REVISION' }); setReason(''); }}
                              className="rounded-md bg-orange-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-60 whitespace-nowrap"
                            >
                              Kembalikan untuk Revisi
                            </button>
                            <button
                              disabled={busy}
                              onClick={() => { setDecisionFor({ row: r, decision: 'REJECTED' }); setReason(''); }}
                              className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60 whitespace-nowrap"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
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

      {/* Reason modal — required for Kembalikan / Tolak */}
      {decisionFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 space-y-3">
            <p className="text-sm font-semibold text-slate-800">
              {decisionFor.decision === 'REJECTED' ? 'Tolak Pengkinian Data' : 'Kembalikan untuk Revisi'}
            </p>
            <p className="text-xs text-slate-500 break-words">
              {decisionFor.row.customer_name ?? '—'} · {formatCif(decisionFor.row.cif_no)}
            </p>
            <div className="space-y-1">
              <label className="text-xs text-slate-500">Alasan <span className="text-red-600">*</span></label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Isi alasan…"
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { setDecisionFor(null); setReason(''); }}
                className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
              >
                Batal
              </button>
              <button
                onClick={confirmDecision}
                disabled={busyId !== null}
                className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-60"
              >
                {busyId !== null ? 'Menyimpan…' : 'Konfirmasi'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
