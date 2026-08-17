'use client';

import { useMemo, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  draftStateLabel,
  stagePartyDraft,
  type DraftPartyRow,
} from '@/lib/data-review-drafts';

const PARTY_ROLES = [
  ['DIRECTOR', 'Direktur'], ['COMMISSIONER', 'Komisaris'], ['MANAGER', 'Manajer'],
  ['SHAREHOLDER', 'Pemegang Saham'], ['BO', 'Beneficial Owner'],
  ['AUTHORIZED_REP', 'PIC / Penerima Kuasa'],
] as const;

const PARTY_FIELDS = [
  'role', 'full_name', 'identity_type', 'identity_number', 'dob', 'pob',
  'nationality', 'phone', 'email', 'address', 'ownership_percentage',
  'identity_document_type', 'source_of_funds', 'source_of_funds_other',
  'source_of_wealth', 'source_of_wealth_other', 'cif_relationship_type',
] as const;

type PartyForm = Record<(typeof PARTY_FIELDS)[number], string>;

const EMPTY_FORM: PartyForm = Object.fromEntries(PARTY_FIELDS.map((key) => [key, ''])) as PartyForm;

function toForm(row?: DraftPartyRow | null): PartyForm {
  return Object.fromEntries(
    PARTY_FIELDS.map((key) => [key, row?.[key] == null ? '' : String(row[key])]),
  ) as PartyForm;
}

function partyTarget(row: DraftPartyRow): number | undefined {
  const target = row.id ?? row.draft_change_id;
  return target == null ? undefined : Number(target);
}

