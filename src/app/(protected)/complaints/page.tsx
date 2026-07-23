'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { Pagination } from '@/components/pagination';
import { formatCif } from '@/lib/utils';
import {
  getComplaints,
  formatComplaintStatus,
  formatComplaintCategory,
  formatComplaintPriority,
  canCreateComplaint,
  COMPLAINT_STATUS_LABELS,
  type Complaint,
} from '@/lib/complaints';
import { formatDateTime } from '@/lib/monitoring';

// ── Badge helpers ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status?: string | null }) {
  const cls =
    status === 'OPEN'        ? 'bg-blue-100 text-blue-700' :
    status === 'IN_PROGRESS' ? 'bg-amber-100 text-amber-700' :
    status === 'RESOLVED'    ? 'bg-emerald-100 text-emerald-700' :
    status === 'CLOSED'      ? 'bg-slate-100 text-slate-500' :
                               'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatComplaintStatus(status)}
    </span>
  );
}

function PriorityBadge({ priority }: { priority?: string | null }) {
  const cls =
    priority === 'HIGH'   ? 'bg-red-100 text-red-700' :
    priority === 'MEDIUM' ? 'bg-amber-100 text-amber-700' :
    priority === 'LOW'    ? 'bg-emerald-100 text-emerald-700' :
                            'bg-slate-100 text-slate-500';
  return (
    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${cls}`}>
      {formatComplaintPriority(priority)}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(['SystemAdmin', 'ComplianceLead', 'FrontDesk', 'Auditor', 'FinanceManager']);

export default function ComplaintsPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<Complaint[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    (async () => {
      try {
        const res = await getComplaints({
          page,
          limit,
          q: q || undefined,
          status: status || undefined,
        });
        if (!alive) return;
        setRows(res.data ?? []);
        setTotal(res.total ?? 0);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : 'Gagal memuat data pengaduan');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [page, limit, q, status]);

  const resetPage = () => setPage(1);

  if (!ALLOWED_ROLES.has(role ?? '')) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman Pencatatan Pengaduan.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pencatatan Pengaduan</h1>
          <p className="text-sm text-slate-500">Daftar pengaduan customer</p>
        </div>
        {canCreateComplaint(role) && (
          <Link
            href="/complaints/new"
            className="rounded-lg bg-kesh-700 px-3 py-2 text-sm font-medium text-white hover:bg-kesh-600 transition-colors"
          >
            Catat Pengaduan
          </Link>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Cari</label>
          <input
            type="text"
            placeholder="No. pengaduan, nama, CIF…"
            value={q}
            onChange={(e) => { setQ(e.target.value); resetPage(); }}
            className="rounded-lg border px-3 py-2 text-sm w-56 outline-none focus:border-kesh-700 focus:ring-1 focus:ring-kesh-700/20"
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
            {Object.entries(COMPLAINT_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        {(q || status) && (
          <button
            onClick={() => { setQ(''); setStatus(''); resetPage(); }}
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
        <table className="w-full text-sm min-w-[900px]">
          <thead>
            <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
              <th className="px-4 py-3 font-medium whitespace-nowrap">No. Pengaduan</th>
              <th className="px-3 py-3 font-medium">Customer</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">CIF</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">No. Transaksi</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Kategori</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Prioritas</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Status</th>
              <th className="px-3 py-3 font-medium whitespace-nowrap">Tanggal</th>
              <th className="px-3 py-3 font-medium text-right whitespace-nowrap">Detail</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-400">
                  Memuat data pengaduan...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-400">
                  Belum ada pengaduan.
                </td>
              </tr>
            ) : (
              rows.map((c) => (
                <tr key={c.id} className="border-t hover:bg-slate-50 transition-colors align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-mono text-xs font-medium text-slate-800">
                      {c.complaint_no ?? `#${c.id}`}
                    </div>
                  </td>
                  <td className="px-3 py-3 min-w-[160px]">
                    <div className="font-medium text-slate-800 break-words">{c.customer_name ?? '—'}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                    {formatCif(c.cif_no)}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-slate-600 break-all max-w-[160px]">
                    {c.transaction_reference ?? '—'}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {formatComplaintCategory(c.category)}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <PriorityBadge priority={c.priority} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600 whitespace-nowrap">
                    {formatDateTime(c.created_at)}
                  </td>
                  <td className="px-3 py-3 text-right whitespace-nowrap">
                    <Link
                      href={`/complaints/${c.id}`}
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
