'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getRoleFromToken } from '@/lib/api';
import {
  getTransfer,
  getTransferSnapPreview,
  submitTransfer,
  submitTransferComplianceReview,
  decideTransferComplianceReview,
  supervisorReviewTransfer,
  financeReviewTransfer,
  decideTransfer,
  setTransferResult,
  formatTransferAmount,
  transferReference,
  formatDateTime,
  transferRedFlagLabel,
  TRANSFER_RED_FLAGS,
  canSubmitTransfer,
  canSubmitTransferComplianceReview,
  canDecideTransferComplianceReview,
  canSupervisorReviewTransfer,
  canFinanceReviewTransfer,
  canApproveTransfer,
  canUpdateTransferResult,
  type TransferDetail,
  type ComplianceReviewAction,
} from '@/lib/transfers';
import { evaluateTransfer } from '@/lib/monitoring';
import { formatCif } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { useAuth } from '@/app/providers';
import { TransferStatusBadge, TransferResultBadge } from '@/components/transfer-badges';

// Compliance review decisions available to ComplianceLead/Admin.
// `notesRequired` mirrors the backend rule; APPROVE_TO_CONTINUE keeps notes optional.
const COMPLIANCE_ACTIONS: {
  action: ComplianceReviewAction;
  label: string;
  btnCls: string;
  notesRequired: boolean;
  successToast: string;
}[] = [
  {
    action: 'APPROVE_TO_CONTINUE',
    label: 'Setujui untuk Dilanjutkan',
    btnCls: 'bg-emerald-600 hover:bg-emerald-700',
    notesRequired: false,
    successToast: 'Transaksi disetujui untuk dilanjutkan ke Operation Supervisor.',
  },
  {
    action: 'REJECT',
    label: 'Tolak Transaksi',
    btnCls: 'bg-red-600 hover:bg-red-700',
    notesRequired: true,
    successToast: 'Transaksi ditolak oleh Compliance.',
  },
  {
    action: 'REQUEST_ADDITIONAL_INFO',
    label: 'Minta Informasi Tambahan',
    btnCls: 'bg-amber-600 hover:bg-amber-700',
    notesRequired: true,
    successToast: 'Permintaan informasi tambahan telah dikirim.',
  },
  {
    action: 'REQUEST_EDD',
    label: 'Minta EDD / Pengkinian Data',
    btnCls: 'bg-amber-600 hover:bg-amber-700',
    notesRequired: true,
    successToast: 'Permintaan EDD / pengkinian data telah dikirim.',
  },
  {
    action: 'MARK_LTKM_CANDIDATE',
    label: 'Tandai Kandidat LTKM Internal',
    btnCls: 'bg-purple-600 hover:bg-purple-700',
    notesRequired: true,
    successToast: 'Transaksi ditandai sebagai kandidat LTKM internal.',
  },
];

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
        {label} {hasValue ? (open ? '▾' : '▸') : '(kosong)'}
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

  // compliance review — FrontDesk submit modal
  const [complianceModalOpen, setComplianceModalOpen] = useState(false);
  const [redFlags, setRedFlags] = useState<string[]>([]);
  const [complianceReportNotes, setComplianceReportNotes] = useState('');

  // compliance review — ComplianceLead decision panel
  const [complianceAction, setComplianceAction] = useState<ComplianceReviewAction | null>(null);
  const [complianceDecisionNotes, setComplianceDecisionNotes] = useState('');

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

  // monitoring evaluation
  const [evalLoading, setEvalLoading] = useState(false);
  const [evalMsg, setEvalMsg] = useState('');
  const [evalErr, setEvalErr] = useState('');

  async function reload() {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      setRow(await getTransfer(id));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat detail transfer');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleActionError(e: unknown) {
    const msg = e instanceof Error ? e.message : 'Aksi gagal';
    setActionErr(
      msg.includes('403') ? 'Anda tidak memiliki izin untuk melakukan aksi ini.' : msg,
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

  function toggleRedFlag(code: string) {
    setRedFlags((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function openComplianceModal() {
    setRedFlags([]);
    setComplianceReportNotes('');
    setActionErr('');
    setComplianceModalOpen(true);
  }

  async function doSubmitComplianceReview() {
    if (!id) return;
    if (redFlags.length === 0) {
      setActionErr('Pilih minimal satu red flag internal.');
      return;
    }
    if (redFlags.includes('OTHER') && !complianceReportNotes.trim()) {
      setActionErr('Catatan wajib diisi jika memilih "Lainnya".');
      return;
    }
    setActionLoading(true);
    setActionErr('');
    try {
      await submitTransferComplianceReview(id, {
        red_flags: redFlags,
        report_notes: complianceReportNotes.trim() || undefined,
      });
      setComplianceModalOpen(false);
      toast.success('Transaksi diajukan untuk Review Compliance.');
      await reload();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function doComplianceDecision() {
    if (!id || !complianceAction) return;
    const meta = COMPLIANCE_ACTIONS.find((a) => a.action === complianceAction);
    if (!meta) return;
    if (meta.notesRequired && !complianceDecisionNotes.trim()) {
      setActionErr('Catatan keputusan wajib diisi untuk aksi ini.');
      return;
    }
    setActionLoading(true);
    setActionErr('');
    try {
      await decideTransferComplianceReview(id, {
        action: complianceAction,
        decision_notes: complianceDecisionNotes.trim() || undefined,
      });
      setComplianceAction(null);
      setComplianceDecisionNotes('');
      toast.success(meta.successToast);
      await reload();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function doSupervisorReview() {
    if (!id) return;
    setActionLoading(true);
    setActionErr('');
    try {
      await supervisorReviewTransfer(id);
      await reload();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function doFinanceReview() {
    if (!id) return;
    setActionLoading(true);
    setActionErr('');
    try {
      await financeReviewTransfer(id);
      await reload();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function doDecide(decision: 'APPROVE' | 'REJECT') {
    if (!id) return;
    if (decision === 'REJECT' && !rejectReason.trim()) {
      setActionErr('Alasan penolakan disarankan — harap isi alasan.');
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
      setActionErr('Alasan kegagalan disarankan ketika hasil adalah FAILED.');
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
        setActionErr('Respons provider harus berupa JSON object yang valid.');
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
      setSnapErr(e instanceof Error ? e.message : 'Gagal memuat pratinjau SNAP');
    } finally {
      setSnapLoading(false);
    }
  }

  // Role + status conditions for action visibility
  const canSubmit = canSubmitTransfer(role) && row?.status === 'DRAFT';
  const canSubmitCompliance = canSubmitTransferComplianceReview(role) && row?.status === 'DRAFT';
  const canReviewCompliance = canDecideTransferComplianceReview(role) && row?.status === 'PENDING_COMPLIANCE_REVIEW';
  const canSupervisorReview = canSupervisorReviewTransfer(role) && row?.status === 'SUBMITTED';
  // OperationSupervisor sees a blocking note while compliance review is pending.
  const supervisorBlockedByCompliance =
    canSupervisorReviewTransfer(role) && row?.status === 'PENDING_COMPLIANCE_REVIEW';
  const canFinanceReview = canFinanceReviewTransfer(role) && row?.status === 'PENDING_FINANCE_STAFF_REVIEW';
  const canDecide = canApproveTransfer(role) && row?.status === 'PENDING_FINANCE_MANAGER_APPROVAL';
  const canSetResult = canUpdateTransferResult(role) && row?.status === 'COMPLETED' && row?.result !== 'SUCCESS';
  // canReviewCompliance renders its own panel, so it is excluded here.
  const hasAnyAction =
    canSubmit || canSubmitCompliance || canSupervisorReview || canFinanceReview || canDecide || canSetResult;
  const cr = row?.latest_compliance_review;
  const canEvaluateMonitoring = role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';

  async function doEvaluateMonitoring() {
    if (!id) return;
    setEvalLoading(true);
    setEvalMsg('');
    setEvalErr('');
    try {
      const res = await evaluateTransfer(id);
      setEvalMsg(res?.message ?? 'Evaluasi monitoring berhasil dijalankan.');
    } catch (e: unknown) {
      setEvalErr(e instanceof Error ? e.message : 'Gagal menjalankan evaluasi monitoring');
    } finally {
      setEvalLoading(false);
    }
  }

  if (!id) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Transfer</h1>
        <p className="text-sm text-neutral-500">ID transfer tidak valid.</p>
        <button
          className="mt-4 text-sm text-kesh-700 hover:underline"
          onClick={() => router.push('/transfers')}
        >
          Kembali
        </button>
      </div>
    );
  }

  const inputCls = 'mt-1 w-full border rounded-lg px-3 py-2 text-sm';

  return (
    <div className="max-w-4xl space-y-4">
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
          Kembali
        </button>
      </div>

      {err && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}

      {loading && <div className="text-sm text-neutral-500">Memuat detail…</div>}

      {row && (
        <>
          {/* 1. Summary */}
          <SectionCard title="Ringkasan">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Nomor Referensi Partner" value={row.partner_reference_no} />
              <Field label="Status" value={<TransferStatusBadge status={row.status} />} />
              <Field label="Hasil" value={<TransferResultBadge result={row.result} />} />
              <Field label="Nominal" value={formatTransferAmount(row)} />
              <Field label="Metode Transfer" value={row.transfer_method} />
              <Field label="Kanal Transfer" value={row.transfer_channel} />
              <Field label="Dibuat Pada" value={formatDateTime(row.created_at)} />
            </div>
          </SectionCard>

          {/* 2. Sender / Source */}
          <SectionCard title="Pengirim / Sumber">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Nama Pengirim" value={row.sender_name} />
              <Field label="CIF Pengirim" value={row.sender_cif_no ? formatCif(row.sender_cif_no) : undefined} />
              <Field label="Tipe Pengirim" value={row.sender_type} />
              <Field label="Sumber Dana" value={row.source_of_funds} />
              <Field label="Tujuan Transaksi" value={row.transaction_purpose} />
              <Field label="Nomor Rekening Sumber" value={row.source_account_no} />
              <Field label="Nama Rekening Sumber" value={row.source_account_name} />
              <Field label="Kode Bank Sumber" value={row.source_bank_code} />
              <Field label="Nama Bank Sumber" value={row.source_bank_name} />
            </div>
            {row.sender_application_id != null && (
              <p className="text-xs text-neutral-400">Application ID #{row.sender_application_id}</p>
            )}
          </SectionCard>

          {/* 3. Beneficiary */}
          <SectionCard title="Penerima">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Nama Rekening" value={row.beneficiary_account_name} />
              <Field label="Nomor Rekening" value={row.beneficiary_account_number} />
              <Field label="Kode Bank" value={row.beneficiary_bank_code} />
              <Field label="Nama Bank" value={row.beneficiary_bank_name} />
              <Field label="Hubungan dengan Pengirim" value={row.beneficiary_relationship_to_sender} />
              <Field label="Alamat" value={row.beneficiary_address} />
              <Field label="Email" value={row.beneficiary_email} />
              <Field label="Domisili" value={row.beneficiary_customer_residence} />
              <Field label="Tipe Nasabah" value={row.beneficiary_customer_type} />
            </div>
          </SectionCard>

          {/* 4. Timeline / Audit Trail */}
          <SectionCard title="Timeline / Jejak Audit">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Dibuat Oleh" value={row.created_by} />
              <Field label="Diajukan Oleh" value={row.submitted_by} />
              <Field label="Diajukan Pada" value={formatDateTime(row.submitted_at)} />
              <Field label="Disetujui Oleh" value={row.approved_by} />
              <Field label="Disetujui Pada" value={formatDateTime(row.approved_at)} />
              <Field label="Ditolak Oleh" value={row.rejected_by} />
              <Field label="Ditolak Pada" value={formatDateTime(row.rejected_at)} />
              <Field label="Hasil Diperbarui Oleh" value={row.result_updated_by} />
              <Field label="Hasil Diperbarui Pada" value={formatDateTime(row.result_updated_at)} />
              <Field label="Selesai Pada" value={formatDateTime(row.completed_at)} />
              <Field label="Gagal Pada" value={formatDateTime(row.failed_at)} />
            </div>
          </SectionCard>

          {/* 5. Decision Notes */}
          <SectionCard title="Catatan Keputusan">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Catatan Keputusan" value={row.decision_notes} />
              <Field label="Alasan Penolakan" value={row.reject_reason} />
            </div>
          </SectionCard>

          {/* 6. Result / Provider */}
          <SectionCard title="Hasil / Provider">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Nomor Referensi Hasil" value={row.result_reference_no} />
              <Field label="Nomor Referensi Bank" value={row.bank_reference_no} />
              <Field label="Nomor Referensi Eksternal" value={row.external_reference_no} />
              <Field label="Nomor Referensi Provider" value={row.provider_reference_no} />
              <Field label="Kode Respons Provider" value={row.provider_response_code} />
              <Field label="Pesan Respons Provider" value={row.provider_response_message} />
              <Field label="Status Transaksi Terkini" value={row.latest_transaction_status} />
              <Field label="Deskripsi Status Transaksi" value={row.transaction_status_desc} />
              <Field label="Alasan Kegagalan" value={row.failed_reason} />
              <Field label="URI Lampiran Hasil" value={row.result_attachment_uri} />
              <Field label="Catatan Hasil" value={row.result_notes} />
            </div>
          </SectionCard>

          {/* 7. Additional Info / Provider JSON */}
          <SectionCard title="Info Tambahan / JSON Provider">
            <div className="space-y-2">
              <JsonBlock label="Info Tambahan" value={row.additional_info} />
              <JsonBlock label="Request Provider" value={row.provider_request} />
              <JsonBlock label="Respons Provider" value={row.provider_response} />
            </div>
          </SectionCard>

          {/* Compliance review context — visible whenever a review snapshot exists */}
          {cr && (row?.status === 'PENDING_COMPLIANCE_REVIEW' || canReviewCompliance) && (
            <SectionCard title="Review Compliance">
              <div className="space-y-3">
                <div>
                  <div className="text-xs text-neutral-500">Red flag internal</div>
                  {cr.red_flags && cr.red_flags.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {cr.red_flags.map((f) => (
                        <span
                          key={f}
                          className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        >
                          {transferRedFlagLabel(f)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-neutral-400">-</div>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Field label="Catatan Pengajuan" value={cr.report_notes} />
                  <Field label="Diajukan Oleh" value={cr.reported_by} />
                  <Field label="Diajukan Pada" value={formatDateTime(cr.reported_at)} />
                  <Field label="Direview Oleh" value={cr.reviewed_by} />
                  <Field label="Direview Pada" value={formatDateTime(cr.reviewed_at)} />
                  <Field label="Catatan Keputusan Sebelumnya" value={cr.decision_notes} />
                </div>
              </div>
            </SectionCard>
          )}

          {/* ComplianceLead decision panel */}
          {canReviewCompliance && (
            <SectionCard title="Keputusan Compliance">
              <div className="flex flex-wrap gap-2">
                {COMPLIANCE_ACTIONS.map((a) => (
                  <button
                    key={a.action}
                    className={`rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50 ${a.btnCls}`}
                    disabled={actionLoading}
                    onClick={() => {
                      setComplianceAction(complianceAction === a.action ? null : a.action);
                      setComplianceDecisionNotes('');
                      setActionErr('');
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>

              {complianceAction && (() => {
                const meta = COMPLIANCE_ACTIONS.find((a) => a.action === complianceAction)!;
                return (
                  <div className="rounded-lg border p-3 space-y-2">
                    <label className="text-xs text-muted-foreground">
                      Catatan keputusan
                      {meta.notesRequired ? <span className="text-red-600"> *</span> : ' (opsional)'}
                    </label>
                    <textarea
                      rows={3}
                      className={inputCls}
                      value={complianceDecisionNotes}
                      onChange={(e) => setComplianceDecisionNotes(e.target.value)}
                    />
                    <button
                      className={`rounded-lg px-3 py-2 text-sm text-white disabled:opacity-50 ${meta.btnCls}`}
                      disabled={actionLoading}
                      onClick={doComplianceDecision}
                    >
                      {actionLoading ? 'Menyimpan…' : `Konfirmasi: ${meta.label}`}
                    </button>
                  </div>
                );
              })()}

              {actionErr && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                  {actionErr}
                </div>
              )}
            </SectionCard>
          )}

          {/* OperationSupervisor blocked while compliance review pending */}
          {supervisorBlockedByCompliance && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              Transaksi masih menunggu Review Compliance.
            </div>
          )}

          {/* Actions */}
          {hasAnyAction && (
            <SectionCard title="Aksi">
              <div className="flex flex-wrap gap-2">
                {canSubmit && (
                  <button
                    className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doSubmit}
                  >
                    Ajukan Transaksi
                  </button>
                )}
                {canSubmitCompliance && (
                  <button
                    className="rounded-lg border border-amber-600 px-3 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={openComplianceModal}
                  >
                    Submit untuk Review Compliance
                  </button>
                )}
                {canSupervisorReview && (
                  <button
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doSupervisorReview}
                  >
                    {actionLoading ? 'Menyimpan…' : 'Review & Setujui Layer 1'}
                  </button>
                )}
                {canFinanceReview && (
                  <button
                    className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doFinanceReview}
                  >
                    {actionLoading ? 'Menyimpan…' : 'Review Finance Staff'}
                  </button>
                )}
                {canDecide && (
                  <>
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={() => { setPanel(panel === 'approve' ? 'none' : 'approve'); setActionErr(''); }}
                    >
                      Review & Setujui Final
                    </button>
                    <button
                      className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={() => { setPanel(panel === 'reject' ? 'none' : 'reject'); setActionErr(''); }}
                    >
                      Tolak
                    </button>
                  </>
                )}
                {canSetResult && (
                  <button
                    className="rounded-lg bg-kesh-700 px-3 py-2 text-sm text-white hover:bg-kesh-600 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={() => { setPanel(panel === 'result' ? 'none' : 'result'); setActionErr(''); }}
                  >
                    Tetapkan Hasil
                  </button>
                )}
              </div>

              {/* Submit compliance review modal */}
              {canSubmitCompliance && complianceModalOpen && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-4 space-y-3">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-800">Ajukan Review Compliance</h3>
                    <p className="text-xs text-neutral-500">
                      Pilih red flag internal yang relevan sebelum mengajukan transaksi ke Compliance.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-600">Red flag internal</label>
                    <div className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-1.5">
                      {TRANSFER_RED_FLAGS.map(([code, label]) => (
                        <label key={code} className="flex items-start gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={redFlags.includes(code)}
                            onChange={() => toggleRedFlag(code)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-neutral-600">
                      Catatan review compliance
                      {redFlags.includes('OTHER') && <span className="text-red-600"> *</span>}
                    </label>
                    <textarea
                      rows={3}
                      className={inputCls}
                      value={complianceReportNotes}
                      onChange={(e) => setComplianceReportNotes(e.target.value)}
                      placeholder="Catatan internal untuk Compliance…"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={doSubmitComplianceReview}
                    >
                      {actionLoading ? 'Menyimpan…' : 'Ajukan Review Compliance'}
                    </button>
                    <button
                      className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={() => { setComplianceModalOpen(false); setActionErr(''); }}
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Approve form */}
              {canDecide && panel === 'approve' && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Catatan keputusan final (opsional)</label>
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
                    {actionLoading ? 'Menyimpan…' : 'Konfirmasi Setujui Final'}
                  </button>
                </div>
              )}

              {/* Reject form */}
              {canDecide && panel === 'reject' && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Alasan penolakan (disarankan)</label>
                    <input
                      className={inputCls}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Catatan keputusan final (opsional)</label>
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
                    {actionLoading ? 'Menyimpan…' : 'Konfirmasi Tolak'}
                  </button>
                </div>
              )}

              {/* Result form */}
              {canSetResult && panel === 'result' && (
                <div className="rounded-lg border p-3 space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Hasil</label>
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
                      <label className="text-xs text-muted-foreground">Alasan kegagalan (disarankan)</label>
                      <input
                        className={inputCls}
                        value={resultForm.failed_reason}
                        onChange={(e) => setResultForm((s) => ({ ...s, failed_reason: e.target.value }))}
                      />
                    </div>
                  )}

                  <div>
                    <label className="text-xs text-muted-foreground">Catatan hasil</label>
                    <textarea
                      rows={2}
                      className={inputCls}
                      value={resultForm.result_notes}
                      onChange={(e) => setResultForm((s) => ({ ...s, result_notes: e.target.value }))}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ['result_reference_no', 'Nomor Referensi Hasil'],
                      ['bank_reference_no', 'Nomor Referensi Bank'],
                      ['external_reference_no', 'Nomor Referensi Eksternal'],
                      ['provider_reference_no', 'Nomor Referensi Provider'],
                      ['provider_response_code', 'Kode Respons Provider'],
                      ['provider_response_message', 'Pesan Respons Provider'],
                      ['latest_transaction_status', 'Status Transaksi Terkini'],
                      ['transaction_status_desc', 'Deskripsi Status Transaksi'],
                      ['result_attachment_uri', 'URI Lampiran Hasil'],
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
                    <label className="text-xs text-muted-foreground">Respons provider (JSON object, opsional)</label>
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
                    {actionLoading ? 'Menyimpan…' : 'Kirim Hasil'}
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

          {!hasAnyAction && !canReviewCompliance && !supervisorBlockedByCompliance && (
            <p className="text-xs text-slate-500 italic">
              Tampilan hanya baca — tidak ada aksi yang tersedia untuk peran atau status Anda saat ini.
            </p>
          )}

          {/* Evaluasi Monitoring — ComplianceLead / SystemAdmin only */}
          {canEvaluateMonitoring && (
            <SectionCard title="Evaluasi Monitoring">
              <p className="text-xs text-slate-500">
                Jalankan evaluasi LTKT/LTKM secara manual untuk transfer ini.
              </p>
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
                disabled={evalLoading}
                onClick={doEvaluateMonitoring}
              >
                {evalLoading ? 'Mengevaluasi…' : 'Evaluasi Monitoring'}
              </button>
              {evalErr && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{evalErr}</div>
              )}
              {evalMsg && (
                <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">{evalMsg}</div>
              )}
            </SectionCard>
          )}

          {/* SNAP Preview — available to all roles */}
          <SectionCard title="Pratinjau SNAP">
            <p className="text-xs text-slate-500">
              Pratinjau saja — tidak ada panggilan ke bank/API.
            </p>
            <button
              className="rounded-lg border px-3 py-2 text-sm hover:bg-neutral-50 disabled:opacity-50"
              disabled={snapLoading}
              onClick={loadSnap}
            >
              {snapLoading ? 'Memuat…' : snap ? 'Perbarui Pratinjau SNAP' : 'Muat Pratinjau SNAP'}
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
