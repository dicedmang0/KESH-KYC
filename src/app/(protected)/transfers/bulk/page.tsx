'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
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
  /** Kolom "Ben Mobile Number" pada file BRI Qlola — wajib untuk BI-Fast. */
  beneficiary_mobile_number: string;
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
    beneficiary_mobile_number: '',
  };
}

// ── Excel template / import ──────────────────────────────────────────────────
// Sheet "Bulk Transfer": header row 8, data starts row 9 (both 1-indexed,
// matching what a user sees in Excel).
//
// "No. Referensi Bulk" used to live in B4. It is gone: the backend generates
// the batch reference (BLK-XXXXXXXX). An older template that still has a value
// there stays importable - B4 is simply ignored.

// No. HP penerima dikirim apa adanya (hanya trim) — workbook BRI hanya menuntut
// alfanumerik, dan KESH belum punya aturan normalisasi nomor telepon. Jangan
// mengarang normalisasi baru di sini.
const MOBILE_PATTERN = /^[0-9+][0-9]*$/;
// Batas dari sheet "Deskripsi File" workbook BRI Qlola.
const QLOLA_DEBIT_ACCOUNT_MIN = 10;
const QLOLA_DEBIT_ACCOUNT_MAX = 30;
const QLOLA_SENDER_NAME_MAX = 60;

const TEMPLATE_SHEET_NAME = 'Bulk Transfer';
const TEMPLATE_HEADERS = [
  'No',
  'beneficiaryAccountName',
  'beneficiaryBank',
  'beneficiaryAccount',
  'amount',
  'transaction_purpose',
  'beneficiary_relationship_to_sender',
  'No. Handphone Penerima',
  'notes',
] as const;
const TEMPLATE_HEADER_ROW_INDEX = 7; // row 8 (0-indexed)
const TEMPLATE_DATA_START_INDEX = 8; // row 9 (0-indexed)

function buildTemplateWorkbook(): XLSX.WorkBook {
  const aoa: (string | number)[][] = [];
  aoa[0] = ['KESH - Template Bulk Transfer'];
  aoa[2] = [`Data dimulai baris 9, maksimal ${BULK_TRANSFER_MAX_ROWS} baris. No. Referensi Bulk dibuat otomatis oleh sistem.`];
  aoa[TEMPLATE_HEADER_ROW_INDEX] = [...TEMPLATE_HEADERS];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, TEMPLATE_SHEET_NAME);
  return wb;
}

function downloadBulkTransferTemplate() {
  XLSX.writeFile(buildTemplateWorkbook(), 'kesh-bulk-transfer-template.xlsx');
}

/** Best-effort match of an imported bank name/code against the known bank list. */
function resolveImportedBank(raw: string, banks: TransferBank[]): { code: string; name: string } {
  const v = raw.trim();
  const byCode = banks.find((b) => (b.code ?? '').toLowerCase() === v.toLowerCase());
  if (byCode) return { code: byCode.code ?? '', name: byCode.name ?? v };
  const byName = banks.find((b) => (b.name ?? '').toLowerCase() === v.toLowerCase());
  if (byName) return { code: byName.code ?? '', name: byName.name ?? v };
  return { code: '', name: v };
}

type ImportResult = { rows: Row[] } | { errors: string[] };

