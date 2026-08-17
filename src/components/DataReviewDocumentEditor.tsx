'use client';

import { useState } from 'react';
import { BUSINESS_DOC_TYPES, businessDocLabel } from '@/lib/business-docs';
import { toast } from '@/lib/toast';
import {
  draftStateLabel,
  stageDocumentDraft,
  uploadDataReviewDocument,
  type DraftDocumentRow,
} from '@/lib/data-review-drafts';

const INDIVIDUAL_DOC_TYPES = [
  { code: 'INDIVIDUAL_KTP_PHOTO', name: 'Foto KTP' },
  { code: 'INDIVIDUAL_FACE_PHOTO', name: 'Foto Wajah' },
  { code: 'INDIVIDUAL_FACE_WITH_KTP_PHOTO', name: 'Foto Wajah dengan KTP' },
  { code: 'INDIVIDUAL_NPWP', name: 'NPWP Individual' },
  { code: 'SIGNATURE', name: 'Tanda Tangan' },
  { code: 'EDD_ADDITIONAL_DOCUMENT', name: 'Dokumen Tambahan EDD' },
];

function filename(uri: unknown): string {
  const value = typeof uri === 'string' ? uri : '';
  return value.split('/').pop() || '—';
}

function documentTarget(row: DraftDocumentRow): number | undefined {
  const target = row.id ?? row.draft_change_id;
  return target == null ? undefined : Number(target);
}

export default function DataReviewDocumentEditor({
  reviewId,
  applicationType,
  rows,
  version,
  disabled,
  onChanged,
}: {
  reviewId: string;
  applicationType: 'INDIVIDUAL' | 'BUSINESS';
  rows: DraftDocumentRow[];
  version: number;
  disabled: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const options = applicationType === 'BUSINESS'
    ? [...BUSINESS_DOC_TYPES, { code: 'EDD_ADDITIONAL_DOCUMENT', name: 'Dokumen Tambahan EDD' }]
    : INDIVIDUAL_DOC_TYPES;
  const [operation, setOperation] = useState<'ADD' | 'REPLACE'>('ADD');
  const [targetId, setTargetId] = useState('');
  const [docType, setDocType] = useState(options[0]?.code ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function startReplace(row: DraftDocumentRow) {
    const target = documentTarget(row);
    if (!target) return;
    setOperation('REPLACE');
    setTargetId(String(target));
    setDocType(String(row.doc_type ?? ''));
    setFile(null);
    setInputKey((n) => n + 1);
    setError('');
  }

  async function upload() {
    if (!file) { setError('Pilih berkas terlebih dahulu.'); return; }
    if (operation === 'REPLACE' && !targetId) { setError('Pilih dokumen yang akan diganti.'); return; }
    setBusy(true);
    setError('');
    try {
      await uploadDataReviewDocument(reviewId, {
        operation,
        file,
        doc_type: docType,
        ...(operation === 'REPLACE' ? { target_id: Number(targetId) } : {}),
        expected_version: version,
      });
      toast.success(operation === 'ADD' ? 'Dokumen ditambahkan ke staging draft.' : 'Penggantian dokumen disimpan di staging draft.');
      setOperation('ADD');
      setTargetId('');
      setFile(null);
      setInputKey((n) => n + 1);
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal mengunggah dokumen draft.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: DraftDocumentRow) {
    const target = documentTarget(row);
    if (!target) return;
    setBusy(true);
    try {
      await stageDocumentDraft(reviewId, {
        operation: 'DELETE', target_id: target, expected_version: version,
      });
      toast.success(row._draft_state === 'ADDED' ? 'Usulan dokumen baru dibatalkan.' : 'Penghapusan dokumen disimpan di draft.');
      await onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus dokumen draft.');
    } finally {
      setBusy(false);
    }
  }

  const label = (type?: string) => applicationType === 'BUSINESS'
    ? businessDocLabel(type ?? '')
    : options.find((item) => item.code === type)?.name ?? type ?? '—';

  return (
    <div className="space-y-4" data-testid="draft-document-editor">
      <div><h2 className="text-sm font-semibold text-slate-800">Dokumen</h2><p className="text-xs text-slate-500">Berkas baru disimpan di staging dan tidak muncul sebagai dokumen live sebelum persetujuan.</p></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.length === 0 && <p className="text-sm text-slate-400">Belum ada dokumen.</p>}
        {rows.map((row, index) => (
          <div key={`${row.id ?? 'draft'}-${row.draft_change_id ?? index}`} className={`min-w-0 rounded-lg border p-3 ${row._draft_state === 'DELETED' ? 'bg-red-50 opacity-70' : 'bg-white'}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0"><p className="break-words text-sm font-medium">{label(row.doc_type)}</p><p className="break-all text-xs text-slate-400">{filename(row.file_uri)}</p></div>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{row._draft_state ? draftStateLabel(row._draft_state) : 'Live'}</span>
            </div>
            {!disabled && row._draft_state !== 'DELETED' && <div className="mt-2 flex gap-3"><button type="button" onClick={() => startReplace(row)} className="text-xs text-kesh-700 hover:underline">Ganti</button><button type="button" disabled={busy} onClick={() => remove(row)} className="text-xs text-red-600 hover:underline">Hapus</button></div>}
          </div>
        ))}
      </div>

      {!disabled && <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
        <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="radio" checked={operation === 'ADD'} onChange={() => { setOperation('ADD'); setTargetId(''); }} />Tambah dokumen</label><label className="flex items-center gap-2"><input type="radio" checked={operation === 'REPLACE'} onChange={() => setOperation('REPLACE')} />Ganti dokumen</label></div>
        {operation === 'REPLACE' && <label className="grid gap-1 text-xs">Dokumen yang diganti<select aria-label="Dokumen yang diganti" value={targetId} onChange={(e) => { const row = rows.find((item) => String(documentTarget(item)) === e.target.value); setTargetId(e.target.value); if (row?.doc_type) setDocType(String(row.doc_type)); }} className="rounded-md border bg-white px-3 py-2 text-sm"><option value="">— Pilih —</option>{rows.filter((row) => row._draft_state !== 'DELETED' && row._draft_state !== 'ADDED').map((row) => <option key={String(row.id)} value={String(row.id)}>{label(row.doc_type)}</option>)}</select></label>}
        <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs">Jenis Dokumen<select aria-label="Jenis Dokumen Draft" value={docType} disabled={operation === 'REPLACE'} onChange={(e) => setDocType(e.target.value)} className="rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-100">{options.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label className="grid gap-1 text-xs">Berkas<input key={inputKey} aria-label="Berkas Dokumen Draft" type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-sm" /></label></div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="button" disabled={busy || !file} onClick={upload} className="rounded-md bg-kesh-700 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">{busy ? 'Mengunggah…' : operation === 'ADD' ? 'Tambahkan ke Draft' : 'Ganti di Draft'}</button>
      </div>}
    </div>
  );
}
