'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getRoleFromToken } from '@/lib/api';
import { useAuth } from '@/app/providers';
import { toast } from '@/lib/toast';
import { formatCif } from '@/lib/utils';
import { ShieldOff, Trash2 } from 'lucide-react';
import {
  createBulkTransfers,
  searchSenders,
  getTransferBanks,
  canCreateTransfer,
  BENEFICIARY_RELATIONSHIP_OPTIONS,
  BULK_TRANSFER_MAX_ROWS,
  FALLBACK_BANKS,
  TRANSFER_MIN_AMOUNT,
  TRANSFER_MAX_AMOUNT,
  WIC_TRANSFER_MAX_AMOUNT,
  type BulkTransferItem,
  type SenderSearchItem,
  type TransferBank,
} from '@/lib/transfers';

type Row = {
  beneficiaryAccountName: string;
  beneficiaryBankCode: string;
  beneficiaryBankName: string;
  beneficiaryAccountNumber: string;
  amount: number;
  transaction_purpose: string;
  beneficiary_relationship_to_sender: string;
};

function emptyRow(): Row {
  return {
    beneficiaryAccountName: '',
    beneficiaryBankCode: '',
    beneficiaryBankName: '',
    beneficiaryAccountNumber: '',
    amount: TRANSFER_MIN_AMOUNT,
    transaction_purpose: '',
    beneficiary_relationship_to_sender: '',
  };
}

