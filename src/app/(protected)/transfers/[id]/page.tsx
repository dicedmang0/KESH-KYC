'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getRoleFromToken } from '@/lib/api';
import {
  getTransfer,
  getTransferSnapPreview,
  submitTransfer,
  decideTransfer,
  setTransferResult,
  formatTransferAmount,
  transferReference,
  formatDateTime,
  type TransferDetail,
} from '@/lib/transfers';
import { useAuth } from '@/app/providers';
import { TransferStatusBadge, TransferResultBadge } from '@/components/transfer-badges';

// ── Small presentational helpers ─────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div>
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-sm font-medium break-words">
        {empty ? <span className="text-neutral-400 font-normal">-</span> : value}
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <h2 className="text-sm font-semibold text-neutral-700">{title}</h2>
      {children}
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value?: unknown }) {
  const [open, setOpen] = useState(false);
  const hasValue =
    value !== null &&
    value !== undefined &&
    !(typeof value === 'object' && Object.keys(value as object).length === 0);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-medium text-kesh-700 hover:underline"
        disabled={!hasValue}
      >
        {label} {hasValue ? (open ? '▾' : '▸') : '(empty)'}
      </button>
      {open && hasValue && (
        <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-neutral-50 border p-3 text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function TransferDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const rawId = params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  const [row, setRow] = useState<TransferDetail | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionErr, setActionErr] = useState('');

  // panel: which action form is open
  const [panel, setPanel] = useState<'none' | 'approve' | 'reject' | 'result'>('none');

  // decision form
  const [decisionNotes, setDecisionNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // result form
  const [resultForm, setResultForm] = useState({
    result: 'SUCCESS' as 'SUCCESS' | 'FAILED',
    result_notes: '',
    result_reference_no: '',
    bank_reference_no: '',
    external_reference_no: '',
    provider_reference_no: '',
    provider_response_code: '',
    provider_response_message: '',
    latest_transaction_status: '',
    transaction_status_desc: '',
    result_attachment_uri: '',
    failed_reason: '',
    provider_response: '',
  });

  // snap preview
  const [snap, setSnap] = useState<Record<string, unknown> | null>(null);
  const [snapLoading, setSnapLoading] = useState(false);
  const [snapErr, setSnapErr] = useState('');

  async function reload() {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      setRow(await getTransfer(id));
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

  function handleActionError(e: unknown) {
    const msg = e instanceof Error ? e.message : 'Action gagal';
    setActionErr(
      msg.includes('403') ? "You don't have permission to perform this action." : msg,
    );
  }

  async function doSubmit() {
    if (!id) return;
    setActionLoading(true);
    setActionErr('');
    try {
      await submitTransfer(id);
      router.push('/transfers');
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function doDecide(decision: 'APPROVE' | 'REJECT') {
    if (!id) return;
    if (decision === 'REJECT' && !rejectReason.trim()) {
      setActionErr('Reject reason is recommended — please provide one.');
      return;
    }
    setActionLoading(true);
    setActionErr('');
    try {
      await decideTransfer(id, {
        decision,
        decision_notes: decisionNotes.trim() || undefined,
        reject_reason: decision === 'REJECT' ? rejectReason.trim() || undefined : undefined,
      });
      setPanel('none');
      setDecisionNotes('');
      setRejectReason('');
      await reload();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function doResult() {
    if (!id) return;
    const f = resultForm;
    if (f.result === 'FAILED' && !f.failed_reason.trim()) {
      setActionErr('Failed reason is recommended when result is FAILED.');
      return;
    }
    let providerResponse: Record<string, unknown> | undefined;
    const rawPr = f.provider_response.trim();
    if (rawPr) {
      try {
        const parsed = JSON.parse(rawPr);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          throw new Error('not an object');
        }
        providerResponse = parsed as Record<string, unknown>;
      } catch {
        setActionErr('Provider response must be a valid JSON object.');
        return;
      }
    }
    const c = (v: string) => (v.trim() ? v.trim() : undefined);
    setActionLoading(true);
    setActionErr('');
    try {
      await setTransferResult(id, {
        result: f.result,
        result_notes: c(f.result_notes),
        result_reference_no: c(f.result_reference_no),
        bank_reference_no: c(f.bank_reference_no),
        external_reference_no: c(f.external_reference_no),
        provider_reference_no: c(f.provider_reference_no),
        provider_response_code: c(f.provider_response_code),
        provider_response_message: c(f.provider_response_message),
        latest_transaction_status: c(f.latest_transaction_status),
        transaction_status_desc: c(f.transaction_status_desc),
        result_attachment_uri: c(f.result_attachment_uri),
        failed_reason: f.result === 'FAILED' ? c(f.failed_reason) : undefined,
        provider_response: providerResponse,
      });
      setPanel('none');
      await reload();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function loadSnap() {
    if (!id) return;
    setSnapLoading(true);
    setSnapErr('');
    try {
      setSnap(await getTransferSnapPreview(id));
    } catch (e: unknown) {
      setSnapErr(e instanceof Error ? e.message : 'Gagal load SNAP preview');
    } finally {
      setSnapLoading(false);
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
          className="mt-4 text-sm text-kesh-700 hover:underline"
          onClick={() => router.push('/transfers')}
        >
          Back
        </button>
      </div>
    );
  }

  const inputCls = 'mt-1 w-full border rounded-lg px-3 py-2 text-sm';

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Transfer #{row?.id ?? id}</h1>
          {row && (
            <p className="text-sm text-neutral-500 font-mono">{transferReference(row)}</p>
          )}
        </div>
        <button
          className="text-sm text-kesh-700 hover:underline"
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

      {loading && <div className="text-sm text-neutral-500">Loading detail…</div>}

      {row && (
        <>
          {/* 1. Summary */}
          <SectionCard title="Summary">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Partner reference no" value={row.partner_reference_no} />
              <Field label="Status" value={<TransferStatusBadge status={row.status} />} />
              <Field label="Result" value={<TransferResultBadge result={row.result} />} />
              <Field label="Amount" value={formatTransferAmount(row)} />
              <Field label="Transfer method" value={row.transfer_method} />
              <Field label="Transfer channel" value={row.transfer_channel} />
              <Field label="Created at" value={formatDateTime(row.created_at)} />
            </div>
          </SectionCard>

          {/* 2. Sender / Source */}
          <SectionCard title="Sender / Source">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Sender application ID" value={row.sender_application_id} />
              <Field label="Source account no" value={row.source_account_no} />
              <Field label="Source account name" value={row.source_account_name} />
              <Field label="Source bank code" value={row.source_bank_code} />
              <Field label="Source bank name" value={row.source_bank_name} />
            </div>
          </SectionCard>

          {/* 3. Beneficiary */}
          <SectionCard title="Beneficiary">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Account name" value={row.beneficiary_account_name} />
              <Field label="Account number" value={row.beneficiary_account_number} />
              <Field label="Bank code" value={row.beneficiary_bank_code} />
              <Field label="Bank name" value={row.beneficiary_bank_name} />
              <Field label="Address" value={row.beneficiary_address} />
              <Field label="Email" value={row.beneficiary_email} />
              <Field label="Residence" value={row.beneficiary_customer_residence} />
              <Field label="Customer type" value={row.beneficiary_customer_type} />
            </div>
          </SectionCard>

          {/* 4. Timeline / Audit Trail */}
          <SectionCard title="Timeline / Audit Trail">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Created by" value={row.created_by} />
              <Field label="Submitted by" value={row.submitted_by} />
              <Field label="Submitted at" value={formatDateTime(row.submitted_at)} />
              <Field label="Approved by" value={row.approved_by} />
              <Field label="Approved at" value={formatDateTime(row.approved_at)} />
              <Field label="Rejected by" value={row.rejected_by} />
              <Field label="Rejected at" value={formatDateTime(row.rejected_at)} />
              <Field label="Result updated by" value={row.result_updated_by} />
              <Field label="Result updated at" value={formatDateTime(row.result_updated_at)} />
              <Field label="Completed at" value={formatDateTime(row.completed_at)} />
              <Field label="Failed at" value={formatDateTime(row.failed_at)} />
            </div>
          </SectionCard>

          {/* 5. Decision Notes */}
          <SectionCard title="Decision Notes">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Decision notes" value={row.decision_notes} />
              <Field label="Reject reason" value={row.reject_reason} />
            </div>
          </SectionCard>

          {/* 6. Result / Provider */}
          <SectionCard title="Result / Provider">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Result reference no" value={row.result_reference_no} />
              <Field label="Bank reference no" value={row.bank_reference_no} />
              <Field label="External reference no" value={row.external_reference_no} />
              <Field label="Provider reference no" value={row.provider_reference_no} />
              <Field label="Provider response code" value={row.provider_response_code} />
              <Field label="Provider response message" value={row.provider_response_message} />
              <Field label="Latest transaction status" value={row.latest_transaction_status} />
              <Field label="Transaction status desc" value={row.transaction_status_desc} />
              <Field label="Failed reason" value={row.failed_reason} />
              <Field label="Result attachment URI" value={row.result_attachment_uri} />
              <Field label="Result notes" value={row.result_notes} />
            </div>
          </SectionCard>

          {/* 7. Additional Info / Provider JSON */}
          <SectionCard title="Additional Info / Provider JSON">
            <div className="space-y-2">
              <JsonBlock label="Additional info" value={row.additional_info} />
              <JsonBlock label="Provider request" value={row.provider_request} />
              <JsonBlock label="Provider response" value={row.provider_response} />
            </div>
          </SectionCard>

          {/* Actions */}
          {hasAnyAction && (
            <SectionCard title="Actions">
              <div className="flex flex-wrap gap-2">
                {canSubmit && (
                  <button
                    className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doSubmit}
                  >
                    Submit
                  </button>
                )}
                {canDecide && (
                  <>
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={() => { setPanel(panel === 'approve' ? 'none' : 'approve'); setActionErr(''); }}
                    >
                      Approve
                    </button>
                    <button
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={() => { setPanel(panel === 'reject' ? 'none' : 'reject'); setActionErr(''); }}
                    >
                      Reject
                    </button>
                  </>
                )}
                {canSetResult && (
                  <button
                    className="rounded-lg bg-kesh-700 px-3 py-2 text-sm text-white hover:bg-kesh-600 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => { setPanel(panel === 'result' ? 'none' : 'result'); setActionErr(''); }}
                  >
                    Set Result
                  </button>
                )}
              </div>

              {/* Approve form */}
              {canDecide && panel === 'approve' && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Decision notes (optional)</label>
                    <textarea
                      rows={3}
                      className={inputCls}
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                    />
                  </div>
                  <button
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => doDecide('APPROVE')}
                  >
                    {actionLoading ? 'Saving…' : 'Confirm Approve'}
                  </button>
                </div>
              )}

              {/* Reject form */}
              {canDecide && panel === 'reject' && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Reject reason (recommended)</label>
                    <input
                      className={inputCls}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Decision notes (optional)</label>
                    <textarea
                      rows={3}
                      className={inputCls}
                      value={decisionNotes}
                      onChange={(e) => setDecisionNotes(e.target.value)}
                    />
                  </div>
                  <button
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => doDecide('REJECT')}
                  >
                    {actionLoading ? 'Saving…' : 'Confirm Reject'}
                  </button>
                </div>
              )}

              {/* Result form */}
              {canSetResult && panel === 'result' && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Result</label>
                    <select
                      className={inputCls}
                      value={resultForm.result}
                      onChange={(e) => setResultForm((s) => ({ ...s, result: e.target.value as 'SUCCESS' | 'FAILED' }))}
                    >
                      <option value="SUCCESS">SUCCESS</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </div>

                  {resultForm.result === 'FAILED' && (
                    <div>
                      <label className="text-xs text-muted-foreground">Failed reason (recommended)</label>
                      <input
                        className={inputCls}
                        value={resultForm.failed_reason}
                        onChange={(e) => setResultForm((s) => ({ ...s, failed_reason: e.target.value }))}
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-muted-foreground">Result notes</label>
                    <textarea
                      rows={2}
                      className={inputCls}
                      value={resultForm.result_notes}
                      onChange={(e) => setResultForm((s) => ({ ...s, result_notes: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ['result_reference_no', 'Result reference no'],
                      ['bank_reference_no', 'Bank reference no'],
                      ['external_reference_no', 'External reference no'],
                      ['provider_reference_no', 'Provider reference no'],
                      ['provider_response_code', 'Provider response code'],
                      ['provider_response_message', 'Provider response message'],
                      ['latest_transaction_status', 'Latest transaction status'],
                      ['transaction_status_desc', 'Transaction status desc'],
                      ['result_attachment_uri', 'Result attachment URI'],
                    ] as const).map(([key, label]) => (
                      <div key={key}>
                        <label className="text-xs text-muted-foreground">{label}</label>
                        <input
                          className={inputCls}
                          value={resultForm[key]}
                          onChange={(e) => setResultForm((s) => ({ ...s, [key]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="text-xs text-muted-foreground">Provider response (JSON object, optional)</label>
                    <textarea
                      rows={4}
                      className={`${inputCls} font-mono`}
                      value={resultForm.provider_response}
                      onChange={(e) => setResultForm((s) => ({ ...s, provider_response: e.target.value }))}
                      placeholder='{ "raw": "..." }'
                    />
                  </div>

                  <button
                    className="rounded-lg bg-kesh-700 px-3 py-2 text-sm text-white hover:bg-kesh-600 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doResult}
                  >
                    {actionLoading ? 'Saving…' : 'Submit Result'}
                  </button>
                </div>
              )}

              {actionErr && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {actionErr}
                </div>
              )}
            </SectionCard>
          )}

          {!hasAnyAction && (
            <p className="text-xs text-slate-500 italic">
              Read-only view — no actions available for your role or current status.
            </p>
          )}

          {/* SNAP Preview — available to all roles */}
          <SectionCard title="SNAP Preview">
            <p className="text-xs text-slate-500">
              Preview only — no bank/API call is executed.
            </p>
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              disabled={snapLoading}
              onClick={loadSnap}
            >
              {snapLoading ? 'Loading…' : snap ? 'Refresh SNAP Preview' : 'Load SNAP Preview'}
            </button>
            {snapErr && (
              <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {snapErr}
              </div>
            )}
            {snap && (
              <pre className="max-h-96 overflow-auto rounded-lg bg-neutral-50 border p-3 text-xs">
                {JSON.stringify(snap, null, 2)}
              </pre>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
