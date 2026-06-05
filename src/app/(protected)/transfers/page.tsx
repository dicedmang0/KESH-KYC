'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiFetch, getRoleFromToken } from '@/lib/api';
import { useAuth } from '@/app/providers';
import { Pagination } from '@/components/pagination';

type TransferRow = {
  id: number;
  amount: string; // dari pg NUMERIC biasanya balik string
  currency: string;
  beneficiary_bank_name: string;
  beneficiary_account_number: string;
  beneficiary_account_name: string;
  status: 'DRAFT'|'SUBMITTED'|'APPROVED'|'REJECTED'|'COMPLETED';
  result: 'SUCCESS'|'FAILED'|null;
  created_at: string;
  submitted_at: string | null;
  approved_at: string | null;
};

function formatIDR(v: string) {
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(n);
}

export default function TransfersPage() {
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const [status, setStatus] = useState<string>('');
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const q = useMemo(() => (status ? `?status=${encodeURIComponent(status)}` : ''), [status]);

  // reset page when status filter changes
  useEffect(() => { setPage(1); }, [status]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const data = await apiFetch<TransferRow[]>(`/transfers${q}`);
        if (alive) setRows(data);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal load transfers');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [q]);

  const pagedRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Transfers</h1>
          <p className="text-sm text-muted-foreground">Pencatatan transfer to bank (manual)</p>
        </div>

        {role === 'FinanceStaff' && (
          <Link
            href="/transfers/new"
            className="rounded-lg bg-black text-white px-4 py-2 text-sm hover:opacity-90"
          >
            + New Transfer
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
          <option value="">All</option>
          <option value="DRAFT">DRAFT</option>
          <option value="SUBMITTED">SUBMITTED</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
          <option value="COMPLETED">COMPLETED</option>
        </select>
      </div>

      {err && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="rounded-2xl border overflow-hidden">
        <div className="grid grid-cols-12 gap-2 bg-muted/40 px-4 py-3 text-xs font-medium">
          <div className="col-span-1">ID</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-3">Beneficiary</div>
          <div className="col-span-3">Bank / Rek</div>
          <div className="col-span-2">Amount</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        {loading ? (
          <div className="p-4 text-sm text-muted-foreground">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground">Belum ada data.</div>
        ) : (
          pagedRows.map((r) => (
            <div key={r.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t">
              <div className="col-span-1 font-medium">#{r.id}</div>
              <div className="col-span-2">
                <div className="font-medium">{r.status}</div>
                {r.result ? <div className="text-xs text-muted-foreground">{r.result}</div> : null}
              </div>
              <div className="col-span-3">
                <div className="font-medium">{r.beneficiary_account_name}</div>
                <div className="text-xs text-muted-foreground">{r.beneficiary_account_number}</div>
              </div>
              <div className="col-span-3">
                <div className="font-medium">{r.beneficiary_bank_name}</div>
              </div>
              <div className="col-span-2 font-medium">{formatIDR(r.amount)}</div>
              <div className="col-span-1 text-right">
                <Link className="text-sm underline" href={`/transfers/${r.id}`}>
                  Open
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