export default function BulkTransferPage() {
  const router = useRouter();
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ batch_no: string; total_count: number } | null>(null);

  // Sender picker (mirrors single transfer form)
  const [senderQuery, setSenderQuery] = useState('');
  const [senderResults, setSenderResults] = useState<SenderSearchItem[]>([]);
  const [senderSearching, setSenderSearching] = useState(false);
  const [selectedSender, setSelectedSender] = useState<SenderSearchItem | null>(null);
  const senderSeq = useRef(0);

  const [banks, setBanks] = useState<TransferBank[]>(FALLBACK_BANKS);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  // Track which rows the user has attempted to submit, to show row errors.
  const [showErrors, setShowErrors] = useState(false);

  const selectedSenderIsWic = selectedSender?.cif_relationship_type === 'WIC';
  const effectiveMaxAmount = selectedSenderIsWic ? WIC_TRANSFER_MAX_AMOUNT : TRANSFER_MAX_AMOUNT;

  useEffect(() => {
    getTransferBanks()
      .then((list) => { if (list && list.length) setBanks(list); })
      .catch(() => { /* keep FALLBACK_BANKS */ });
  }, []);

  useEffect(() => {
    if (selectedSender) return;
    const q = senderQuery.trim();
    if (q.length < 2) { setSenderResults([]); setSenderSearching(false); return; }
    const seq = ++senderSeq.current;
    setSenderSearching(true);
    const t = setTimeout(() => {
      searchSenders(q)
        .then((list) => { if (seq === senderSeq.current) setSenderResults(list); })
        .catch(() => { if (seq === senderSeq.current) setSenderResults([]); })
        .finally(() => { if (seq === senderSeq.current) setSenderSearching(false); });
    }, 300);
    return () => clearTimeout(t);
  }, [senderQuery, selectedSender]);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function onRowBankChange(i: number, code: string) {
    const bank = banks.find((b) => (b.code ?? '') === code);
    updateRow(i, { beneficiaryBankCode: code, beneficiaryBankName: bank?.name ?? '' });
  }

  function onRowAccountChange(i: number, v: string) {
    updateRow(i, { beneficiaryAccountNumber: v.replace(/\D/g, '') });
  }

  function addRow() {
    setRows((rs) => (rs.length >= BULK_TRANSFER_MAX_ROWS ? rs : [...rs, emptyRow()]));
  }

  function removeRow(i: number) {
    setRows((rs) => (rs.length <= 1 ? rs : rs.filter((_, idx) => idx !== i)));
  }

  // Returns an error message for a row, or '' if valid.
  function rowError(r: Row): string {
    if (!r.beneficiaryAccountName.trim()) return 'Nama rekening penerima wajib diisi.';
    if (!r.beneficiaryBankName.trim()) return 'Bank penerima wajib dipilih.';
    if (!/^\d+$/.test(r.beneficiaryAccountNumber)) return 'Nomor rekening hanya boleh berisi angka.';
    const n = Number(r.amount);
    if (!Number.isFinite(n) || n < TRANSFER_MIN_AMOUNT) return 'Minimum transfer Rp10.000.';
    if (n > effectiveMaxAmount) {
      return selectedSenderIsWic
        ? 'Limit WIC maksimal Rp100.000.000.'
        : 'Maksimum transfer Rp500.000.000.';
    }
    if (!r.transaction_purpose.trim()) return 'Tujuan transaksi wajib diisi.';
    if (!r.beneficiary_relationship_to_sender.trim()) return 'Hubungan dengan Pengirim wajib dipilih.';
    return '';
  }

  const rowErrors = rows.map(rowError);
  const allRowsValid = rowErrors.every((e) => e === '');

  async function submit() {
    setErr('');
    setShowErrors(true);
    if (!selectedSender) { setErr('Silakan pilih pengirim dari hasil pencarian.'); return; }
    if (!allRowsValid) { setErr('Perbaiki baris yang belum valid sebelum menyimpan.'); return; }

    const items: BulkTransferItem[] = rows.map((r) => ({
      amount: Number(r.amount),
      beneficiary_relationship_to_sender: r.beneficiary_relationship_to_sender.trim(),
      beneficiaryBankName: r.beneficiaryBankName.trim(),
      beneficiaryBankCode: r.beneficiaryBankCode.trim() || undefined,
      beneficiaryAccountNumber: r.beneficiaryAccountNumber.trim(),
      beneficiaryAccountName: r.beneficiaryAccountName.trim(),
      transaction_purpose: r.transaction_purpose.trim() || undefined,
    }));

    setLoading(true);
    try {
      const res = await createBulkTransfers({
        sender_application_id: Number(selectedSender.application_id),
        items,
      });
      setResult({ batch_no: res.batch_no, total_count: res.total_count });
      toast.success(`Bulk transfer berhasil. ${res.total_count} transfer dibuat.`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Gagal membuat bulk transfer';
      setErr(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  if (token !== null && !canCreateTransfer(role)) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <ShieldOff className="h-10 w-10 text-slate-300" />
          <p className="text-base font-medium text-slate-700">Akses Ditolak</p>
          <p className="text-sm">Anda tidak memiliki izin untuk membuat transfer.</p>
          <button onClick={() => router.push('/transfers')} className="mt-1 text-sm text-kesh-700 hover:underline">
            Ke Pencatatan Transfer
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="max-w-2xl space-y-4">
        <h1 className="text-xl font-semibold">Bulk Transfer Berhasil</h1>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 space-y-1">
          <p><span className="font-medium">Nomor Batch:</span> <span className="font-mono">{result.batch_no}</span></p>
          <p><span className="font-medium">Total transfer dibuat:</span> {result.total_count}</p>
          <p className="text-xs text-emerald-700">Transfer dibuat sebagai DRAFT dan tampil di daftar transfer normal.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/transfers')} className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600">
            Ke Daftar Transfer
          </button>
          <button
            onClick={() => { setResult(null); setRows([emptyRow()]); setSelectedSender(null); setShowErrors(false); }}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50"
          >
            Buat Bulk Lagi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bulk Transfer</h1>
        <p className="text-sm text-muted-foreground">Buat beberapa transfer sekaligus (maks {BULK_TRANSFER_MAX_ROWS} baris)</p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>
      )}

      {/* Sender picker */}
      <div className="rounded-2xl border p-4 space-y-2">
        <label className="text-xs text-muted-foreground">Pengirim (KYC/KYB Disetujui)</label>
        {selectedSender ? (
          <div className="rounded-lg border bg-slate-50 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Nama Pengirim</div>
                <div className="text-sm font-medium break-words">{selectedSender.display_name || `App #${selectedSender.application_id}`}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">CIF Pengirim</div>
                <div className="text-sm font-medium font-mono">{selectedSenderIsWic ? 'WIC - Tanpa CIF' : formatCif(selectedSender.cif_no)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Tipe Pengirim</div>
                <div className="text-sm font-medium">{selectedSender.application_type ?? '—'}</div>
              </div>
            </div>
            {selectedSenderIsWic && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Walk-In Customer (WIC) tidak memiliki CIF dan limit transaksi maksimal Rp100.000.000 per transfer.
              </div>
            )}
            <button type="button" onClick={() => { setSelectedSender(null); setSenderQuery(''); }} className="text-xs text-kesh-700 hover:underline">
              Ganti Pengirim
            </button>
          </div>
        ) : (
          <div className="space-y-1">
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={senderQuery}
              onChange={(e) => setSenderQuery(e.target.value)}
              placeholder="Cari nama atau CIF pengirim…"
            />
            {senderSearching && <p className="text-xs text-slate-400">Mencari…</p>}
            {!senderSearching && senderQuery.trim().length >= 2 && senderResults.length === 0 && (
              <p className="text-xs text-slate-400">Tidak ada pengirim yang cocok.</p>
            )}
            {senderResults.length > 0 && (
              <ul className="rounded-lg border divide-y max-h-64 overflow-auto">
                {senderResults.map((s) => (
                  <li key={String(s.application_id)}>
                    <button
                      type="button"
                      onClick={() => { setSelectedSender(s); setSenderResults([]); setSenderQuery(''); }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50"
                    >
                      <div className="text-sm font-medium break-words">
                        {(s.display_name || `App #${s.application_id}`)} — <span className="font-mono">{s.cif_relationship_type === 'WIC' ? 'WIC - Tanpa CIF' : formatCif(s.cif_no)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground">{(s.application_type ?? '—')} / {(s.status ?? '—')}</div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Beneficiary rows */}
      <div className="space-y-3">
        {rows.map((r, i) => {
          const rowErr = showErrors ? rowErrors[i] : '';
          return (
            <div key={i} className="rounded-2xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-600">Penerima #{i + 1}</span>
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  disabled={rows.length <= 1}
                  className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline disabled:opacity-40 disabled:no-underline"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Nama Rekening</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.beneficiaryAccountName}
                    onChange={(e) => updateRow(i, { beneficiaryAccountName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Bank Penerima</label>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={r.beneficiaryBankCode}
                    onChange={(e) => onRowBankChange(i, e.target.value)}
                  >
                    <option value="">Pilih bank…</option>
                    {banks.map((b) => (
                      <option key={String(b.code ?? b.name)} value={b.code ?? ''}>
                        {b.code ? `${b.code} — ${b.name ?? ''}` : (b.name ?? '')}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nomor Rekening</label>
                  <input
                    inputMode="numeric"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.beneficiaryAccountNumber}
                    onChange={(e) => onRowAccountChange(i, e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Nominal</label>
                  <input
                    type="number"
                    min={TRANSFER_MIN_AMOUNT}
                    max={effectiveMaxAmount}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.amount}
                    onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Tujuan Transaksi</label>
                  <input
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.transaction_purpose}
                    onChange={(e) => updateRow(i, { transaction_purpose: e.target.value })}
                    placeholder="mis: pembayaran vendor"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Hubungan dengan Pengirim</label>
                  <select
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
                    value={r.beneficiary_relationship_to_sender}
                    onChange={(e) => updateRow(i, { beneficiary_relationship_to_sender: e.target.value })}
                  >
                    <option value="">Pilih hubungan…</option>
                    {BENEFICIARY_RELATIONSHIP_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>

              {rowErr && <p className="text-xs text-red-600">{rowErr}</p>}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= BULK_TRANSFER_MAX_ROWS}
          className="rounded-lg border px-4 py-2 text-sm hover:bg-slate-50 disabled:opacity-50"
        >
          + Tambah Baris
        </button>
        <span className="text-xs text-slate-400">{rows.length}/{BULK_TRANSFER_MAX_ROWS} baris</span>
      </div>

      <button
        onClick={submit}
        disabled={loading || !selectedSender}
        className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Menyimpan…' : `Buat ${rows.length} Transfer`}
      </button>
    </div>
  );
}
