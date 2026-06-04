'use client';

import { useEffect, useState } from 'react';
import { apiFetch, getRoleFromToken } from '@/lib/api';
import { useAuth } from '@/app/providers';
import { useRouter } from 'next/navigation';
import { ShieldOff } from 'lucide-react';

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

export default function NewTransferPage() {
  const router = useRouter();
  const { token } = useAuth();
  const role = getRoleFromToken(token);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [approvedApps, setApprovedApps] = useState<ApprovedApp[]>([]);
  const [senderApplicationId, setSenderApplicationId] = useState<string>('');

  const [form, setForm] = useState({
    amount: 10000,
    beneficiaryBankName: '',
    beneficiaryBankCode: '',
    beneficiaryAccountNumber: '',
    beneficiaryAccountName: '',
    description: '',
    requestedTransferAt: '',
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

    setLoading(true);
    setErr('');
    try {
      const created = await apiFetch<{ id: number | string }>('/transfers', {
        method: 'POST',
        body: {
          amount: Number(form.amount),
          beneficiaryBankName: form.beneficiaryBankName,
          beneficiaryBankCode: form.beneficiaryBankCode || undefined,
          beneficiaryAccountNumber: form.beneficiaryAccountNumber,
          beneficiaryAccountName: form.beneficiaryAccountName,
          description: form.description || undefined,
          requestedTransferAt: form.requestedTransferAt || undefined,
          sender_application_id: Number(senderApplicationId),
        },
      });
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
            className="mt-1 text-sm text-amber-700 hover:underline"
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Amount</label>
            <input
              type="number"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.amount}
              onChange={(e) => setForm((s) => ({ ...s, amount: Number(e.target.value) }))}
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Requested date (optional)</label>
            <input
              type="date"
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
              value={form.requestedTransferAt}
              onChange={(e) => setForm((s) => ({ ...s, requestedTransferAt: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Beneficiary bank</label>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={form.beneficiaryBankName}
            onChange={(e) => setForm((s) => ({ ...s, beneficiaryBankName: e.target.value }))}
            placeholder="BCA / Mandiri / BRI / ..."
          />
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
          <label className="text-xs text-muted-foreground">Description (optional)</label>
          <input
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm"
            value={form.description}
            onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
            placeholder="mis: pembayaran vendor"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading || !senderApplicationId}
          className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {loading ? 'Saving…' : 'Create Draft'}
        </button>
      </div>
    </div>
  );
}
