'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { useRouter } from 'next/navigation';

type ApprovedUser = {
  person_id: number;
  full_name: string;
  email: string | null;
  phone: string | null;
  application_status: string;
  registration_date: string;
};

export default function NewTransferPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [approvedUsers, setApprovedUsers] = useState<ApprovedUser[]>([]);
  const [senderId, setSenderId] = useState<number | null>(null);

  const [form, setForm] = useState({
    amount: 10000,
    beneficiaryBankName: '',
    beneficiaryBankCode: '',
    beneficiaryAccountNumber: '',
    beneficiaryAccountName: '',
    description: '',
    requestedTransferAt: '', // YYYY-MM-DD
  });

  // Load approved KYC users for sender dropdown
  useEffect(() => {
    apiFetch<ApprovedUser[]>('/users?limit=100').then((data) => {
      const approved = data.filter(u => u.application_status === 'APPROVED');
      setApprovedUsers(approved);
      if (approved.length > 0) setSenderId(approved[0].person_id);
    });
  }, []);

  async function submit() {
    if (!senderId) {
      setErr('Silakan pilih sender terlebih dahulu.');
      return;
    }

    setLoading(true);
    setErr('');
    try {
      const created = await apiFetch<any>('/transfers', {
        method: 'POST',
        body: {
          amount: Number(form.amount),
          beneficiaryBankName: form.beneficiaryBankName,
          beneficiaryBankCode: form.beneficiaryBankCode || undefined,
          beneficiaryAccountNumber: form.beneficiaryAccountNumber,
          beneficiaryAccountName: form.beneficiaryAccountName,
          description: form.description || undefined,
          requestedTransferAt: form.requestedTransferAt || undefined,
          sender_application_id: Number(senderId), // pakai person_id dari approved user
        },
      });
      router.push(`/transfers/${created.id}`);
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal create transfer');
    } finally {
      setLoading(false);
    }
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
          <label className="text-xs text-muted-foreground">Sender</label>
          <select
            className="w-full border rounded-lg px-3 py-2"
            value={senderId ?? undefined}
            onChange={(e) => setSenderId(Number(e.target.value))}
          >
            {approvedUsers.map((u) => (
              <option key={u.person_id} value={u.person_id}>
                {u.full_name} ({u.phone || 'no phone'})
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Amount</label>
            <input
              type="number"
              className="w-full border rounded-lg px-3 py-2"
              value={form.amount}
              onChange={(e) =>
                setForm((s) => ({ ...s, amount: Number(e.target.value) }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Requested date (optional)</label>
            <input
              type="date"
              className="w-full border rounded-lg px-3 py-2"
              value={form.requestedTransferAt}
              onChange={(e) =>
                setForm((s) => ({ ...s, requestedTransferAt: e.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Beneficiary bank</label>
          <input
            className="w-full border rounded-lg px-3 py-2"
            value={form.beneficiaryBankName}
            onChange={(e) =>
              setForm((s) => ({ ...s, beneficiaryBankName: e.target.value }))
            }
            placeholder="BCA / Mandiri / BRI / ..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Account number</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.beneficiaryAccountNumber}
              onChange={(e) =>
                setForm((s) => ({ ...s, beneficiaryAccountNumber: e.target.value }))
              }
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Account name</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={form.beneficiaryAccountName}
              onChange={(e) =>
                setForm((s) => ({ ...s, beneficiaryAccountName: e.target.value }))
              }
            />
          </div>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Description (optional)</label>
          <input
            className="w-full border rounded-lg px-3 py-2"
            value={form.description}
            onChange={(e) =>
              setForm((s) => ({ ...s, description: e.target.value }))
            }
            placeholder="mis: pembayaran vendor"
          />
        </div>

        <button
          onClick={submit}
          disabled={loading}
          className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-60"
        >
          {loading ? 'Saving…' : 'Create Draft'}
        </button>
      </div>
    </div>
  );
}