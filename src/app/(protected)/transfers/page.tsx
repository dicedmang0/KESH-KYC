'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getRoleFromToken } from '@/lib/api';
import {
  getTransfers,
  getBulkTransferBatches,
  formatTransferAmount,
  transferReference,
  canCreateTransfer,
  type TransferListRow,
  type BulkBatchListRow,
  type BulkBatchStatusSummary,
} from '@/lib/transfers';
import { useAuth } from '@/app/providers';
import { formatCif } from '@/lib/utils';
import { Pagination } from '@/components/pagination';
import { TransferStatusBadge, TransferResultBadge } from '@/components/transfer-badges';

type ListTab = 'single' | 'bulk';

function StatusSummaryBadges({ value }: { value?: BulkBatchStatusSummary | string | null }) {
  if (!value) return <span className="text-neutral-400">-</span>;
  if (typeof value === 'string') return <span>{value}</span>;
  const entries = Object.entries(value);
  if (entries.length === 0) return <span className="text-neutral-400">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(([status, count]) => (
        <span
          key={status}
          className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
        >
          {status}: {count}
        </span>
      ))}
    </div>
  );
}

export default function TransfersPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const [tab, setTab] = useState<ListTab>('single');

  // ── Single Transfer tab ─────────────────────────────────────────────────
  const [status, setStatus] = useState<string>('');
  const [rows, setRows] = useState<TransferListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // reset page when status filter changes
  useEffect(() => { setPage(1); }, [status]);

  useEffect(() => {
    if (tab !== 'single') return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const data = await getTransfers({ status: status || undefined, transfer_mode: 'single' });
        if (alive) setRows(data);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat transfer');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tab, status]);

  const pagedRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  // ── Bulk Transfer tab ────────────────────────────────────────────────────
  const [bulkRows, setBulkRows] = useState<BulkBatchListRow[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkErr, setBulkErr] = useState('');
  const [bulkPage, setBulkPage] = useState(1);
  const [bulkPageSize, setBulkPageSize] = useState(20);
  const [bulkTotal, setBulkTotal] = useState(0);

  useEffect(() => {
    if (tab !== 'bulk') return;
    let alive = true;
    (async () => {
      setBulkLoading(true);
      setBulkErr('');
      try {
        const res = await getBulkTransferBatches({ page: bulkPage, limit: bulkPageSize });
        if (alive) { setBulkRows(res.data); setBulkTotal(res.total); }
      } catch (e: unknown) {
        if (alive) setBulkErr(e instanceof Error ? e.message : 'Gagal memuat bulk transfer');
      } finally {
        if (alive) setBulkLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tab, bulkPage, bulkPageSize]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pencatatan Transfer</h1>
          <p className="text-sm text-muted-foreground">Pencatatan transfer ke bank (manual)</p>
        </div>

        {canCreateTransfer(role) && (
          <div className="flex flex-wrap gap-2">
            <Link
              href="/transfers/new"
              className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 transition-colors whitespace-nowrap"
            >
              + Transfer Tunggal
            </Link>
            <Link
              href="/transfers/bulk"
              className="rounded-lg border border-kesh-700 text-kesh-700 px-4 py-2 text-sm hover:bg-kesh-50 transition-colors whitespace-nowrap"
            >
              + Transfer Bulk
            </Link>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div role="tablist" className="inline-flex rounded-lg border bg-slate-50 p-1">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'single'}
          onClick={() => setTab('single')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'single' ? 'bg-white text-kesh-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Single Transfer
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'bulk'}
          onClick={() => setTab('bulk')}
          className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
            tab === 'bulk' ? 'bg-white text-kesh-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Bulk Transfer
        </button>
      </div>

      {tab === 'single' ? (
        <>
          <div className="flex items-center gap-2">
            <label htmlFor="transfer-status-filter" className="text-sm">Filter status:</label>
            <select
              id="transfer-status-filter"
              className="border rounded-lg px-3 py-2 text-sm bg-transparent"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Semua</option>
              <option value="DRAFT">Draft</option>
              <option value="PENDING_COMPLIANCE_REVIEW">Menunggu Review Compliance</option>
              <option value="SUBMITTED">Menunggu Review Operation Supervisor</option>
              <option value="PENDING_FINANCE_STAFF_REVIEW">Menunggu Review Finance Staff</option>
              <option value="PENDING_FINANCE_MANAGER_APPROVAL">Menunggu Approval Finance Manager</option>
              <option value="REJECTED">Ditolak</option>
              <option value="COMPLETED">Selesai</option>
            </select>
          </div>

          {err && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

          <div className="rounded-2xl border overflow-x-auto">
            <div className="grid grid-cols-12 gap-2 bg-muted/40 px-4 py-3 text-xs font-medium min-w-[1100px]">
              <div className="col-span-2">Referensi</div>
              <div className="col-span-2">Pengirim</div>
              <div className="col-span-2">Penerima</div>
              <div className="col-span-2">Bank</div>
              <div className="col-span-1 text-right">Nominal</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1">Hasil</div>
              <div className="col-span-1 text-right">Aksi</div>
            </div>

            {loading ? (
              <div className="p-4 text-sm text-muted-foreground">Memuat…</div>
            ) : rows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Belum ada data.</div>
            ) : (
              pagedRows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t items-center min-w-[1100px]">
                  <div className="col-span-2 max-w-[180px]">
                    <div className="font-medium font-mono text-xs break-all">{transferReference(r)}</div>
                    <div className="text-xs text-muted-foreground">#{r.id}</div>
                  </div>
                  <div className="col-span-2 max-w-[220px] break-words">
                    <div className="font-medium">{r.sender_name ?? '—'}</div>
                    {r.sender_cif_no && (
                      <div className="text-xs text-muted-foreground font-mono">{formatCif(r.sender_cif_no)}</div>
                    )}
                    {r.sender_type && (
                      <div className="text-xs text-muted-foreground">{r.sender_type}</div>
                    )}
                    {!r.sender_name && r.sender_application_id != null && (
                      <div className="text-xs text-muted-foreground">App #{r.sender_application_id}</div>
                    )}
                  </div>
                  <div className="col-span-2 max-w-[220px] break-words">
                    <div className="font-medium">{r.beneficiary_account_name}</div>
                    <div className="text-xs text-muted-foreground break-all">{r.beneficiary_account_number}</div>
                  </div>
                  <div className="col-span-2 break-words">
                    <div className="font-medium">{r.beneficiary_bank_name}</div>
                    {r.beneficiary_bank_code && (
                      <div className="text-xs text-muted-foreground">{r.beneficiary_bank_code}</div>
                    )}
                  </div>
                  <div className="col-span-1 font-medium whitespace-nowrap text-right">{formatTransferAmount(r)}</div>
                  <div className="col-span-1 whitespace-nowrap">
                    <TransferStatusBadge status={r.status} />
                    {r.status === 'PENDING_COMPLIANCE_REVIEW' && (
                      <div className="mt-1 inline-flex items-center rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 ring-1 ring-amber-200">
                        Compliance Review
                      </div>
                    )}
                  </div>
                  <div className="col-span-1 whitespace-nowrap"><TransferResultBadge result={r.result} /></div>
                  <div className="col-span-1 text-right whitespace-nowrap">
                    <Link className="text-sm text-kesh-700 hover:underline font-medium" href={`/transfers/${r.id}`}>
                      Buka
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          <Pagination
            page={page}
            pageSize={pageSize}
            total={rows.length}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            disabled={loading}
          />
        </>
      ) : (
        <>
          {bulkErr && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{bulkErr}</div>}

          <div className="rounded-2xl border overflow-x-auto">
            <div className="grid grid-cols-12 gap-2 bg-muted/40 px-4 py-3 text-xs font-medium min-w-[1100px]">
              <div className="col-span-2">Batch No</div>
              <div className="col-span-2">No. Referensi Bulk</div>
              <div className="col-span-2">Sender</div>
              <div className="col-span-1 text-right">Total Item</div>
              <div className="col-span-2 text-right">Total Nominal</div>
              <div className="col-span-1">Status Summary</div>
              <div className="col-span-1">Dibuat Pada</div>
              <div className="col-span-1 text-right">Aksi</div>
            </div>

            {bulkLoading ? (
              <div className="p-4 text-sm text-muted-foreground">Memuat…</div>
            ) : bulkRows.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Belum ada data.</div>
            ) : (
              bulkRows.map((b) => (
                <div key={b.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t items-center min-w-[1100px]">
                  <div className="col-span-2 font-mono text-xs break-all">{b.batch_no}</div>
                  <div className="col-span-2 font-mono text-xs break-all">{b.bulk_reference_no}</div>
                  <div className="col-span-2 max-w-[220px] break-words">
                    <div className="font-medium">{b.sender_display_name ?? '—'}</div>
                    {!b.sender_display_name && b.sender_application_id != null && (
                      <div className="text-xs text-muted-foreground">App #{b.sender_application_id}</div>
                    )}
                  </div>
                  <div className="col-span-1 text-right">{b.total_count}</div>
                  <div className="col-span-2 font-medium text-right whitespace-nowrap">
                    {formatTransferAmount({ amount: b.total_amount, currency: 'IDR' })}
                  </div>
                  <div className="col-span-1"><StatusSummaryBadges value={b.status_summary} /></div>
                  <div className="col-span-1 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(b.created_at).toLocaleDateString('id-ID')}
                  </div>
                  <div className="col-span-1 text-right whitespace-nowrap">
                    <Link className="text-sm text-kesh-700 hover:underline font-medium" href={`/transfers/bulk-batches/${b.id}`}>
                      Detail
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>

          <Pagination
            page={bulkPage}
            pageSize={bulkPageSize}
            total={bulkTotal}
            onPageChange={setBulkPage}
            onPageSizeChange={(s) => { setBulkPageSize(s); setBulkPage(1); }}
            disabled={bulkLoading}
          />
        </>
      )}
    </div>
  );
}
