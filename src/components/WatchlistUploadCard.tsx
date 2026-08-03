'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiUpload } from '@/lib/api';
import { Pagination } from '@/components/pagination';
import {
  getWatchlistHistory,
  UPLOAD_STATUS_LABEL,
  type ListType,
  type UploadStatus,
  type WatchlistHistoryItem,
} from '@/lib/watchlist';

type OverwriteStrategy = 'merge' | 'replace';

type RowError = { row: number | string; message: string };

/**
 * A row that was inserted but looks like an existing entry (same list type,
 * normalised name, DOB and nationality under a different Unique ID). Warning
 * only — the row is stored and the upload can still be SUCCESS.
 */
type DuplicateWarning = {
  row?: number | string;
  name?: string;
  list_type?: string;
  unique_id?: string | null;
  existing_unique_ids?: (string | null)[];
  message?: string;
};

type UploadResponse = {
  status?: UploadStatus;
  ok?: boolean;
  total?: number;
  success?: number;
  error_count?: number;
  errors?: string;
  row_errors?: RowError[];
  count?: number; // legacy field
  inserted_count?: number;
  updated_count?: number;
  skipped_count?: number;
  warning_count?: number;
  duplicate_warnings?: DuplicateWarning[];
};

type UploadResult = {
  status: UploadStatus;
  message: string;
  rowErrors: RowError[];
  errorsText: string | null;
  counts: {
    total: number;
    success: number;
    inserted: number;
    updated: number;
    skipped: number;
    warnings: number;
  };
  duplicateWarnings: DuplicateWarning[];
};

function formatJumlah(h: WatchlistHistoryItem): string {
  if (h.total == null) return '-';
  const base = `${h.success ?? 0}/${h.total}`;
  return h.error_count > 0
    ? `${base} berhasil, ${h.error_count} gagal`
    : base;
}

function HistoryStatusBadge({ status }: { status?: UploadStatus | string | null }) {
  const cls =
    status === 'SUCCESS'
      ? 'bg-emerald-100 text-emerald-700'
      : status === 'PARTIAL'
      ? 'bg-amber-100 text-amber-700'
      : status === 'FAILED'
      ? 'bg-red-100 text-red-700'
      : 'bg-neutral-100 text-neutral-600';
  const label = (status && UPLOAD_STATUS_LABEL[status]) || status || '-';
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>
      {label}
    </span>
  );
}

