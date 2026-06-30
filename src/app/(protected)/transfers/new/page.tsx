'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getRoleFromToken } from '@/lib/api';
import { createTransfer, type CreateTransferBody } from '@/lib/transfers';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';
import { ShieldOff, ChevronDown, ChevronRight } from 'lucide-react';

type ApprovedApp = {
  id: number | string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  status: string;
  display_name?: string | null;
  full_name?: string | null;
  legal_name?: string | null;
  email?: string | null;
  phone?: string | null;
};

type ApiRes = {
  items?: ApprovedApp[];
  total?: number;
};

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
  const [approvedApps, setApprovedApps] = useState<ApprovedApp[]>([]);
  const [senderApplicationId, setSenderApplicationId] = useState<string>('');
  const [showMeta, setShowMeta] = useState(false);

  const [form, setForm] = useState({
    amount: 10000,
    currency: 'IDR',
    beneficiaryBankName: '',
    beneficiaryBankCode: '',
    beneficiaryAccountNumber: '',
    beneficiaryAccountName: '',
    description: '',
    requestedTransferAt: '',
  });

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

  useEffect(() => {
    apiFetch<ApiRes | ApprovedApp[]>('/applications?status=APPROVED&limit=100').then((data) => {
      const list: ApprovedApp[] = Array.isArray(data) ? data : (data as ApiRes).items ?? [];
      setApprovedApps(list);
      if (list.length > 0) setSenderApplicationId(String(list[0].id));
    }).catch(() => {});
  }, []);

  function displayLabel(app: ApprovedApp) {
    const name = app.display_name || app.full_name || app.legal_name || `App #${app.id}`;
    const extra = app.phone || app.email || '';
    return `${name}${extra ? ` (${extra})` : ''}`;
  }

  async function submit() {
    if (!senderApplicationId) {
      setErr('Silakan pilih sender terlebih dahulu.');
      return;
    }

    // ── Validation ──────────────────────────────────────────────────────
    const amount = Number(form.amount);
    if (!(amount > 0)) {
      setErr('Amount harus lebih dari 0.');
      return;
    }
    const currency = (form.currency || 'IDR').trim().toUpperCase();
    if (currency.length !== 3) {
      setErr('Currency harus 3 huruf (contoh: IDR).');
      return;
    }
    if (!clean(form.beneficiaryBankName)) {
      setErr('Beneficiary bank wajib diisi.');
      return;
    }
    if (!clean(form.beneficiaryAccountNumber)) {
      setErr('Beneficiary account number wajib diisi.');
      return;
    }
    if (!clean(form.beneficiaryAccountName)) {
      setErr('Beneficiary account name wajib diisi.');
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
        setErr('Additional info harus berupa JSON object yang valid.');
        return;
      }
    }

    setLoading(true);
    setErr('');
    try {
      const body: CreateTransferBody = {
        amount,
        currency,
        beneficiaryBankName: form.beneficiaryBankName.trim(),
        beneficiaryBankCode: clean(form.beneficiaryBankCode),
        beneficiaryAccountNumber: form.beneficiaryAccountNumber.trim(),
        beneficiaryAccountName: form.beneficiaryAccountName.trim(),
        description: clean(form.description),
        requestedTransferAt: clean(form.requestedTransferAt),
        sender_application_id: Number(senderApplicationId),

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
      setErr(e instanceof Error ? e.message : 'Gagal create transfer');
    } finally {
      setLoading(false);
    }
  }

  // token !== null means auth has loaded; null = still hydrating (show nothing yet)
  if (token !== null && role !== 'FinanceStaff') {
    return (
      <div className="p-6 max-w-2xl">
        <div className="flex flex-col items-center gap-3 py-16 text-slate-500">
          <ShieldOff className="h-10 w-10 text-slate-300" />
          <p className="text-base font-medium text-slate-700">Access Denied</p>
          <p className="text-sm">Only FinanceStaff can create transfers.</p>
          <button
            onClick={() => router.push('/transfers')}
            className="mt-1 text-sm text-kesh-700 hover:underline"
          >
            Go to Transfers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">New Transfer</h1>
        <p className="text-sm text-muted-foreground">Buat draft transfer</p>
      </div>

      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      <div className="rounded-2xl border p-4 space-y-3">
        {/* Sender dropdown */}
        <div>
          <label className="text-xs text-muted-foreground">Sender (KYC/KYB Approved)</label>
          {approvedApps.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">Belum ada aplikasi berstatus APPROVED.</p>
          ) : (
            <select
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={senderApplicationId}
              onChange={(e) => setSenderApplicationId(e.target.value)}
            >
              {approvedApps.map((app) => (
                <option key={String(app.id)} value={String(app.id)}>
                  {displayLabel(app)}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">Amount</label>
            <input
              type="number"
              min={1}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.amount}
              onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value) }))}
            />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">Currency</label>
            <input
              maxLength={3}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm uppercase"
              value={form.currency}
              onChange={(e) => setForm((s) => ({ ...s, currency: e.target.value.toUpperCase() }))}
              placeholder="IDR"
            />
          </div>
          <div className="col-span-1">
            <label className="text-xs text-muted-foreground">Requested date (optional)</label>
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
            <label className="text-xs text-muted-foreground">Beneficiary bank</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.beneficiaryBankName}
              onChange={(e) => setForm((s) => ({ ...s, beneficiaryBankName: e.target.value }))}
              placeholder="BCA / Mandiri / BRI / ..."
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Beneficiary bank code (optional)</label>
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
            <label className="text-xs text-muted-foreground">Account number</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.beneficiaryAccountNumber}
              onChange={(e) => setForm((s) => ({ ...s, beneficiaryAccountNumber: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Account name</label>
            <input
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.beneficiaryAccountName}
              onChange={(e) => setForm((s) => ({ ...s, beneficiaryAccountName: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Description / remark (optional)</label>
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
          <span>SNAP / Transfer Metadata (optional)</span>
          {showMeta ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>

        {showMeta && (
          <div className="border-t p-4 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Partner reference no</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={meta.partner_reference_no}
                onChange={(e) => setMeta((s) => ({ ...s, partner_reference_no: e.target.value }))}
              />
              <p className="mt-1 text-xs text-slate-400">Leave blank to auto-generate.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Source account no</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_account_no}
                  onChange={(e) => setMeta((s) => ({ ...s, source_account_no: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Source account name</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_account_name}
                  onChange={(e) => setMeta((s) => ({ ...s, source_account_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Source bank code</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_bank_code}
                  onChange={(e) => setMeta((s) => ({ ...s, source_bank_code: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Source bank name</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.source_bank_name}
                  onChange={(e) => setMeta((s) => ({ ...s, source_bank_name: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Beneficiary address</label>
              <input
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                value={meta.beneficiary_address}
                onChange={(e) => setMeta((s) => ({ ...s, beneficiary_address: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Beneficiary email</label>
                <input
                  type="email"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.beneficiary_email}
                  onChange={(e) => setMeta((s) => ({ ...s, beneficiary_email: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Residence (2 chars)</label>
                <input
                  maxLength={2}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm uppercase"
                  value={meta.beneficiary_customer_residence}
                  onChange={(e) => setMeta((s) => ({ ...s, beneficiary_customer_residence: e.target.value.toUpperCase() }))}
                  placeholder="ID"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Customer type (2 chars)</label>
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
                <label className="text-xs text-muted-foreground">Transfer method</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.transfer_method}
                  onChange={(e) => setMeta((s) => ({ ...s, transfer_method: e.target.value }))}
                  placeholder="BANK_TRANSFER"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Transfer channel</label>
                <input
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.transfer_channel}
                  onChange={(e) => setMeta((s) => ({ ...s, transfer_channel: e.target.value }))}
                  placeholder="MANUAL"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Transaction date</label>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.transaction_date}
                  onChange={(e) => setMeta((s) => ({ ...s, transaction_date: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Requested execution date</label>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
                  value={meta.requested_execution_date}
                  onChange={(e) => setMeta((s) => ({ ...s, requested_execution_date: e.target.value }))}
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground">Additional info (JSON object, optional)</label>
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
        disabled={loading || !senderApplicationId}
        className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
      >
        {loading ? 'Saving…' : 'Create Draft'}
      </button>
    </div>
  );
}
