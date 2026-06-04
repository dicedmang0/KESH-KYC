'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, getRoleFromToken } from '@/lib/api';
import { useAuth } from '@/app/providers';

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
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  // useParams bisa balikin string atau string[]
  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [row, setRow] = useState<TransferRow | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionErr, setActionErr] = useState('');

  async function reload() {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      const data = await apiFetch<TransferRow>(`/transfers/${id}`);
      setRow(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal load detail transfer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function action(
    path: string,
    body?: Record<string, unknown>,
    opts?: { redirectOnSuccess?: boolean }
  ) {
    if (!id) return;
    setActionLoading(true);
    setActionErr('');
    try {
      await apiFetch(`/transfers/${id}${path}`, { method: 'POST', body });
      if (opts?.redirectOnSuccess) {
        router.push('/transfers');
      } else {
        await reload();
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Action gagal';
      setActionErr(
        msg.includes('403')
          ? "You don't have permission to perform this action."
          : msg
      );
    } finally {
      setActionLoading(false);
    }
  }

  // Role + status conditions for action visibility
  const canSubmit = role === 'FinanceStaff' && row?.status === 'DRAFT';
  const canDecide = role === 'FinanceManager' && row?.status === 'SUBMITTED';
  const canSetResult = role === 'FinanceManager' && row?.status === 'APPROVED';
  const hasAnyAction = canSubmit || canDecide || canSetResult;

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

          {/* Actions — shown only to roles with applicable permissions */}
          {hasAnyAction && (
            <div className="flex flex-wrap gap-2 pt-2">
              {canSubmit && (
                <button
                  className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                  disabled={actionLoading}
                  onClick={() => action('/submit', undefined, { redirectOnSuccess: true })}
                >
                  Submit
                </button>
              )}

              {canDecide && (
                <>
                  <button
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => action('/decision', { decision: 'APPROVE' })}
                  >
                    Approve
                  </button>
                  <button
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => action('/decision', { decision: 'REJECT', note: 'Rejected from UI' })}
                  >
                    Reject
                  </button>
                </>
              )}

              {canSetResult && (
                <>
                  <button
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => action('/result', { result: 'SUCCESS' })}
                  >
                    Set SUCCESS
                  </button>
                  <button
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => action('/result', { result: 'FAILED', note: 'Failed from UI' })}
                  >
                    Set FAILED
                  </button>
                </>
              )}
            </div>
          )}

          {/* Action error / 403 feedback */}
          {actionErr && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
              {actionErr}
            </div>
          )}

          {/* Read-only notice for roles with no applicable actions */}
          {!hasAnyAction && (
            <p className="text-xs text-slate-500 italic pt-1">
              Read-only view — no actions available for your role or current status.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