export default function WatchlistUploadCard({ onUploaded }: { onUploaded?: () => void }) {
  const [listType, setListType] = useState<ListType>('PEP');
  const [listSource, setListSource] = useState('BNPT'); 
  const [strategy, setStrategy] = useState<OverwriteStrategy>('merge');
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [history, setHistory] = useState<WatchlistHistoryItem[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLimit, setHistoryLimit] = useState(10);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await getWatchlistHistory({ page: historyPage, limit: historyLimit });
      setHistory(res.data);
      setHistoryTotal(res.total);
    } catch (e: unknown) {
      console.error('Gagal load history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage, historyLimit]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory, historyRefreshKey]);

  function buildResult(res: UploadResponse): UploadResult {
    const total = Number(res.total ?? 0);
    const success = Number(res.success ?? res.count ?? 0);
    const errorCount = Number(res.error_count ?? 0);
    const rowErrors = Array.isArray(res.row_errors) ? res.row_errors : [];
    const errorsText =
      typeof res.errors === 'string' && res.errors.trim() ? res.errors.trim() : null;
    const duplicateWarnings = Array.isArray(res.duplicate_warnings) ? res.duplicate_warnings : [];

    // Duplicate warnings never affect the status — they are advisory only.
    const counts = {
      total,
      success,
      inserted: Number(res.inserted_count ?? 0),
      updated: Number(res.updated_count ?? 0),
      skipped: Number(res.skipped_count ?? errorCount),
      warnings: Number(res.warning_count ?? duplicateWarnings.length),
    };

    const isFailed =
      res.status === 'FAILED' || res.ok === false || success === 0;

    if (isFailed) {
      return {
        status: 'FAILED',
        message: 'Upload gagal. Tidak ada baris yang berhasil diproses.',
        rowErrors,
        errorsText,
        counts,
        duplicateWarnings,
      };
    }

    if (res.status === 'PARTIAL') {
      return {
        status: 'PARTIAL',
        message: `Upload selesai sebagian. ${success} dari ${total} baris berhasil diproses, ${errorCount} baris gagal.`,
        rowErrors,
        errorsText,
        counts,
        duplicateWarnings,
      };
    }

    return {
      status: 'SUCCESS',
      message: `Upload ${listType} (${listSource}) berhasil. ${success} dari ${total} baris berhasil diproses.`,
      rowErrors,
      errorsText,
      counts,
      duplicateWarnings,
    };
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);
    setErr(null);

    if (!file) {
      setErr('Silakan pilih file Excel/CSV terlebih dahulu.');
      return;
    }

    const form = new FormData();
    form.append('file', file);
    form.append('list_type', listType);
    form.append('list_source', listSource);
    form.append('overwrite_strategy', strategy);

    setLoading(true);
    try {
      const res = (await apiUpload('/watchlist/upload', form)) as UploadResponse;
      const built = buildResult(res);
      setResult(built);
      setFile(null);
      // reset ke halaman 1 & reload riwayat setelah upload (SUCCESS/PARTIAL/FAILED)
      setHistoryPage(1);
      setHistoryRefreshKey((k) => k + 1);
      // beri tahu halaman agar refresh data entries (SUCCESS / PARTIAL)
      if (built.status !== 'FAILED') onUploaded?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal upload watchlist');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
      <h2 className="text-sm font-semibold">
        Upload Watchlist (PEP / DTTOT / PPPSPM)
      </h2>

      <form onSubmit={handleUpload} className="space-y-3 text-xs">
        {/* --- Upload Form --- */}
        <div className="flex flex-col gap-1">
          <label className="font-medium" htmlFor="watchlist-list-type">Jenis list</label>
          <select
            id="watchlist-list-type"
            className="w-full rounded-md border border-neutral-300 px-2 py-1 bg-white"
            value={listType}
            onChange={(e) => setListType(e.target.value as ListType)}
          >
            <option value="PEP">PEP</option>
            <option value="DTTOT">DTTOT</option>
            <option value="PPPSPM">PPPSPM</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium" htmlFor="watchlist-list-source">Sumber list</label>
          <input
            id="watchlist-list-source"
            className="w-full rounded-md border border-neutral-300 px-2 py-1"
            value={listSource}
            onChange={(e) => setListSource(e.target.value)}
            placeholder="Contoh: PPATK, BNPT, UN, Internal"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium">Strategi overwrite</label>
          <select
            className="w-full rounded-md border border-neutral-300 px-2 py-1 bg-white"
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as OverwriteStrategy)}
          >
            <option value="merge">Merge</option>
            <option value="replace">Replace</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium" htmlFor="watchlist-file">File Excel/CSV</label>
          <input
            id="watchlist-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-[11px] text-neutral-500">
            Pastikan Jenis list yang dipilih sesuai dengan Watchlist_Type pada file.
            Untuk file campuran, pisahkan upload per jenis list: PEP, DTTOT, atau PPPSPM.
          </p>
        </div>

        {err && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

        {result && (
          <div
            className={
              result.status === 'SUCCESS'
                ? 'rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700 space-y-1'
                : result.status === 'PARTIAL'
                ? 'rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700 space-y-1'
                : 'rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 space-y-1'
            }
          >
            <p>{result.message}</p>

            <dl className="grid grid-cols-3 gap-x-3 gap-y-1 pt-1 sm:grid-cols-6">
              {([
                ['Total baris', result.counts.total],
                ['Berhasil', result.counts.success],
                ['Data baru', result.counts.inserted],
                ['Diperbarui', result.counts.updated],
                ['Gagal/dilewati', result.counts.skipped],
                ['Peringatan', result.counts.warnings],
              ] as const).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-[11px] opacity-70">{label}</dt>
                  <dd className="text-sm font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            {result.rowErrors.length > 0 ? (
              <ul className="list-disc pl-4 space-y-0.5">
                {result.rowErrors.slice(0, 5).map((re, i) => (
                  <li key={i}>{`Baris ${re.row}: ${re.message}`}</li>
                ))}
                {result.rowErrors.length > 5 && (
                  <li className="list-none pl-0">
                    dan {result.rowErrors.length - 5} error lainnya
                  </li>
                )}
              </ul>
            ) : (
              result.errorsText && <p>{result.errorsText}</p>
            )}
          </div>
        )}

        {result && result.duplicateWarnings.length > 0 && (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 space-y-2">
            <p className="font-semibold">
              Peringatan Kemungkinan Duplikat ({result.duplicateWarnings.length})
            </p>
            <p className="text-[11px]">
              Baris tetap tersimpan. Nama berikut mirip dengan entri yang sudah ada namun
              memakai Unique ID berbeda.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border border-amber-200 bg-white text-[11px]">
                <thead className="bg-amber-100/60">
                  <tr>
                    <th className="border border-amber-200 px-2 py-1 text-left">Baris</th>
                    <th className="border border-amber-200 px-2 py-1 text-left">Nama</th>
                    <th className="border border-amber-200 px-2 py-1 text-left">Jenis List</th>
                    <th className="border border-amber-200 px-2 py-1 text-left">Unique ID</th>
                    <th className="border border-amber-200 px-2 py-1 text-left">Unique ID Terdaftar</th>
                    <th className="border border-amber-200 px-2 py-1 text-left">Pesan</th>
                  </tr>
                </thead>
                <tbody>
                  {result.duplicateWarnings.map((w, i) => (
                    <tr key={`${w.unique_id ?? 'dup'}-${w.row ?? i}`}>
                      <td className="border border-amber-200 px-2 py-1">{w.row ?? '-'}</td>
                      <td className="border border-amber-200 px-2 py-1 font-medium">{w.name || '-'}</td>
                      <td className="border border-amber-200 px-2 py-1">{w.list_type || '-'}</td>
                      <td className="border border-amber-200 px-2 py-1 font-mono">{w.unique_id || '-'}</td>
                      <td className="border border-amber-200 px-2 py-1 font-mono break-all">
                        {(w.existing_unique_ids ?? []).filter(Boolean).join(', ') || '-'}
                      </td>
                      <td className="border border-amber-200 px-2 py-1">{w.message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center rounded-md bg-kesh-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-kesh-600 disabled:opacity-40 transition-colors"
        >
          {loading ? 'Mengunggah...' : 'Upload'}
        </button>
      </form>

      {/* --- History Table --- */}
      <div className="mt-4">
        <h3 className="text-sm font-medium mb-2">Riwayat Upload</h3>
        {loadingHistory ? (
          <p className="text-xs text-neutral-500">Memuat...</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-neutral-500">Belum ada riwayat upload.</p>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full border border-neutral-200 rounded-md">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="border px-2 py-1 text-left">ID</th>
                  <th className="border px-2 py-1 text-left">Jenis List</th>
                  <th className="border px-2 py-1 text-left">Sumber List</th>
                  <th className="border px-2 py-1 text-left">Diunggah Pada</th>
                  <th className="border px-2 py-1 text-left">Diunggah Oleh</th>
                  <th className="border px-2 py-1 text-left">Jumlah</th>
                  <th className="border px-2 py-1 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="border px-2 py-1">{h.id}</td>
                    <td className="border px-2 py-1">{h.list_type}</td>
                    <td className="border px-2 py-1">{h.source_list}</td>
                    <td className="border px-2 py-1">
                      {h.uploaded_at ? new Date(h.uploaded_at).toLocaleString('id-ID') : '-'}
                    </td>
                    <td className="border px-2 py-1">{h.uploaded_by ?? '-'}</td>
                    <td className="border px-2 py-1">{formatJumlah(h)}</td>
                    <td className="border px-2 py-1">
                      <HistoryStatusBadge status={h.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <Pagination
          page={historyPage}
          pageSize={historyLimit}
          total={historyTotal}
          onPageChange={setHistoryPage}
          onPageSizeChange={(s) => { setHistoryLimit(s); setHistoryPage(1); }}
          disabled={loadingHistory}
          pageSizeOptions={[10]}
        />
      </div>
    </div>
  );
}
