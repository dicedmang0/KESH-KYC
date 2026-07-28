'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { Pagination } from '@/components/pagination';
import { formatMonitoringAmount, formatDateTime, formatDate } from '@/lib/monitoring';
import {
  listStatementRefunds,
  refundStatusLabel,
  refundStatusBadgeClass,
  matchConfidenceLabel,
  canViewStatementRefund,
  canCreateStatementRefund,
  REFUND_STATUS_LABELS,
  type StatementRefundListItem,
} from '@/lib/statement-refunds';

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

function StatusBadge({ status }: { status?: string | null }) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${refundStatusBadgeClass(status)}`}>
      {refundStatusLabel(status)}
    </span>
  );
}

export default function StatementRefundsPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  // filters
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');
  const [rcvFrom, setRcvFrom] = useState('');
  const [rcvTo, setRcvTo] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<StatementRefundListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await listStatementRefunds({
          page, limit,
          q: q || undefined,
          status: status || undefined,
          statement_date_from: stmtFrom || undefined,
          statement_date_to: stmtTo || undefined,
          // input date → rentang penuh hari itu dalam waktu lokal
          received_from: rcvFrom ? new Date(`${rcvFrom}T00:00:00`).toISOString() : undefined,
          received_to: rcvTo ? new Date(`${rcvTo}T23:59:59`).toISOString() : undefined,
        });
        if (!alive) return;
        setRows(res.data ?? []);
        setTotal(res.total ?? 0);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat data refund');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page, limit, q, status, stmtFrom, stmtTo, rcvFrom, rcvTo]);

  const resetPage = () => setPage(1);

  if (!canViewStatementRefund(role)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman Pencatatan Refund.
      </div>
    );
  }

  const showCreate = canCreateStatementRefund(role);

  // Ringkasan dihitung dari halaman aktif saja — backend belum punya endpoint agregat.
  // ponytail: per-page counts; ganti kalau total global mulai dibutuhkan.
  const summary = {
    unmatched: rows.filter((r) => r.status === 'UNMATCHED').length,
    investigation: rows.filter((r) => r.status === 'NEED_INVESTIGATION').length,
    pending: rows.filter((r) => r.status === 'PENDING_APPROVAL').length,
    approved: rows.filter((r) => r.status === 'APPROVED' || r.status === 'BALANCE_CREDITED').length,
  };

  const hasFilter = q || status || stmtFrom || stmtTo || rcvFrom || rcvTo;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pencatatan Refund</h1>
          <p className="text-sm text-slate-500">
            Catat dan monitor dana refund/return dari statement bank yang perlu dicocokkan ke transaksi asal.
          </p>
        </div>
        {showCreate && (
          <Link
            href="/statement-refunds/new"
            className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 whitespace-nowrap"
          >
            Catat Refund
          </Link>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="Belum Dicocokkan" value={summary.unmatched} loading={loading} />
        <SummaryCard label="Perlu Investigasi" value={summary.investigation} loading={loading} />
        <SummaryCard label="Menunggu Approval" value={summary.pending} loading={loading} />
        <SummaryCard label="Disetujui / Menunggu Posting Saldo" value={summary.approved} loading={loading} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Cari</label>
          <input
            type="text"
            placeholder="Refund no, bank ref, complaint, transaksi, partner…"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm w-64 outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
          >
            <option value="">Semua Status</option>
            {Object.entries(REFUND_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Statement Dari</label>
          <input
            type="date"
            value={stmtFrom}
            onChange={(e) => { setStmtFrom(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Statement Sampai</label>
          <input
            type="date"
            value={stmtTo}
            onChange={(e) => { setStmtTo(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Dana Masuk Dari</label>
          <input
            type="date"
            value={rcvFrom}
            onChange={(e) => { setRcvFrom(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Dana Masuk Sampai</label>
          <input
            type="date"
            value={rcvTo}
            onChange={(e) => { setRcvTo(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
          />
        </div>
        {hasFilter && (
          <button
            onClick={() => {
              setQ(''); setStatus(''); setStmtFrom(''); setStmtTo(''); setRcvFrom(''); setRcvTo(''); resetPage();
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
              <th className="px-4 py-3 font-medium whitespace-nowrap">Refund No</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Tanggal Statement</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Tanggal Dana Masuk</th>
              <th className="px-3 py-3 font-medium">Partner</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap text-right">Nominal</th>
              <th className="px-3 py-3 font-medium">Bank Ref</th>
              <th className="px-3 py-3 font-medium">Transaksi Asal</th>
              <th className="px-3 py-3 font-medium">Complaint</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Status</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Match Confidence</th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} className="px-4 py-6 text-center text-sm text-slate-400">Memuat…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={11} className="px-4 py-6 text-center text-sm text-slate-400">Belum ada pencatatan refund.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r.id)} className="border-t hover:bg-slate-50 transition-colors align-top">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">{r.refund_no}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">{formatDate(r.statement_date)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">{formatDateTime(r.received_at)}</td>
                  <td className="px-3 py-3 min-w-[150px]">
                    <div className="font-medium text-slate-800 whitespace-normal break-words">{r.partner_name ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-right font-medium text-slate-800">
                    {formatMonitoringAmount(r.amount, r.currency ?? 'IDR')}
                  </td>
                  <td className="px-3 py-3 min-w-[120px] font-mono text-xs text-slate-600 whitespace-normal break-all">
                    {r.bank_reference_no || '—'}
                  </td>
                  <td className="px-3 py-3 min-w-[130px] text-xs text-slate-600 whitespace-normal break-all">
                    {r.original_transfer_id ? (
                      <Link href={`/transfers/${r.original_transfer_id}`} className="text-kesh-700 hover:underline">
                        {r.transfer_reference_no || `#${r.original_transfer_id}`}
                      </Link>
                    ) : (
                      <span className="text-slate-400">Belum dicocokkan</span>
                    )}
                  </td>
                  <td className="px-3 py-3 min-w-[130px] font-mono text-xs text-slate-600 whitespace-normal break-all">
                    {r.complaint_no || '—'}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-600">
                    {matchConfidenceLabel(r.match_confidence)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/statement-refunds/${r.id}`}
                      className="text-xs font-medium text-kesh-700 hover:underline whitespace-nowrap"
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