/** Parses+validates a Bulk Transfer template workbook. Pure function — no state, easy to reason about/test. */
function parseBulkTransferWorkbook(wb: XLSX.WorkBook, banks: TransferBank[]): ImportResult {
  const sheet = wb.Sheets[TEMPLATE_SHEET_NAME];
  if (!sheet) {
    return { errors: ['Template tidak sesuai. Gunakan template resmi KESH.'] };
  }

  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

  const headerRow = aoa[TEMPLATE_HEADER_ROW_INDEX] ?? [];
  const headerOk = TEMPLATE_HEADERS.every((h, i) => String(headerRow[i] ?? '').trim() === h);
  if (!headerOk) {
    return { errors: ['Template tidak sesuai. Gunakan template resmi KESH.'] };
  }

  const dataRows = aoa
    .slice(TEMPLATE_DATA_START_INDEX)
    .filter((r) => Array.isArray(r) && r.some((c) => String(c ?? '').trim() !== ''));

  if (dataRows.length === 0) {
    return { errors: ['Tidak ada data untuk diimpor.'] };
  }
  if (dataRows.length > BULK_TRANSFER_MAX_ROWS) {
    return { errors: [`Import ditolak. Maksimal ${BULK_TRANSFER_MAX_ROWS} transaksi per bulk transfer.`] };
  }

  const errors: string[] = [];
  const rows: Row[] = [];

  dataRows.forEach((r, idx) => {
    const excelRowNo = TEMPLATE_DATA_START_INDEX + 1 + idx; // 1-indexed row number, for error messages
    const [, name, bank, account, amountRaw, purpose, relationship, mobile] = r as unknown[];

    const nameStr = String(name ?? '').trim();
    const bankStr = String(bank ?? '').trim();
    const accountStr = String(account ?? '').trim();
    const purposeStr = String(purpose ?? '').trim();
    const relationshipStr = String(relationship ?? '').trim();
    const mobileStr = String(mobile ?? '').trim();
    const amountNum = Number(amountRaw);

    if (!nameStr) errors.push(`Baris ${excelRowNo}: beneficiaryAccountName wajib diisi.`);
    if (!bankStr) errors.push(`Baris ${excelRowNo}: beneficiaryBank wajib diisi.`);
    if (!accountStr) errors.push(`Baris ${excelRowNo}: beneficiaryAccount wajib diisi.`);
    if (amountRaw === '' || !Number.isFinite(amountNum) || amountNum <= 0) {
      errors.push(`Baris ${excelRowNo}: amount wajib angka lebih dari 0.`);
    }
    if (!purposeStr) errors.push(`Baris ${excelRowNo}: transaction_purpose wajib diisi.`);
    if (!relationshipStr) errors.push(`Baris ${excelRowNo}: beneficiary_relationship_to_sender wajib diisi.`);
    if (!mobileStr) errors.push(`Baris ${excelRowNo}: No. Handphone Penerima wajib diisi.`);
    else if (!MOBILE_PATTERN.test(mobileStr)) {
      errors.push(`Baris ${excelRowNo}: No. Handphone Penerima hanya boleh berisi angka.`);
    }

    if (!nameStr || !bankStr || !accountStr || !purposeStr || !relationshipStr || !mobileStr || amountRaw === '' || !Number.isFinite(amountNum) || amountNum <= 0) {
      return;
    }

    const resolvedBank = resolveImportedBank(bankStr, banks);
    rows.push({
      beneficiaryAccountName: nameStr,
      beneficiaryBankCode: resolvedBank.code,
      beneficiaryBankName: resolvedBank.name,
      beneficiaryAccountNumber: accountStr.replace(/\D/g, ''),
      amount: amountNum,
      transaction_purpose: purposeStr,
      beneficiary_relationship_to_sender: relationshipStr,
      beneficiary_mobile_number: mobileStr,
    });
  });

  if (errors.length > 0) return { errors };
  return { rows };
}

