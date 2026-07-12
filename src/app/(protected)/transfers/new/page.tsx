'use client';

import { useEffect, useRef, useState } from 'react';
import { getRoleFromToken } from '@/lib/api';
import {
  createTransfer,
  searchSenders,
  getTransferBanks,
  canCreateTransfer,
  FALLBACK_BANKS,
  TRANSFER_MIN_AMOUNT,
  TRANSFER_MAX_AMOUNT,
  type CreateTransferBody,
  type SenderSearchItem,
  type TransferBank,
} from '@/lib/transfers';
import { formatCif } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';
import { ShieldOff, ChevronDown, ChevronRight } from 'lucide-react';

/** Trim and convert empty strings to undefined so we never send empty fields. */
function clean(v: string): string | undefined {
  const t = v.trim();
  return t.length > 0 ? t : undefined;
}

export default function NewTransferPage() {
  const router = useRouter();
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [showMeta, setShowMeta] = useState(false);

  // ── Sender picker (searchable) ──────────────────────────────────────────────
  const [senderQuery, setSenderQuery] = useState('');
  const [senderResults, setSenderResults] = useState<SenderSearchItem[]>([]);
  const [senderSearching, setSenderSearching] = useState(false);
  const [selectedSender, setSelectedSender] = useState<SenderSearchItem | null>(null);
  const senderSeq = useRef(0);

  // ── Bank penerima dropdown ──────────────────────────────────────────────────
  const [banks, setBanks] = useState<TransferBank[]>(FALLBACK_BANKS);
  const [selectedBankCode, setSelectedBankCode] = useState('');

  const [form, setForm] = useState({
    amount: 10000,
    currency: 'IDR',
    beneficiaryBankName: '',
    beneficiaryBankCode: '',
    beneficiaryAccountNumber: '',
    beneficiaryAccountName: '',
    source_of_funds: '',
    transaction_purpose: '',
    description: '',
    requestedTransferAt: '',
  });

  const [acctError, setAcctError] = useState('');

  const [meta, setMeta] = useState({
    partner_reference_no: '',
    source_account_no: '',
    source_account_name: '',
    source_bank_code: '',
    source_bank_name: '',
    beneficiary_address: '',
    beneficiary_email: '',
    beneficiary_customer_residence: '',
    beneficiary_customer_type: '',
    transfer_method: 'BANK_TRANSFER',
    transfer_channel: 'MANUAL',
    transaction_date: '',
    requested_execution_date: '',
    additional_info: '',
  });

  // Load bank list (fallback to the built-in list on failure).
  useEffect(() => {
    getTransferBanks()
      .then((list) => { if (list && list.length) setBanks(list); })
      .catch(() => { /* keep FALLBACK_BANKS */ });
  }, []);

  // Debounced sender search — only fires once a sender is not yet locked in.
  useEffect(() => {
    if (selectedSender) return;
    const q = senderQuery.trim();
    if (q.length < 2) {
      setSenderResults([]);
      setSenderSearching(false);
      return;
    }
    const seq = ++senderSeq.current;
    setSenderSearching(true);
    const t = setTimeout(() => {
      searchSenders(q)
        .then((list) => {
          if (seq === senderSeq.current) setSenderResults(list);
        })
        .catch(() => {
          if (seq === senderSeq.current) setSenderResults([]);
        })
        .finally(() => {
          if (seq === senderSeq.current) setSenderSearching(false);
        });
    }, 300);
    return () => clearTimeout(t);
  }, [senderQuery, selectedSender]);

  function pickSender(s: SenderSearchItem) {
    setSelectedSender(s);
    setSenderResults([]);
    setSenderQuery('');
  }

  function clearSender() {
    setSelectedSender(null);
    setSenderQuery('');
    setSenderResults([]);
  }

  function onBankChange(code: string) {
    setSelectedBankCode(code);
    const bank = banks.find((b) => (b.code ?? '') === code);
    setForm((s) => ({
      ...s,
      beneficiaryBankName: bank?.name ?? '',
      beneficiaryBankCode: bank?.code ?? '',
    }));
  }

  function onAccountChange(v: string) {
    const digits = v.replace(/\D/g, '');
    setAcctError(digits !== v ? 'Nomor rekening hanya boleh berisi angka.' : '');
    setForm((s) => ({ ...s, beneficiaryAccountNumber: digits }));
  }

  // ── Derived validation ──────────────────────────────────────────────────────
  const amountNum = Number(form.amount);
  const amountError =
    !Number.isFinite(amountNum) || amountNum < TRANSFER_MIN_AMOUNT
      ? 'Minimum transfer Rp10.000'
      : amountNum > TRANSFER_MAX_AMOUNT
        ? 'Maksimum transfer Rp500.000.000'
        : '';

  const accountDigitsOnly = /^\d+$/.test(form.beneficiaryAccountNumber);

  const formValid =
    !!selectedSender &&
    !amountError &&
    !acctError &&
    accountDigitsOnly &&
    !!clean(form.beneficiaryBankName) &&
    !!clean(form.beneficiaryAccountName);

  async function submit() {
    if (!selectedSender) {
      setErr('Silakan pilih pengirim dari hasil pencarian.');
      return;
    }
    if (amountError) {
      setErr(amountError);
      return;
    }
    if (!accountDigitsOnly) {
      setErr('Nomor rekening hanya boleh berisi angka.');
      return;
    }
    const currency = (form.currency || 'IDR').trim().toUpperCase();
    if (currency.length !== 3) {
      setErr('Mata uang harus 3 huruf (contoh: IDR).');
      return;
    }
    if (!clean(form.beneficiaryBankName)) {
      setErr('Bank penerima wajib dipilih.');
      return;
    }
    if (!clean(form.beneficiaryAccountName)) {
      setErr('Nama rekening penerima wajib diisi.');
      return;
    }

    // additional_info must be a valid JSON object if provided.
    let additionalInfo: Record<string, unknown> | undefined;
    const rawInfo = meta.additional_info.trim();
    if (rawInfo) {
      try {
        const parsed = JSON.parse(rawInfo);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        additionalInfo = parsed as Record<string, unknown>;
      } catch {
        setErr('Info tambahan harus berupa JSON object yang valid.');
        return;
      }
    }

    setLoading(true);
    setErr('');
    try {
      const body: CreateTransferBody = {
        amount: amountNum,
        currency,
        beneficiaryBankName: form.beneficiaryBankName.trim(),
        beneficiaryBankCode: clean(form.beneficiaryBankCode),
        beneficiaryAccountNumber: form.beneficiaryAccountNumber.trim(),
        beneficiaryAccountName: form.beneficiaryAccountName.trim(),
        source_of_funds: clean(form.source_of_funds),
        transaction_purpose: clean(form.transaction_purpose),
        description: clean(form.description),
        requestedTransferAt: clean(form.requestedTransferAt),
        sender_application_id: Number(selectedSender.application_id),

        // SNAP / transfer metadata — only sent when filled
        partner_reference_no: clean(meta.partner_reference_no),
        source_account_no: clean(meta.source_account_no),
        source_account_name: clean(meta.source_account_name),
        source_bank_code: clean(meta.source_bank_code),
        source_bank_name: clean(meta.source_bank_name),
        beneficiary_address: clean(meta.beneficiary_address),
        beneficiary_email: clean(meta.beneficiary_email),
        beneficiary_customer_residence: clean(meta.beneficiary_customer_residence),
        beneficiary_customer_type: clean(meta.beneficiary_customer_type),
        transfer_method: clean(meta.transfer_method),
        transfer_channel: clean(meta.transfer_channel),
        transaction_date: clean(meta.transaction_date),
        requested_execution_date: clean(meta.requested_execution_date),
        additional_info: additionalInfo,
      };

      const created = await createTransfer(body);
      router.push(`/transfers/${created.id}`);
    } catch (e: unknown) {
      // Surfaces the backend message (e.g. "Pengguna jasa harus berstatus
      // APPROVED untuk pencatatan transfer.") both inline and as a toast.
      const msg = e instanceof Error ? e.message : 'Gagal membuat transfer';
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
          <button
            onClick={() => router.push('/transfers')}
            className="mt-1 text-sm text-kesh-700 hover:underline"
          >
            Ke Pencatatan Transfer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Transfer Baru</h1>
        <p className="text-sm text-muted-foreground">Buat draft transfer</p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="rounded-2xl border p-4 space-y-3">
        {/* Sender searchable picker */}
        <div>
          <label className="text-xs text-muted-foreground">Pengirim (KYC/KYB Disetujui)</label>
          <p className="mt-0.5 text-xs text-slate-400">
            Hanya pengguna jasa berstatus APPROVED yang dapat dicatat transaksinya.
          </p>

          {selectedSender ? (
            <div className="mt-1 rounded-lg border bg-slate-50 p-3 space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Nama Pengirim</div>
                  <div className="text-sm font-medium">
                    {selectedSender.display_name || `App #${selectedSender.application_id}`}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">CIF Pengirim</div>
                  <div className="text-sm font-medium font-mono">{formatCif(selectedSender.cif_no)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Tipe Pengirim</div>
                  <div className="text-sm font-medium">{selectedSender.application_type ?? '—'}</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Application ID #{selectedSender.application_id}</span>
                <button type="button" onClick={clearSender} className="text-xs text-kesh-700 hover:underline">
                  Ganti Pengirim
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-1 space-y-1">
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                value={senderQuery}
                onChange={(e) => setSenderQuery(e.target.value)}
                placeholder="Cari nama atau CIF pengirim…"
              />
              {senderQuery.trim().length > 0 && senderQuery.trim().length < 2 && (
                <p className="text-xs text-slate-400">Ketik minimal 2 karakter untuk mencari.</p>
              )}
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
                        onClick={() => pickSender(s)}
                        className="w-full text-left px-3 py-2 hover:bg-slate-50"
                      >
                        <div className="text-sm font-medium">
                          {(s.display_name || `App #${s.application_id}`)} — <span className="font-mono">{formatCif(s.cif_no)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {(s.application_type ?? '—')} / {(s.status ?? '—')}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">Nominal</label>
            <input
              type="number"
              min={TRANSFER_MIN_AMOUNT}
              max={TRANSFER_MAX_AMOUNT}
              className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${amountError ? 'border-red-400' : ''}`}
              value={form.amount}
              onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value) }))}
            />
            {amountError ? (
              <p className="mt-1 text-xs text-red-600">{amountError}</p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">Rp10.000 – Rp500.000.000</p>
            )}
          </div>
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">Mata Uang</label>
            <input
              maxLength={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm uppercase"
              value={form.currency}
              onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value.toUpperCase() }))}
              placeholder="IDR"
            />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">Tanggal Diminta (opsional)</label>
            <input
              type="date"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.requestedTransferAt}
              onChange={(e) => setForm((s) => ({ ...s, requestedTransferAt: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Bank Penerima</label>
            <select
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white"
              value={selectedBankCode}
              onChange={(e) => onBankChange(e.target.value)}
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
            <label className="text-xs text-muted-foreground">Kode Bank Penerima (opsional)</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.beneficiaryBankCode}
              onChange={(e) => setForm((s) => ({ ...s, beneficiaryBankCode: e.target.value }))}
              placeholder="014 / CENAIDJA / ..."
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Nomor Rekening</label>
            <input
              inputMode="numeric"
              className={`mt-1 w-full border rounded-lg px-3 py-2 text-sm ${acctError ? 'border-red-400' : ''}`}
              value={form.beneficiaryAccountNumber}
              onChange={(e) => onAccountChange(e.target.value)}
            />
            {acctError && <p className="mt-1 text-xs text-red-600">{acctError}</p>}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Nama Rekening</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.beneficiaryAccountName}
              onChange={(e) => setForm((s) => ({ ...s, beneficiaryAccountName: e.target.value }))}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Sumber Dana</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.source_of_funds}
              onChange={(e) => setForm((s) => ({ ...s, source_of_funds: e.target.value }))}
              placeholder="mis: gaji, hasil usaha"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Tujuan Transaksi</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.transaction_purpose}
              onChange={(e) => setForm((s) => ({ ...s, transaction_purpose: e.target.value }))}
              placeholder="mis: pembayaran vendor"
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Keterangan (opsional)</label>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            placeholder="mis: pembayaran vendor"
          />
        </div>
      </div>

      {/* ── Optional SNAP / Transfer Metadata ─────────────────────────────── */}
      <div className="rounded-2xl border">
        <button
          type="button"
          onClick={() => setShowMeta((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        >
          <span>Metadata SNAP / Transfer (opsional)</span>
          {showMeta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showMeta && (
          <div className="border-t p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Nomor Referensi Partner</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={meta.partner_reference_no}
                onChange={(e) => setMeta((s) => ({ ...s, partner_reference_no: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-400">Kosongkan untuk dibuat otomatis.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Nomor Rekening Sumber</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_account_no}
                  onChange={(e) => setMeta((s) => ({ ...s, source_account_no: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nama Rekening Sumber</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_account_name}
                  onChange={(e) => setMeta((s) => ({ ...s, source_account_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Kode Bank Sumber</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_bank_code}
                  onChange={(e) => setMeta((s) => ({ ...s, source_bank_code: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Nama Bank Sumber</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_bank_name}
                  onChange={(e) => setMeta((s) => ({ ...s, source_bank_name: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Alamat Penerima</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={meta.beneficiary_address}
                onChange={(e) => setMeta((s) => ({ ...s, beneficiary_address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Email Penerima</label>
                <input
                  type="email"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.beneficiary_email}
                  onChange={(e) => setMeta((s) => ({ ...s, beneficiary_email: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Kode Domisili (2 karakter)</label>
                <input
                  maxLength={2}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm uppercase"
                  value={meta.beneficiary_customer_residence}
                  onChange={(e) => setMeta((s) => ({ ...s, beneficiary_customer_residence: e.target.value.toUpperCase() }))}
                  placeholder="ID"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tipe Nasabah (2 karakter)</label>
                <input
                  maxLength={2}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm uppercase"
                  value={meta.beneficiary_customer_type}
                  onChange={(e) => setMeta((s) => ({ ...s, beneficiary_customer_type: e.target.value.toUpperCase() }))}
                  placeholder="01"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Metode Transfer</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.transfer_method}
                  onChange={(e) => setMeta((s) => ({ ...s, transfer_method: e.target.value }))}
                  placeholder="BANK_TRANSFER"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Kanal Transfer</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.transfer_channel}
                  onChange={(e) => setMeta((s) => ({ ...s, transfer_channel: e.target.value }))}
                  placeholder="MANUAL"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tanggal Transaksi</label>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.transaction_date}
                  onChange={(e) => setMeta((s) => ({ ...s, transaction_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Tanggal Eksekusi Diminta</label>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.requested_execution_date}
                  onChange={(e) => setMeta((s) => ({ ...s, requested_execution_date: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Info Tambahan (JSON object, opsional)</label>
              <textarea
                rows={4}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono"
                value={meta.additional_info}
                onChange={(e) => setMeta((s) => ({ ...s, additional_info: e.target.value }))}
                placeholder='{ "purpose": "vendor payment" }'
              />
            </div>
          </div>
        )}
      </div>

      <button
        onClick={submit}
        disabled={loading || !formValid}
        className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Menyimpan…' : 'Buat Draft'}
      </button>
    </div>
  );
}
