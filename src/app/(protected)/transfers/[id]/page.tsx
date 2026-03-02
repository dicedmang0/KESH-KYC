'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type TransferRow = {
  id: number;
  branch_id: number | null;
  amount: string;
  currency: string;
  beneficiary_bank_name: string;
  beneficiary_bank_code: string | null;
  beneficiary_account_number: string;
  beneficiary_account_name: string;
  description: string | null;
  requested_transfer_at: string | null;
  attachment_uri: string | null;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED';
  result: 'SUCCESS' | 'FAILED' | null;
  result_notes: string | null;
  created_by: number | null;
  submitted_at: string | null;
  approved_by: number | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string | null;
};

export default function TransferDetailPage() {
  const router = useRouter();
  const params = useParams();

  // useParams bisa balikin string atau string[]
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [row, setRow] = useState<TransferRow | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  async function reload() {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch<TransferRow>(`/transfers/${id}`);
      setRow(data);
    } catch (e: any) {
      setErr(e?.message ?? 'Gagal load detail transfer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(path: string, body?: any, opts?: { redirectOnSuccess?: boolean }) {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/transfers/${id}${path}`, {
        method: 'POST',
        body,
      });

      if (opts?.redirectOnSuccess) {
        // ✅ setelah submit → kembali ke list transfers
        router.push('/transfers');
      } else {
        // untuk approve/reject/result, tetap di halaman detail dan reload data
        await reload();
      }
    } catch (e: any) {
      alert(e?.message ?? 'Action gagal');
    } finally {
      setActionLoading(false);
    }
  }

  if (!id) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Transfer</h1>
        <p className="text-sm text-neutral-500">Invalid transfer ID.</p>
        <button
          className="mt-4 text-sm underline"
          onClick={() => router.push('/transfers')}
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Transfer #{row?.id ?? id}
          </h1>
          {row && (
            <p className="text-sm text-neutral-500">
              {row.status}
              {row.result ? ` • ${row.result}` : ''}
            </p>
          )}
        </div>
        <button
          className="text-sm underline"
          onClick={() => router.push('/transfers')}
        >
          Back
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading && (
        <div className="text-sm text-neutral-500">
          Loading detail…
        </div>
      )}

      {row && (
        <div className="rounded-2xl border p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs text-neutral-500">Beneficiary</div>
              <div className="font-medium">
                {row.beneficiary_account_name}
              </div>
              <div className="text-xs text-neutral-500">
                {row.beneficiary_account_number}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Bank</div>
              <div className="font-medium">{row.beneficiary_bank_name}</div>
              {row.beneficiary_bank_code && (
                <div className="text-xs text-neutral-500">
                  Code: {row.beneficiary_bank_code}
                </div>
              )}
            </div>
            <div>
              <div className="text-xs text-neutral-500">Amount</div>
              <div className="font-medium">
                {row.amount} {row.currency}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Requested date</div>
              <div className="font-medium">
                {row.requested_transfer_at
                  ? new Date(row.requested_transfer_at).toLocaleString('id-ID')
                  : '-'}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-2">
            {/* Submit → setelah sukses, redirect ke /transfers */}
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={actionLoading}
              onClick={() => action('/submit', undefined, { redirectOnSuccess: true })}
            >
              Submit (FinanceStaff)
            </button>

            {/* Approve / Reject */}
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={actionLoading}
              onClick={() => action('/decision', { decision: 'APPROVE' })}
            >
              Approve (FinanceManager)
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={actionLoading}
              onClick={() =>
                action('/decision', {
                  decision: 'REJECT',
                  note: 'Rejected from UI',
                })
              }
            >
              Reject (FinanceManager)
            </button>

            {/* Set Result */}
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={actionLoading}
              onClick={() => action('/result', { result: 'SUCCESS' })}
            >
              Set SUCCESS (FinanceManager)
            </button>
            <button
              className="rounded-lg border px-3 py-2 text-sm"
              disabled={actionLoading}
              onClick={() =>
                action('/result', {
                  result: 'FAILED',
                  note: 'Failed from UI',
                })
              }
            >
              Set FAILED (FinanceManager)
            </button>
          </div>

          <p className="text-xs text-neutral-500 pt-1">
            Submit bisa dilakukan oleh FinanceStaff; approve / set result oleh
            FinanceManager. Kalau role tidak sesuai, backend akan mengembalikan 403.
          </p>
        </div>
      )}
    </div>
  );
}
