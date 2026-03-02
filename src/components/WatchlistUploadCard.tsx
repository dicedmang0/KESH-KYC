'use client';

import { useState, useEffect } from 'react';
import { apiUpload, apiFetch } from '@/lib/api';

type ListType = 'PEP' | 'DTTOT' | 'PPPSPM';
type OverwriteStrategy = 'merge' | 'replace';

type WatchlistHistoryItem = {
  id: number;
  list_type: ListType;
  list_source: string;
  created_at: string;
  created_by: string; // bisa sesuaikan jika ingin username/email
  count: number;
};

export default function WatchlistUploadCard() {
  const [listType, setListType] = useState<ListType>('PEP');
  const [listSource, setListSource] = useState('BNPT'); 
  const [strategy, setStrategy] = useState<OverwriteStrategy>('merge');
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [history, setHistory] = useState<WatchlistHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  async function loadHistory() {
    setLoadingHistory(true);
    try {
      const data = await apiFetch<WatchlistHistoryItem[]>('/watchlist/history?limit=20');
      setHistory(data);
    } catch (e: any) {
      console.error('Gagal load history:', e);
    } finally {
      setLoadingHistory(false);
    }
  }

  useEffect(() => {
    loadHistory();
  }, []);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
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
      const res = await apiUpload('/watchlist/upload', form);
      const processedCount = (res as any)?.count ?? 0;
      setMsg(`Upload ${listType} (${listSource}) berhasil. ${processedCount} baris berhasil diproses.`);
      setFile(null);
      await loadHistory(); // reload history setelah upload
    } catch (e: any) {
      setErr(e?.message || 'Gagal upload watchlist');
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
          <label className="font-medium">Jenis list</label>
          <select
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
          <label className="font-medium">Sumber list</label>
          <input
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
          <label className="font-medium">File Excel/CSV</label>
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {err && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
        {msg && <div className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{msg}</div>}

        <button
          type="submit"
          disabled={loading}
          className="inline-flex items-center rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
        >
          {loading ? 'Mengunggah...' : 'Upload'}
        </button>
      </form>

      {/* --- History Table --- */}
      <div className="mt-4">
        <h3 className="text-sm font-medium mb-2">Riwayat Upload</h3>
        {loadingHistory ? (
          <p className="text-xs text-neutral-500">Loading...</p>
        ) : history.length === 0 ? (
          <p className="text-xs text-neutral-500">Belum ada riwayat upload.</p>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full border border-neutral-200 rounded-md">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="border px-2 py-1 text-left">ID</th>
                  <th className="border px-2 py-1 text-left">List Type</th>
                  <th className="border px-2 py-1 text-left">List Source</th>
                  <th className="border px-2 py-1 text-left">Diupload pada</th>
                  <th className="border px-2 py-1 text-left">Diupload oleh</th>
                  <th className="border px-2 py-1 text-left">Count</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td className="border px-2 py-1">{h.id}</td>
                    <td className="border px-2 py-1">{h.list_type}</td>
                    <td className="border px-2 py-1">{h.list_source}</td>
                    <td className="border px-2 py-1">{new Date(h.created_at).toLocaleString()}</td>
                    <td className="border px-2 py-1">{h.created_by}</td>
                    <td className="border px-2 py-1">{h.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
