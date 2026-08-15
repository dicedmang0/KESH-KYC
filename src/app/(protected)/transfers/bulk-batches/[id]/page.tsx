'use client';

import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  getBulkTransferBatchById,
  formatTransferAmount,
  transferReference,
  formatDateTime,
  canExportQlola,
  downloadQlolaExport,
  isQlolaFinalRow,
  isQlolaReviewRow,
  saveBlob,
  type BulkBatchDetail,
  type QlolaPurpose,
  type QlolaRowError,
} from '@/lib/transfers';
import {
  TransferStatusBadge,
  WatchlistHitBadge,
  transferStatusLabel,
} from '@/components/transfer-badges';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { toast } from '@/lib/toast';

/**
 * Satu item ringkasan. `min-w-0` wajib: tanpa itu, grid item punya lebar
 * minimum sebesar kontennya, sehingga referensi lama yang panjang mendorong
 * seluruh halaman melebar secara horizontal.
 */
function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div className="min-w-0">
      <div className="text-xs text-neutral-500">{label}</div>
      <div data-testid="batch-field-value" className="text-sm font-medium [overflow-wrap:anywhere]">
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

  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const showQlolaExport = canExportQlola(role);

  const [data, setData] = useState<BulkBatchDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  // Hasil percobaan unduh Qlola: daftar transfer yang datanya belum lengkap.
  // `qlolaBusy` menyimpan purpose yang sedang diproses supaya hanya tombol itu
  // yang ter-disable.
  const [qlolaBusy, setQlolaBusy] = useState<QlolaPurpose | null>(null);
  const [qlolaBlockers, setQlolaBlockers] = useState<QlolaRowError[]>([]);
  const [qlolaMessage, setQlolaMessage] = useState('');

  async function onDownloadQlola(purpose: QlolaPurpose) {
    setQlolaBusy(purpose);
    setQlolaBlockers([]);
    setQlolaMessage('');
    try {
      const { blob, fileName, eligibleCount, totalCount } = await downloadQlolaExport(id!, purpose);
      saveBlob(blob, fileName);
      const what = purpose === 'REVIEW' ? 'diunduh untuk review' : 'diekspor ke BRI Qlola';
      toast.success(
        eligibleCount === totalCount
          ? `${eligibleCount} transaksi ${what}.`
          : `${eligibleCount} dari ${totalCount} transaksi ${what}.`,
      );
    } catch (e: unknown) {
      const structured = e as { message?: string; errors?: QlolaRowError[] };
      if (Array.isArray(structured?.errors) && structured.errors.length > 0) {
        setQlolaMessage(structured.message || 'Belum siap diekspor ke BRI Qlola');
        setQlolaBlockers(structured.errors);
      } else {
        setQlolaMessage(
          structured?.message || (e instanceof Error ? e.message : 'Gagal mengunduh file BRI Qlola'),
        );
      }
    } finally {
      setQlolaBusy(null);
    }
  }

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

  // Dua populasi export dihitung dari baris anak yang sudah dimuat — bukan dari
  // status_summary, yang tidak membedakan COMPLETED/SUCCESS dari COMPLETED/FAILED.
  const reviewCount = transfers.filter(isQlolaReviewRow).length;
  const finalCount = transfers.filter(isQlolaFinalRow).length;

  // Ringkasan status: hanya yang jumlahnya > 0, dengan label bahasa Indonesia
  // yang sama dengan badge tabel. Enum mentah tidak pernah ditampilkan.
  const statusCounts = (() => {
    const raw = batch?.status_summary;
    if (!raw || typeof raw === 'string') return [];
    return Object.entries(raw)
      .filter(([, count]) => Number(count) > 0)
      .map(([status, count]) => ({ status, count: Number(count) }));
  })();

  return (
    <div className="w-full max-w-5xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold [overflow-wrap:anywhere]">
            Bulk Batch {batch?.batch_no ?? `#${id}`}
          </h1>
          <p className="text-sm text-neutral-500">Detail batch transfer bulk (read-only)</p>
        </div>
        <button
          className="text-sm text-kesh-700 hover:underline whitespace-nowrap"
          onClick={() => router.push('/transfers')}
        >
          Kembali
        </button>
      </div>

      {err && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      {loading && <div className="text-sm text-neutral-500">Memuat detail…</div>}

      {batch && (
        <>
          <div className="rounded-2xl border p-4 space-y-3">
            <h2 className="text-sm font-semibold text-neutral-700">Ringkasan Batch</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <Field label="Batch No" value={<span className="font-mono">{batch.batch_no}</span>} />
              <Field label="No. Referensi Bulk" value={<span className="font-mono">{batch.bulk_reference_no}</span>} />
              <Field label="Sender" value={batch.sender_display_name} />
              <Field label="Total Item" value={<span className="whitespace-nowrap">{batch.total_count}</span>} />
              <Field
                label="Total Nominal"
                value={
                  <span className="whitespace-nowrap">
                    {formatTransferAmount({ amount: batch.total_amount, currency: 'IDR' })}
                  </span>
                }
              />
              <Field
                label="Dibuat Pada"
                value={<span className="whitespace-nowrap">{formatDateTime(batch.created_at)}</span>}
              />
              <Field label="Rekening Debit BRI" value={batch.qlola_debit_account} />
              <Field label="Nama Pengirim" value={batch.qlola_sender_name} />
            </div>

            <div className="min-w-0">
              <div className="text-xs text-neutral-500">Status Batch</div>
              {statusCounts.length === 0 ? (
                <div className="text-sm text-neutral-400">-</div>
              ) : (
                <div className="mt-1 flex flex-wrap gap-2" data-testid="batch-status-summary">
                  {statusCounts.map(({ status, count }) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                    >
                      {transferStatusLabel(status)}: {count}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {showQlolaExport && (reviewCount > 0 || finalCount > 0) && (
              <div className="border-t pt-3 space-y-3">
                {reviewCount > 0 && (
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{reviewCount} transaksi siap direview</p>
                      <p className="text-xs text-neutral-500">
                        File ini digunakan Finance Staff untuk pengecekan rekening/data transaksi
                        sebelum approval.
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="download-qlola-review"
                      onClick={() => onDownloadQlola('REVIEW')}
                      disabled={qlolaBusy !== null}
                      className="rounded-lg border px-4 py-2 text-sm whitespace-nowrap hover:bg-slate-50 disabled:opacity-50"
                    >
                      {qlolaBusy === 'REVIEW' ? 'Menyiapkan…' : 'Download Qlola untuk Review'}
                    </button>
                  </div>
                )}

                {finalCount > 0 && (
                  <div className="flex items-start justify-between flex-wrap gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{finalCount} transaksi siap diekspor</p>
                      <p className="text-xs text-neutral-500">
                        Hanya transaksi yang sudah disetujui final yang ikut diekspor.
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid="download-qlola-final"
                      onClick={() => onDownloadQlola('FINAL')}
                      disabled={qlolaBusy !== null}
                      className="rounded-lg border px-4 py-2 text-sm whitespace-nowrap hover:bg-slate-50 disabled:opacity-50"
                    >
                      {qlolaBusy === 'FINAL' ? 'Menyiapkan…' : 'Download Qlola Final'}
                    </button>
                  </div>
                )}

                {qlolaMessage && (
                  <div
                    data-testid="qlola-blockers"
                    className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 space-y-2"
                  >
                    <div className="font-medium">{qlolaMessage}</div>
                    {qlolaBlockers.map((b) => (
                      <div key={b.reference} className="min-w-0">
                        <div className="font-mono [overflow-wrap:anywhere]">{b.reference}</div>
                        {b.bank && <div>Bank: {b.bank}</div>}
                        {/* Backend mengirim kalimat utuh — tampilkan apa adanya. */}
                        <ul className="list-disc pl-5">
                          {b.missing.map((m) => (
                            <li key={m}>{m}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/*
            Hanya wrapper ini yang boleh menggeser horizontal. Lebar kolom
            ditetapkan lewat min-w per sel supaya badge status tidak pernah
            menindih kolom Aksi — keduanya sel terpisah dengan lebar minimum
            sendiri, bukan berbagi ruang seperti grid 12-kolom sebelumnya.
          */}
          <div className="w-full max-w-full overflow-x-auto rounded-2xl border">
            <div className="min-w-[1100px]">
              <div className="flex gap-3 bg-muted/40 px-4 py-3 text-xs font-medium">
                <div className="min-w-[140px] flex-1 whitespace-nowrap">Referensi</div>
                <div className="min-w-[180px] flex-1">Nama Penerima</div>
                <div className="min-w-[190px] flex-1">Bank Penerima</div>
                <div className="min-w-[160px] flex-1 whitespace-nowrap">Rekening Penerima</div>
                <div className="min-w-[120px] flex-1 whitespace-nowrap text-right">Nominal</div>
                <div className="min-w-[210px] flex-1 whitespace-nowrap">Status</div>
                <div className="min-w-[120px] flex-1 whitespace-nowrap text-right">Aksi</div>
              </div>

              {transfers.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground">Tidak ada transfer pada batch ini.</div>
              ) : (
                transfers.map((t) => (
                  <div
                    key={t.id}
                    data-testid="batch-child-row"
                    className="flex gap-3 border-t px-4 py-3 text-sm items-center"
                  >
                    <div className="min-w-[140px] flex-1 font-mono text-xs whitespace-nowrap">
                      {transferReference(t)}
                    </div>
                    <div className="min-w-[180px] flex-1 [overflow-wrap:anywhere]">
                      {t.beneficiary_account_name}
                      {t.has_watchlist_hit && (
                        <div className="mt-1">
                          <WatchlistHitBadge hasHit listTypes={t.watchlist_list_types} />
                        </div>
                      )}
                    </div>
                    <div className="min-w-[190px] flex-1 [overflow-wrap:anywhere]">{t.beneficiary_bank_name}</div>
                    <div className="min-w-[160px] flex-1 whitespace-nowrap">{t.beneficiary_account_number}</div>
                    <div className="min-w-[120px] flex-1 font-medium text-right whitespace-nowrap">
                      {formatTransferAmount(t)}
                    </div>
                    <div className="min-w-[210px] flex-1 whitespace-nowrap" data-testid="child-status-cell">
                      <TransferStatusBadge status={t.status} />
                    </div>
                    <div
                      className="min-w-[120px] flex-1 text-right whitespace-nowrap"
                      data-testid="child-action-cell"
                    >
                      {/*
                        Baris yang menunggu Finance Staff diberi label "Review":
                        aksinya sama — buka detail transaksi anak, tempat
                        Finance Staff menyetujui atau mengembalikan untuk revisi
                        (per transaksi, bukan per batch).
                      */}
                      <Link
                        className="text-sm text-kesh-700 hover:underline font-medium"
                        href={`/transfers/${t.id}`}
                      >
                        {isQlolaReviewRow(t) ? 'Review' : 'Detail'}
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
