'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getRoleFromToken } from '@/lib/api';
import {
  getTransfers,
  formatTransferAmount,
  transferReference,
  canCreateTransfer,
  type TransferListRow,
} from '@/lib/transfers';
import { useAuth } from '@/app/providers';
import { formatCif } from '@/lib/utils';
import { Pagination } from '@/components/pagination';
import { TransferStatusBadge, TransferResultBadge } from '@/components/transfer-badges';

export default function TransfersPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const [status, setStatus] = useState<string>('');
  const [rows, setRows] = useState<TransferListRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // reset page when status filter changes
  useEffect(() => { setPage(1); }, [status]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const data = await getTransfers(status || undefined);
        if (alive) setRows(data);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat transfer');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [status]);

  const pagedRows = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Pencatatan Transfer</h1>
          <p className="text-sm text-muted-foreground">Pencatatan transfer ke bank (manual)</p>
        </div>

        {canCreateTransfer(role) && (
          <Link
            href="/transfers/new"
            className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 transition-colors"
          >
            + Transfer Baru
          </Link>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm">Filter status:</label>
        <select
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
    </div>
  );
}
