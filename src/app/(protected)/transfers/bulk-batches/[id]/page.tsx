'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  getBulkTransferBatchById,
  formatTransferAmount,
  transferReference,
  formatDateTime,
  type BulkBatchDetail,
} from '@/lib/transfers';
import { TransferStatusBadge, WatchlistHitBadge } from '@/components/transfer-badges';

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-sm font-medium break-words">
        {empty ? <span className="text-neutral-400 font-normal">-</span> : value}
      </div>
    </div>
  );
}

export default function BulkBatchDetailPage() {
  const router = useRouter();
  const params = useParams();
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [data, setData] = useState<BulkBatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!id) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr('');
      try {
        const res = await getBulkTransferBatchById(id);
        if (alive) setData(res);
      } catch (e: unknown) {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat detail bulk batch');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  const batch = data?.batch;
  const transfers = data?.transfers ?? [];

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Bulk Batch {batch?.batch_no ?? `#${id}`}</h1>
          <p className="text-sm text-neutral-500">Detail batch transfer bulk (read-only)</p>
        </div>
        <button className="text-sm text-kesh-700 hover:underline" onClick={() => router.push('/transfers')}>
          Kembali
        </button>
      </div>

      {err && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && <div className="text-sm text-neutral-500">Memuat detail…</div>}

      {batch && (
        <>
          <div className="rounded-2xl border p-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-700">Ringkasan Batch</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Batch No" value={<span className="font-mono">{batch.batch_no}</span>} />
              <Field label="No. Referensi Bulk" value={<span className="font-mono">{batch.bulk_reference_no}</span>} />
              <Field label="Sender" value={batch.sender_display_name} />
              <Field label="Total Item" value={batch.total_count} />
              <Field label="Total Nominal" value={formatTransferAmount({ amount: batch.total_amount, currency: 'IDR' })} />
              <Field
                label="Status Summary"
                value={
                  typeof batch.status_summary === 'string'
                    ? batch.status_summary
                    : batch.status_summary
                      ? Object.entries(batch.status_summary).map(([s, c]) => `${s}: ${c}`).join(', ')
                      : undefined
                }
              />
              <Field label="Dibuat Pada" value={formatDateTime(batch.created_at)} />
            </div>
          </div>

          <div className="rounded-2xl border overflow-x-auto">
            <div className="grid grid-cols-12 gap-2 bg-muted/40 px-4 py-3 text-xs font-medium min-w-[900px]">
              <div className="col-span-2">Referensi</div>
              <div className="col-span-2">Nama Penerima</div>
              <div className="col-span-2">Bank Penerima</div>
              <div className="col-span-2">Rekening Penerima</div>
              <div className="col-span-2 text-right">Nominal</div>
              <div className="col-span-1">Status</div>
              <div className="col-span-1 text-right">Aksi</div>
            </div>

            {transfers.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">Tidak ada transfer pada batch ini.</div>
            ) : (
              transfers.map((t) => (
                <div key={t.id} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm border-t items-center min-w-[900px]">
                  <div className="col-span-2 font-mono text-xs break-all">{transferReference(t)}</div>
                  <div className="col-span-2 break-words">
                    {t.beneficiary_account_name}
                    {t.has_watchlist_hit && (
                      <div className="mt-1">
                        <WatchlistHitBadge hasHit listTypes={t.watchlist_list_types} />
                      </div>
                    )}
                  </div>
                  <div className="col-span-2 break-words">{t.beneficiary_bank_name}</div>
                  <div className="col-span-2 break-all">{t.beneficiary_account_number}</div>
                  <div className="col-span-2 font-medium text-right whitespace-nowrap">{formatTransferAmount(t)}</div>
                  <div className="col-span-1 whitespace-nowrap"><TransferStatusBadge status={t.status} /></div>
                  <div className="col-span-1 text-right whitespace-nowrap">
                    <Link className="text-sm text-kesh-700 hover:underline font-medium" href={`/transfers/${t.id}`}>
                      Detail
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
