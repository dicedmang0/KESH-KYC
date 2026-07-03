'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Pagination } from '@/components/pagination';
import {
  getWatchlistEntries,
  subjectLabel,
  type WatchlistEntry,
} from '@/lib/watchlist';

const LIST_TYPE_OPTIONS = ['', 'PEP', 'DTTOT', 'PPPSPM'] as const;
const SUBJECT_OPTIONS = ['', 'PERSON', 'ENTITY'] as const;

function fmtDate(v?: string | null): string {
  if (!v) return '-';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('id-ID');
}

function val(v?: string | null): string {
  return v && String(v).trim() ? String(v) : '-';
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1 border-b border-neutral-100 last:border-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="col-span-2 break-words">{val(value)}</dd>
    </div>
  );
}

function DetailModal({
  entry,
  onClose,
}: {
  entry: WatchlistEntry;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h3 className="text-base font-semibold">Detail Watchlist</h3>
            <p className="text-xs text-neutral-500">{val(entry.unique_id)}</p>
          </div>
          <button
            aria-label="Tutup"
            onClick={onClose}
            className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="text-xs">
          <DetailRow label="Unique ID" value={entry.unique_id} />
          <DetailRow label="Watchlist Type" value={entry.watchlist_type} />
          <DetailRow label="Subject Type" value={subjectLabel(entry.subject_type)} />
          <DetailRow label="Full Name" value={entry.full_name} />
          <DetailRow label="Entity Name" value={entry.entity_name} />
          <DetailRow label="Alias" value={entry.alias_name} />
          <DetailRow label="Date of Birth" value={entry.date_of_birth} />
          <DetailRow label="Raw Date of Birth" value={entry.raw_date_of_birth} />
          <DetailRow label="Place of Birth" value={entry.place_of_birth} />
          <DetailRow label="Nationality" value={entry.nationality} />
          <DetailRow label="National ID Number" value={entry.national_id_number} />
          <DetailRow label="Position Title" value={entry.position_title} />
          <DetailRow label="Institution Name" value={entry.institution_name} />
          <DetailRow label="Address" value={entry.address} />
          <DetailRow label="Sanction Number" value={entry.sanction_number} />
          <DetailRow label="Source URL" value={entry.source_url} />
          <DetailRow label="Description" value={entry.description} />
          <DetailRow label="Remarks" value={entry.remarks} />
          <DetailRow label="Created At" value={fmtDate(entry.created_at)} />
          <DetailRow label="Updated At" value={fmtDate(entry.updated_at)} />
        </dl>
      </div>
    </div>
  );
}