export default function BulkTransferPage() {
  const router = useRouter();
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState<{ batch_no: string; bulk_reference_no: string; total_count: number } | null>(null);

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

  // Data level batch untuk export BRI Qlola — sama untuk semua baris, jadi
  // diisi sekali di sini, bukan diulang per penerima.
  const [qlolaDebitAccount, setQlolaDebitAccount] = useState('');
  const [qlolaSenderName, setQlolaSenderName] = useState('');

  // Excel import
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [importSuccessInfo, setImportSuccessInfo] = useState('');

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

  async function onImportFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setImportSuccessInfo('');
    setImportErrors([]);

    let wb: XLSX.WorkBook;
    try {
      const buf = await file.arrayBuffer();
      wb = XLSX.read(buf, { type: 'array' });
    } catch {
      setImportErrors(['Template tidak sesuai. Gunakan template resmi KESH.']);
      return;
    }

    const result = parseBulkTransferWorkbook(wb, banks);
    if ('errors' in result) {
      setImportErrors(result.errors);
      return;
    }

    setRows(result.rows);
    setShowErrors(false);
    setImportSuccessInfo(`${result.rows.length} baris berhasil diimpor. Periksa/edit baris di bawah sebelum submit.`);
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
    if (!r.beneficiary_mobile_number.trim()) return 'No. Handphone Penerima wajib diisi.';
    if (!MOBILE_PATTERN.test(r.beneficiary_mobile_number.trim())) return 'No. Handphone Penerima hanya boleh berisi angka.';
    return '';
  }

  const rowErrors = rows.map(rowError);
  const allRowsValid = rowErrors.every((e) => e === '');


  function qlolaDebitAccountError(): string {
    const v = qlolaDebitAccount.trim();
    if (!v) return 'Rekening Debit BRI wajib diisi.';
    if (v.length < QLOLA_DEBIT_ACCOUNT_MIN || v.length > QLOLA_DEBIT_ACCOUNT_MAX) {
      return `Rekening Debit BRI harus ${QLOLA_DEBIT_ACCOUNT_MIN}-${QLOLA_DEBIT_ACCOUNT_MAX} karakter.`;
    }
    return '';
  }

  function qlolaSenderNameError(): string {
    const v = qlolaSenderName.trim();
    if (!v) return 'Nama Pengirim wajib diisi.';
    if (v.length > QLOLA_SENDER_NAME_MAX) return `Nama Pengirim maksimal ${QLOLA_SENDER_NAME_MAX} karakter.`;
    return '';
  }

  const qlolaDebitAccountErr = qlolaDebitAccountError();
  const qlolaSenderNameErr = qlolaSenderNameError();

  async function submit() {
    setErr('');
    setShowErrors(true);
    if (!selectedSender) { setErr('Silakan pilih pengirim dari hasil pencarian.'); return; }
    if (qlolaDebitAccountErr) { setErr(qlolaDebitAccountErr); return; }
    if (qlolaSenderNameErr) { setErr(qlolaSenderNameErr); return; }
    if (!allRowsValid) { setErr('Perbaiki baris yang belum valid sebelum menyimpan.'); return; }

    const items: BulkTransferItem[] = rows.map((r) => ({
      amount: Number(r.amount),
      beneficiary_relationship_to_sender: r.beneficiary_relationship_to_sender.trim(),
      beneficiaryBankName: r.beneficiaryBankName.trim(),
      beneficiaryBankCode: r.beneficiaryBankCode.trim() || undefined,
      beneficiaryAccountNumber: r.beneficiaryAccountNumber.trim(),
      beneficiaryAccountName: r.beneficiaryAccountName.trim(),
      transaction_purpose: r.transaction_purpose.trim() || undefined,
      beneficiary_mobile_number: r.beneficiary_mobile_number.trim(),
    }));

    setLoading(true);
    try {
      const res = await createBulkTransfers({
        sender_application_id: Number(selectedSender.application_id),
        qlola_debit_account: qlolaDebitAccount.trim(),
        qlola_sender_name: qlolaSenderName.trim(),
        items,
      });
      setResult({ batch_no: res.batch_no, bulk_reference_no: res.bulk_reference_no, total_count: res.total_count });
      toast.success(`Bulk transfer berhasil dibuat. ${res.total_count} transaksi dibuat.`);
    } catch (e: unknown) {
      // Tidak ada lagi penerjemahan error "referensi duplikat": nomornya dibuat
      // backend, jadi user tidak bisa menyebabkan bentrok.
      const msg = e instanceof Error ? e.message : 'Gagal membuat bulk transfer';
      setErr(msg);
      toast.error(msg);
      console.error('Bulk transfer gagal:', msg);
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
          <p>Bulk transfer berhasil dibuat.</p>
          <p><span className="font-medium">Batch No:</span> <span className="font-mono">{result.batch_no}</span></p>
          <p><span className="font-medium">No. Referensi Bulk:</span> <span className="font-mono">{result.bulk_reference_no}</span></p>
          <p><span className="font-medium">Total transaksi:</span> {result.total_count}</p>
          <p className="text-xs text-emerald-700">Transfer dibuat sebagai DRAFT dan tampil di daftar transfer normal.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => router.push('/transfers')} className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600">
            Ke Daftar Transfer
          </button>
          <button
            onClick={() => { setResult(null); setRows([emptyRow()]); setSelectedSender(null); setShowErrors(false); setImportErrors([]); setImportSuccessInfo(''); }}
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

      {/* Data rekening debit untuk BRI Qlola — satu kali per batch */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div>
          <div className="text-sm font-medium">Rekening Debit BRI</div>
          <p className="text-xs text-muted-foreground">
            Dipakai untuk seluruh transaksi di batch ini saat file BRI Qlola diunduh.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="qlola-debit-account" className="text-xs text-muted-foreground">
              Rekening Debit BRI <span className="text-red-600">*</span>
            </label>
            <input
              id="qlola-debit-account"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={qlolaDebitAccount}
              onChange={(e) => setQlolaDebitAccount(e.target.value)}
              maxLength={QLOLA_DEBIT_ACCOUNT_MAX}
              placeholder={`${QLOLA_DEBIT_ACCOUNT_MIN}-${QLOLA_DEBIT_ACCOUNT_MAX} karakter`}
            />
            {showErrors && qlolaDebitAccountErr && (
              <p className="text-xs text-red-600">{qlolaDebitAccountErr}</p>
            )}
          </div>
          <div className="space-y-1">
            <label htmlFor="qlola-sender-name" className="text-xs text-muted-foreground">
              Nama Pengirim <span className="text-red-600">*</span>
            </label>
            <input
              id="qlola-sender-name"
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={qlolaSenderName}
              onChange={(e) => setQlolaSenderName(e.target.value)}
              maxLength={QLOLA_SENDER_NAME_MAX}
              placeholder="Nama pemilik rekening debit"
            />
            {showErrors && qlolaSenderNameErr && (
              <p className="text-xs text-red-600">{qlolaSenderNameErr}</p>
            )}
          </div>
        </div>
      </div>

      {/* Excel import */}
      <div className="rounded-2xl border p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-700">Import dari Excel (opsional)</h2>
            <p className="text-xs text-muted-foreground">
              Unduh template, isi data, lalu import untuk mengisi baris penerima secara otomatis.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadBulkTransferTemplate}
              className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 whitespace-nowrap"
            >
              Download Template
            </button>
            <label
              htmlFor="bulk-import-file"
              className="rounded-lg border px-3 py-2 text-xs hover:bg-slate-50 whitespace-nowrap cursor-pointer"
            >
              Import Excel
            </label>
            <input
              id="bulk-import-file"
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onImportFileChange}
            />
          </div>
        </div>
        {importErrors.length > 0 && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-700 space-y-1">
            {importErrors.map((e, i) => <p key={i}>{e}</p>)}
          </div>
        )}
        {importSuccessInfo && importErrors.length === 0 && (
          <p className="text-xs text-emerald-700">{importSuccessInfo}</p>
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
                  <label htmlFor={`row-account-name-${i}`} className="text-xs text-muted-foreground">Nama Rekening</label>
                  <input
                    id={`row-account-name-${i}`}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.beneficiaryAccountName}
                    onChange={(e) => updateRow(i, { beneficiaryAccountName: e.target.value })}
                  />
                </div>
                <div>
                  <label htmlFor={`row-bank-code-${i}`} className="text-xs text-muted-foreground">Bank Penerima</label>
                  <select
                    id={`row-bank-code-${i}`}
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
                  <label htmlFor={`row-account-number-${i}`} className="text-xs text-muted-foreground">Nomor Rekening</label>
                  <input
                    id={`row-account-number-${i}`}
                    inputMode="numeric"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.beneficiaryAccountNumber}
                    onChange={(e) => onRowAccountChange(i, e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor={`row-amount-${i}`} className="text-xs text-muted-foreground">Nominal</label>
                  <input
                    id={`row-amount-${i}`}
                    type="number"
                    min={TRANSFER_MIN_AMOUNT}
                    max={effectiveMaxAmount}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.amount}
                    onChange={(e) => updateRow(i, { amount: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label htmlFor={`row-purpose-${i}`} className="text-xs text-muted-foreground">Tujuan Transaksi</label>
                  <input
                    id={`row-purpose-${i}`}
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.transaction_purpose}
                    onChange={(e) => updateRow(i, { transaction_purpose: e.target.value })}
                    placeholder="mis: pembayaran vendor"
                  />
                </div>
                <div>
                  <label htmlFor={`row-relationship-${i}`} className="text-xs text-muted-foreground">Hubungan dengan Pengirim</label>
                  <select
                    id={`row-relationship-${i}`}
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
                <div>
                  <label htmlFor={`row-mobile-${i}`} className="text-xs text-muted-foreground">No. Handphone Penerima</label>
                  <input
                    id={`row-mobile-${i}`}
                    inputMode="tel"
                    className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                    value={r.beneficiary_mobile_number}
                    onChange={(e) => updateRow(i, { beneficiary_mobile_number: e.target.value })}
                    placeholder="mis: 081234567890"
                  />
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