export default function DataReviewPartyEditor({
  reviewId,
  rows,
  version,
  disabled,
  onChanged,
}: {
  reviewId: string;
  rows: DraftPartyRow[];
  version: number;
  disabled: boolean;
  onChanged: () => Promise<void> | void;
}) {
  const [editing, setEditing] = useState<DraftPartyRow | null | 'NEW'>(null);
  const [form, setForm] = useState<PartyForm>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const initial = useMemo(
    () => editing && editing !== 'NEW' ? toForm(editing) : EMPTY_FORM,
    [editing],
  );

  function openNew() {
    setEditing('NEW');
    setForm({ ...EMPTY_FORM, identity_type: 'KTP' });
    setError('');
  }

  function openEdit(row: DraftPartyRow) {
    setEditing(row);
    setForm(toForm(row));
    setError('');
  }

  async function save() {
    if (!editing) return;
    if (!form.role || !form.full_name.trim()) {
      setError('Peran dan nama lengkap wajib diisi.');
      return;
    }
    const data: Record<string, unknown> = {};
    for (const key of PARTY_FIELDS) {
      if (editing !== 'NEW' && form[key] === initial[key]) continue;
      const value = form[key].trim();
      data[key] = key === 'ownership_percentage'
        ? value === '' ? null : Number(value)
        : value === '' ? null : value;
    }
    if (editing !== 'NEW' && Object.keys(data).length === 0) {
      setError('Tidak ada perubahan untuk disimpan.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await stagePartyDraft(reviewId, {
        operation: editing === 'NEW' ? 'ADD' : 'UPDATE',
        ...(editing !== 'NEW' ? { target_id: partyTarget(editing) } : {}),
        data,
        expected_version: version,
      });
      toast.success(editing === 'NEW' ? 'Party ditambahkan ke draft.' : 'Perubahan party disimpan di draft.');
      setEditing(null);
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan party.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: DraftPartyRow) {
    const targetId = partyTarget(row);
    if (!targetId) return;
    setBusy(true);
    try {
      await stagePartyDraft(reviewId, {
        operation: 'DELETE', target_id: targetId, expected_version: version,
      });
      toast.success(row._draft_state === 'ADDED' ? 'Usulan party baru dibatalkan.' : 'Penghapusan party disimpan di draft.');
      await onChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menghapus party.');
    } finally {
      setBusy(false);
    }
  }

  const set = (key: keyof PartyForm, value: string) => setForm((old) => ({ ...old, [key]: value }));
  const input = 'rounded-md border px-3 py-2 text-sm disabled:bg-slate-50';

  return (
    <div className="space-y-4" data-testid="draft-party-editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-800">Pengurus, Pemegang Saham &amp; Beneficial Owner</h2>
          <p className="text-xs text-slate-500">Tambah, ubah, atau hapus party sebagai usulan draft.</p>
        </div>
        {!disabled && <button type="button" onClick={openNew} className="rounded-md bg-kesh-700 px-3 py-2 text-xs font-medium text-white">Tambah Party</button>}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500"><tr>
            <th className="px-3 py-2">Peran</th><th className="px-3 py-2">Nama</th>
            <th className="px-3 py-2">Identitas</th><th className="px-3 py-2">Kepemilikan</th>
            <th className="px-3 py-2">Status Draft</th><th className="px-3 py-2 text-right">Aksi</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-5 text-center text-slate-400">Belum ada party.</td></tr>}
            {rows.map((row, index) => (
              <tr key={`${row.id ?? 'draft'}-${row.draft_change_id ?? index}`} className={`border-t ${row._draft_state === 'DELETED' ? 'bg-red-50 opacity-70' : ''}`}>
                <td className="px-3 py-2">{PARTY_ROLES.find(([code]) => code === row.role)?.[1] ?? String(row.role ?? '—')}</td>
                <td className="px-3 py-2 break-words">{String(row.full_name ?? '—')}</td>
                <td className="px-3 py-2 break-words">{String(row.identity_type ?? '—')} · {String(row.identity_number ?? '—')}</td>
                <td className="px-3 py-2">{row.ownership_percentage == null ? '—' : `${row.ownership_percentage}%`}</td>
                <td className="px-3 py-2">{row._draft_state ? <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">{draftStateLabel(row._draft_state)}</span> : 'Live'}</td>
                <td className="px-3 py-2 text-right">
                  {!disabled && row._draft_state !== 'DELETED' && <span className="inline-flex gap-2">
                    <button type="button" onClick={() => openEdit(row)} className="text-xs text-kesh-700 hover:underline">Ubah</button>
                    <button type="button" disabled={busy} onClick={() => remove(row)} className="text-xs text-red-600 hover:underline">Hapus</button>
                  </span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && !disabled && (
        <div className="rounded-lg border bg-slate-50 p-4 space-y-3">
          <h3 className="text-sm font-semibold">{editing === 'NEW' ? 'Tambah Party' : 'Ubah Party'}</h3>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="grid gap-1 text-xs">Peran<select aria-label="Peran Party" value={form.role} onChange={(e) => set('role', e.target.value)} className={input}><option value="">— Pilih —</option>{PARTY_ROLES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="grid gap-1 text-xs">Nama Lengkap<input aria-label="Nama Lengkap Party" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Jenis Identitas<select aria-label="Jenis Identitas Party" value={form.identity_type} onChange={(e) => set('identity_type', e.target.value)} className={input}><option value="">— Pilih —</option><option>KTP</option><option>SIM</option><option>PASPOR</option><option>LAINNYA</option></select></label>
            <label className="grid gap-1 text-xs">Nomor Identitas<input aria-label="Nomor Identitas Party" value={form.identity_number} onChange={(e) => set('identity_number', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Tanggal Lahir<input type="date" value={form.dob.slice(0, 10)} onChange={(e) => set('dob', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Tempat Lahir<input value={form.pob} onChange={(e) => set('pob', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Kewarganegaraan<input value={form.nationality} onChange={(e) => set('nationality', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Telepon<input value={form.phone} onChange={(e) => set('phone', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Email<input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs sm:col-span-2">Alamat<input aria-label="Alamat Party" value={form.address} onChange={(e) => set('address', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Kepemilikan (%)<input aria-label="Kepemilikan Party" type="number" min="0" max="100" value={form.ownership_percentage} onChange={(e) => set('ownership_percentage', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Jenis Dokumen Identitas<input value={form.identity_document_type} onChange={(e) => set('identity_document_type', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Sumber Dana<input value={form.source_of_funds} onChange={(e) => set('source_of_funds', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Sumber Dana Lainnya<input value={form.source_of_funds_other} onChange={(e) => set('source_of_funds_other', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Sumber Kekayaan<input value={form.source_of_wealth} onChange={(e) => set('source_of_wealth', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Sumber Kekayaan Lainnya<input value={form.source_of_wealth_other} onChange={(e) => set('source_of_wealth_other', e.target.value)} className={input} /></label>
            <label className="grid gap-1 text-xs">Hubungan CIF<input value={form.cif_relationship_type} onChange={(e) => set('cif_relationship_type', e.target.value)} className={input} /></label>
          </div>
          <div className="flex gap-2"><button type="button" disabled={busy} onClick={save} className="rounded-md bg-kesh-700 px-3 py-2 text-xs text-white">{busy ? 'Menyimpan…' : 'Simpan Party ke Draft'}</button><button type="button" onClick={() => setEditing(null)} className="rounded-md border px-3 py-2 text-xs">Batal</button></div>
        </div>
      )}
    </div>
  );
}