export default function WatchlistEntries({ refreshKey = 0 }: { refreshKey?: number }) {
  const [listType, setListType] = useState('');
  const [subjectType, setSubjectType] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState(''); // applied search term

  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);

  const [rows, setRows] = useState<WatchlistEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const [detail, setDetail] = useState<WatchlistEntry | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      const res = await getWatchlistEntries({
        page,
        limit,
        list_type: listType || undefined,
        subject_type: subjectType || undefined,
        q: q || undefined,
      });
      setRows(res.data);
      setTotal(res.total);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat data watchlist');
      setRows([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, limit, listType, subjectType, q]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // reset to page 1 whenever a filter changes
  useEffect(() => {
    setPage(1);
  }, [listType, subjectType, q]);

  function applySearch(e: React.FormEvent) {
    e.preventDefault();
    setQ(search);
  }

  const colCount = 12;
  const rangeInfo = useMemo(() => total, [total]);

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
      <div>
        <h2 className="text-sm font-semibold">Data Watchlist Tersimpan</h2>
        <p className="text-xs text-neutral-500">
          Lihat data PEP, DTTOT, dan PPPSPM yang sudah tersimpan di sistem.
        </p>
      </div>

      {/* Filters */}
      <form onSubmit={applySearch} className="flex flex-wrap items-end gap-2 text-xs">
        <div className="flex flex-col gap-1">
          <label className="font-medium">Jenis List</label>
          <select
            className="rounded-md border border-neutral-300 bg-white px-2 py-1"
            value={listType}
            onChange={(e) => setListType(e.target.value)}
          >
            {LIST_TYPE_OPTIONS.map((t) => (
              <option key={t || 'ALL'} value={t}>
                {t === '' ? 'Semua' : t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="font-medium">Subject Type</label>
          <select
            className="rounded-md border border-neutral-300 bg-white px-2 py-1"
            value={subjectType}
            onChange={(e) => setSubjectType(e.target.value)}
          >
            {SUBJECT_OPTIONS.map((t) => (
              <option key={t || 'ALL'} value={t}>
                {t === '' ? 'Semua' : subjectLabel(t)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-1 flex-col gap-1 min-w-[220px]">
          <label className="font-medium">Pencarian</label>
          <input
            className="rounded-md border border-neutral-300 px-2 py-1"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, ID, NIK, jabatan, instansi, atau nomor sanksi"
          />
        </div>

        <button
          type="submit"
          className="rounded-md bg-kesh-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-kesh-600 transition-colors"
        >
          Cari
        </button>
        {(listType || subjectType || q) && (
          <button
            type="button"
            onClick={() => { setListType(''); setSubjectType(''); setSearch(''); setQ(''); }}
            className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs hover:bg-neutral-50"
          >
            Reset
          </button>
        )}
      </form>

      {err && <div className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}

      {/* Table */}
      <div className="overflow-x-auto text-xs">
        <table className="w-full border border-neutral-200 rounded-md">
          <thead className="bg-neutral-50">
            <tr>
              <th className="border px-2 py-1 text-left">Unique ID</th>
              <th className="border px-2 py-1 text-left">Jenis List</th>
              <th className="border px-2 py-1 text-left">Subjek</th>
              <th className="border px-2 py-1 text-left">Nama / Entitas</th>
              <th className="border px-2 py-1 text-left">Alias</th>
              <th className="border px-2 py-1 text-left">Tanggal Lahir</th>
              <th className="border px-2 py-1 text-left">Kewarganegaraan</th>
              <th className="border px-2 py-1 text-left">NIK / ID Nasional</th>
              <th className="border px-2 py-1 text-left">Jabatan</th>
              <th className="border px-2 py-1 text-left">Instansi</th>
              <th className="border px-2 py-1 text-left">Nomor Sanksi</th>
              <th className="border px-2 py-1 text-left">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={colCount} className="border px-2 py-4 text-center text-neutral-500">
                  Memuat...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="border px-2 py-4 text-center text-neutral-500">
                  Tidak ada data watchlist yang cocok.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="border px-2 py-1 font-mono">{val(r.unique_id)}</td>
                  <td className="border px-2 py-1">{val(r.list_type)}</td>
                  <td className="border px-2 py-1">{subjectLabel(r.subject_type)}</td>
                  <td className="border px-2 py-1">{val(r.full_name ?? r.entity_name)}</td>
                  <td className="border px-2 py-1">{val(r.alias_name)}</td>
                  <td className="border px-2 py-1">{val(r.date_of_birth ?? r.raw_date_of_birth)}</td>
                  <td className="border px-2 py-1">{val(r.nationality)}</td>
                  <td className="border px-2 py-1">{val(r.national_id_number)}</td>
                  <td className="border px-2 py-1">{val(r.position_title)}</td>
                  <td className="border px-2 py-1">{val(r.institution_name)}</td>
                  <td className="border px-2 py-1">{val(r.sanction_number)}</td>
                  <td className="border px-2 py-1">
                    <button
                      onClick={() => setDetail(r)}
                      className="text-kesh-700 hover:underline font-medium"
                    >
                      Detail
                    </button>
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
        total={rangeInfo}
        onPageChange={setPage}
        onPageSizeChange={(s) => { setLimit(s); setPage(1); }}
        disabled={loading}
      />

      {detail && <DetailModal entry={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
