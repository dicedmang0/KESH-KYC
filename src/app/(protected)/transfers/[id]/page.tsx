'use client';

import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getRoleFromToken } from '@/lib/api';
import {
  getTransfer,
  getTransferSnapPreview,
  getTransferBanks,
  submitTransfer,
  submitTransferComplianceReview,
  decideTransferComplianceReview,
  supervisorReviewTransfer,
  financeReviewTransfer,
  decideTransfer,
  setTransferResult,
  updateTransfer,
  rescreenTransferWatchlist,
  formatTransferAmount,
  transferReference,
  formatDateTime,
  transferRedFlagLabel,
  formatMatchScore,
  matchedFieldLabel,
  watchlistListTypes,
  isBlockingListType,
  isEditableTransferStatus,
  BENEFICIARY_RELATIONSHIP_OPTIONS,
  FALLBACK_BANKS,
  TRANSFER_MIN_AMOUNT,
  TRANSFER_MAX_AMOUNT,
  TRANSFER_RED_FLAGS,
  AUTO_RED_FLAGS,
  canSubmitTransfer,
  canSubmitTransferComplianceReview,
  canDecideTransferComplianceReview,
  canSupervisorReviewTransfer,
  canFinanceReviewTransfer,
  canApproveTransfer,
  canUpdateTransferResult,
  getSourceOfFundsOptions,
  type TransferBank,
  type TransferDetail,
  type ComplianceReviewAction,
  type RefItem,
} from '@/lib/transfers';
import { evaluateTransfer } from '@/lib/monitoring';
import { formatCif, isLainnya } from '@/lib/utils';
import LainnyaField from '@/components/lainnya-field';
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
  const [panel, setPanel] = useState<'none' | 'approve' | 'reject' | 'result' | 'return' | 'edit'>('none');

  // decision form
  const [decisionNotes, setDecisionNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // FinanceStaff return form — reason is mandatory
  const [returnNotes, setReturnNotes] = useState('');

  // FrontDesk edit form (DRAFT / returned transfers)
  const [banks, setBanks] = useState<TransferBank[]>(FALLBACK_BANKS);
  const [sourceOfFundsOptions, setSourceOfFundsOptions] = useState<RefItem[]>([]);
  const [sourceOfFundsOther, setSourceOfFundsOther] = useState('');
  const [editForm, setEditForm] = useState({
    amount: '',
    beneficiaryAccountName: '',
    beneficiaryAccountNumber: '',
    beneficiaryBankName: '',
    beneficiaryBankCode: '',
    beneficiary_relationship_to_sender: '',
    source_of_funds: '',
    transaction_purpose: '',
    description: '',
  });

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

  // watchlist rescreen
  // Preview branch (settled transfer, no force sent) carries no hit counts /
  // can_continue — see RescreenWatchlistPreview. Those fields stay undefined then.
  type RescreenBanner = {
    read_only: boolean;
    old_hit_count?: number;
    new_hit_count?: number;
    old_match_count: number;
    new_match_count: number;
    can_continue?: boolean;
  };
  const [rescreenLoading, setRescreenLoading] = useState(false);
  const [rescreenResult, setRescreenResult] = useState<RescreenBanner | null>(null);
  const [rescreenErr, setRescreenErr] = useState('');

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
    setRescreenResult(null);
    setRescreenErr('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Bank dropdown for the edit form (falls back to the built-in list).
  useEffect(() => {
    getTransferBanks()
      .then((list) => { if (list && list.length) setBanks(list); })
      .catch(() => { /* keep FALLBACK_BANKS */ });
  }, []);

  useEffect(() => {
    getSourceOfFundsOptions()
      .then((list) => setSourceOfFundsOptions(list))
      .catch(() => { /* dropdown just stays empty */ });
  }, []);

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

  /** FinanceStaff sends the transfer back to FrontDesk for correction (non-final). */
  async function doFinanceReturn() {
    if (!id) return;
    if (!returnNotes.trim()) {
      setActionErr('Alasan pengembalian wajib diisi.');
      return;
    }
    setActionLoading(true);
    setActionErr('');
    try {
      await financeReviewTransfer(id, { action: 'RETURN', notes: returnNotes.trim() });
      setPanel('none');
      setReturnNotes('');
      toast.success('Transaksi dikembalikan ke FrontDesk untuk diperbaiki.');
      await reload();
    } catch (e) {
      handleActionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  function openEditPanel() {
    if (!row) return;
    setEditForm({
      amount: String(row.amount ?? ''),
      beneficiaryAccountName: row.beneficiary_account_name ?? '',
      beneficiaryAccountNumber: row.beneficiary_account_number ?? '',
      beneficiaryBankName: row.beneficiary_bank_name ?? '',
      beneficiaryBankCode: row.beneficiary_bank_code ?? '',
      beneficiary_relationship_to_sender: row.beneficiary_relationship_to_sender ?? '',
      source_of_funds: row.source_of_funds ?? '',
      transaction_purpose: row.transaction_purpose ?? '',
      description: row.description ?? '',
    });
    setSourceOfFundsOther('');
    setActionErr('');
    setPanel(panel === 'edit' ? 'none' : 'edit');
  }

  /**
   * Save edits to a DRAFT/returned transfer. PATCH replaces the core fields
   * outright, so the whole form is sent even when only one field changed.
   */
  async function doUpdate() {
    if (!id || !row) return;
    const f = editForm;
    const amount = Number(f.amount);
    if (!Number.isInteger(amount) || amount < TRANSFER_MIN_AMOUNT || amount > TRANSFER_MAX_AMOUNT) {
      setActionErr(
        `Nominal harus bilangan bulat antara ${TRANSFER_MIN_AMOUNT.toLocaleString('id-ID')} dan ${TRANSFER_MAX_AMOUNT.toLocaleString('id-ID')}.`,
      );
      return;
    }
    if (!/^\d+$/.test(f.beneficiaryAccountNumber.trim())) {
      setActionErr('Nomor rekening penerima harus berisi digit saja.');
      return;
    }
    if (!f.beneficiaryAccountName.trim() || !f.beneficiaryBankName.trim()) {
      setActionErr('Nama rekening dan bank penerima wajib diisi.');
      return;
    }
    if (!f.beneficiary_relationship_to_sender.trim()) {
      setActionErr('Hubungan dengan pengirim wajib diisi.');
      return;
    }
    if (isLainnya(f.source_of_funds) && !sourceOfFundsOther.trim()) {
      setActionErr('Keterangan Sumber Dana Lainnya wajib diisi.');
      return;
    }
    const c = (v: string) => (v.trim() ? v.trim() : undefined);
    setActionLoading(true);
    setActionErr('');
    try {
      await updateTransfer(id, {
        amount,
        currency: row.currency || 'IDR',
        sender_application_id: Number(row.sender_application_id),
        beneficiaryAccountName: f.beneficiaryAccountName.trim(),
        beneficiaryAccountNumber: f.beneficiaryAccountNumber.trim(),
        beneficiaryBankName: f.beneficiaryBankName.trim(),
        beneficiaryBankCode: c(f.beneficiaryBankCode),
        beneficiary_relationship_to_sender: f.beneficiary_relationship_to_sender.trim(),
        source_of_funds: c(isLainnya(f.source_of_funds) ? sourceOfFundsOther : f.source_of_funds),
        transaction_purpose: c(f.transaction_purpose),
        description: c(f.description),
      });
      setPanel('none');
      toast.success('Perubahan transaksi tersimpan.');
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

  async function doRescreen() {
    if (!id) return;
    if (!window.confirm('Rescreen akan mengevaluasi ulang hasil watchlist menggunakan aturan terbaru. Lanjutkan?')) {
      return;
    }
    setRescreenLoading(true);
    setRescreenErr('');
    try {
      const res = await rescreenTransferWatchlist(id);
      if ('rescreen' in res) {
        // Backend already returns the fresh transfer (hits rewritten) alongside
        // the stats — using it directly is equivalent to a refetch, and atomic
        // with the mutation.
        setRow(res);
        setRescreenResult(res.rescreen);
        toast.success(
          `Rescreen selesai — hit ${res.rescreen.old_hit_count} → ${res.rescreen.new_hit_count}, ` +
            `match aktif ${res.rescreen.old_match_count} → ${res.rescreen.new_match_count}.`,
        );
      } else {
        // Settled transfer, no force sent — preview only, nothing changed.
        setRescreenResult({ read_only: true, old_match_count: res.old_match_count, new_match_count: res.new_match_count });
        toast.success('Rescreen (pratinjau) selesai — transfer tidak diubah.');
      }
    } catch (e) {
      setRescreenErr(e instanceof Error ? e.message : 'Gagal menjalankan rescreen watchlist');
    } finally {
      setRescreenLoading(false);
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
  const isReturned = row?.status === 'REVISION_REQUIRED';
  // A returned transfer is editable and re-submittable, and resubmitting replays
  // the full flow (screening → supervisor → finance → manager) — no shortcut back.
  const canSubmit = canSubmitTransfer(role) && isEditableTransferStatus(row?.status);
  const canEdit = canSubmitTransfer(role) && isEditableTransferStatus(row?.status);
  const canSubmitCompliance = canSubmitTransferComplianceReview(role) && row?.status === 'DRAFT';
  const canReviewCompliance = canDecideTransferComplianceReview(role) && row?.status === 'PENDING_COMPLIANCE_REVIEW';
  const canSupervisorReview = canSupervisorReviewTransfer(role) && row?.status === 'SUBMITTED';
  // OperationSupervisor sees a blocking note while compliance review is pending.
  const supervisorBlockedByCompliance =
    canSupervisorReviewTransfer(role) && row?.status === 'PENDING_COMPLIANCE_REVIEW';
  const canFinanceReview = canFinanceReviewTransfer(role) && row?.status === 'PENDING_FINANCE_STAFF_REVIEW';
  // FinanceManager only ever acts on PENDING_FINANCE_MANAGER_APPROVAL, so a
  // returned transfer never offers the final approve/reject actions.
  const canDecide = canApproveTransfer(role) && row?.status === 'PENDING_FINANCE_MANAGER_APPROVAL';
  const canSetResult = canUpdateTransferResult(role) && row?.status === 'COMPLETED' && row?.result !== 'SUCCESS';
  // canReviewCompliance renders its own panel, so it is excluded here.
  const hasAnyAction =
    canSubmit || canEdit || canSubmitCompliance || canSupervisorReview || canFinanceReview || canDecide || canSetResult;
  const cr = row?.latest_compliance_review;
  const canEvaluateMonitoring = role === 'ComplianceLead' || role === 'SystemAdmin' || role === 'Director';

  // Beneficiary screening results. A sanction-list hit (DTTOT/PPPSPM) gets the
  // strong warning; PEP-only hits are shown without it.
  const watchlistHits = row?.watchlist_hits ?? [];
  const blockingListTypes = watchlistListTypes(watchlistHits).filter(isBlockingListType);
  const hasBlockingHit = blockingListTypes.length > 0;
  // Same roles as the compliance-review decision itself. Hidden on final
  // statuses by default — a completed/rejected transfer has nothing to act on.
  const canRescreen =
    canDecideTransferComplianceReview(role) &&
    row?.status !== 'COMPLETED' &&
    row?.status !== 'REJECTED' &&
    (watchlistHits.length > 0 || row?.status === 'PENDING_COMPLIANCE_REVIEW');

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
        <div className="flex items-center gap-3">
          {/* Resi hanya untuk transaksi yang benar-benar selesai & berhasil. */}
          {row && (row.result === 'SUCCESS' || row.status === 'COMPLETED') && (
            <button
              className="rounded-lg border border-kesh-700 px-3 py-1.5 text-sm font-medium text-kesh-700 hover:bg-kesh-50"
              onClick={() => router.push(`/transfers/${row.id ?? id}/receipt`)}
            >
              Cetak Resi
            </button>
          )}
          <button
            className="text-sm text-kesh-700 hover:underline"
            onClick={() => router.push('/transfers')}
          >
            Kembali
          </button>
        </div>
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
              {/* Diisi backend saat pengajuan — DRAFT tetap kosong ("-"). */}
              <Field
                label="Tanggal Transaksi"
                value={row.transaction_date ? formatDateTime(row.transaction_date) : undefined}
              />
              {row.batch_no && <Field label="Batch No" value={row.batch_no} />}
              {row.bulk_reference_no && <Field label="No. Referensi Bulk" value={row.bulk_reference_no} />}
            </div>
          </SectionCard>

          {/* Returned by FinanceStaff — the reason is what FrontDesk must fix */}
          {isReturned && (
            <div
              role="alert"
              className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900"
            >
              <p className="font-semibold">Transaksi dikembalikan oleh Finance Staff untuk diperbaiki.</p>
              <p className="mt-1">
                <span className="text-amber-700">Alasan pengembalian: </span>
                {row.finance_notes || '-'}
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Transaksi ini belum ditolak. Setelah diperbaiki dan diajukan ulang, alur review
                berjalan kembali dari awal.
              </p>
            </div>
          )}

          {/* 1b. Beneficiary watchlist screening — hits, or a rescreen affordance while pending review */}
          {(watchlistHits.length > 0 || canRescreen) && (
            <SectionCard title="Hasil Screening Watchlist">
              {hasBlockingHit && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm font-medium text-red-800"
                >
                  Beneficiary terindikasi masuk daftar {blockingListTypes.join(' / ')}. Transfer
                  memerlukan review Compliance.
                </div>
              )}

              {watchlistHits.length > 0 ? (
                <>
                  <p className="text-xs text-neutral-500">
                    Nama penerima dicocokkan otomatis dengan data watchlist saat transaksi diajukan.
                    {watchlistHits.length > 1 && ` ${watchlistHits.length} entri watchlist cocok.`}
                  </p>

                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-xs">
                      <thead className="bg-neutral-50 text-neutral-600">
                        <tr>
                          <th className="border px-2 py-1 text-left">List Type</th>
                          <th className="border px-2 py-1 text-left">Input Name</th>
                          <th className="border px-2 py-1 text-left">Matched Name</th>
                          <th className="border px-2 py-1 text-left">Matched Field</th>
                          <th className="border px-2 py-1 text-left">Match Score</th>
                          <th className="border px-2 py-1 text-left">Unique ID</th>
                          <th className="border px-2 py-1 text-left">Subject Type</th>
                          <th className="border px-2 py-1 text-left">Created At</th>
                        </tr>
                      </thead>
                      <tbody>
                        {watchlistHits.map((h, i) => (
                          <tr key={`${h.unique_id ?? 'hit'}-${i}`}>
                            <td className="border px-2 py-1">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 font-medium ${
                                  isBlockingListType(h.list_type)
                                    ? 'bg-red-600 text-white'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {h.list_type ?? '-'}
                              </span>
                            </td>
                            <td className="border px-2 py-1">{h.input_name ?? '-'}</td>
                            <td className="border px-2 py-1 font-medium">{h.matched_name ?? '-'}</td>
                            <td className="border px-2 py-1">{matchedFieldLabel(h.matched_field)}</td>
                            <td className="border px-2 py-1">{formatMatchScore(h.match_score)}</td>
                            <td className="border px-2 py-1 font-mono">{h.unique_id ?? '-'}</td>
                            <td className="border px-2 py-1">{h.subject_type ?? '-'}</td>
                            <td className="border px-2 py-1">{formatDateTime(h.created_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : (
                <p className="text-xs text-neutral-500">Tidak ada hasil watchlist hit yang tercatat saat ini.</p>
              )}

              {canRescreen && (
                <div className="space-y-2 border-t pt-3">
                  <button
                    className="rounded-lg border border-kesh-700 px-3 py-2 text-sm font-medium text-kesh-700 hover:bg-kesh-50 disabled:opacity-50"
                    disabled={rescreenLoading}
                    onClick={doRescreen}
                  >
                    {rescreenLoading ? 'Merescreen…' : 'Rescreen Watchlist'}
                  </button>

                  {rescreenErr && (
                    <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                      {rescreenErr}
                    </div>
                  )}

                  {rescreenResult && (
                    <div className="space-y-2">
                      {rescreenResult.old_hit_count !== undefined && rescreenResult.new_hit_count !== undefined && (
                        <p className="text-xs text-neutral-600">
                          Hit: {rescreenResult.old_hit_count} → {rescreenResult.new_hit_count} · Match aktif:{' '}
                          {rescreenResult.old_match_count} → {rescreenResult.new_match_count}
                        </p>
                      )}
                      {rescreenResult.read_only && (
                        <div className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm text-slate-700">
                          Transfer sudah final, rescreen hanya preview dan tidak mengubah data.
                        </div>
                      )}
                      {rescreenResult.can_continue && (
                        <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-700">
                          Hasil watchlist terbaru tidak menemukan match aktif. Transfer dapat
                          dilanjutkan melalui aksi Approve to Continue oleh Compliance.
                        </div>
                      )}
                      {rescreenResult.new_match_count > 0 && (
                        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                          Masih terdapat match watchlist aktif. Review Compliance tetap diperlukan.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </SectionCard>
          )}

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
              {/* Nama aktor, bukan ID numerik internal. */}
              <Field label="Dibuat Oleh" value={row.created_by_name} />
              <Field label="Diajukan Oleh" value={row.submitted_by_name} />
              <Field label="Diajukan Pada" value={formatDateTime(row.submitted_at)} />
              <Field label="Direview Finance Staff Oleh" value={row.finance_reviewed_by_name} />
              <Field label="Direview Finance Staff Pada" value={formatDateTime(row.finance_reviewed_at)} />
              <Field label="Catatan Finance Staff" value={row.finance_notes} />
              <Field label="Disetujui Oleh" value={row.approved_by_name} />
              <Field label="Disetujui Pada" value={formatDateTime(row.approved_at)} />
              <Field label="Ditolak Oleh" value={row.rejected_by_name} />
              <Field label="Ditolak Pada" value={formatDateTime(row.rejected_at)} />
              <Field label="Hasil Diperbarui Oleh" value={row.result_updated_by_name} />
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
                  <Field label="Diajukan Oleh" value={cr.reported_by_name} />
                  <Field label="Diajukan Pada" value={formatDateTime(cr.reported_at)} />
                  <Field label="Direview Oleh" value={cr.reviewed_by_name} />
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
                {canEdit && (
                  <button
                    className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={openEditPanel}
                  >
                    {panel === 'edit' ? 'Tutup Form Ubah' : 'Ubah Transaksi'}
                  </button>
                )}
                {canSubmit && (
                  <button
                    className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doSubmit}
                  >
                    {isReturned ? 'Ajukan Ulang Transaksi' : 'Ajukan Transaksi'}
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
                  <>
                    <button
                      className="rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white hover:bg-indigo-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={doFinanceReview}
                    >
                      {actionLoading ? 'Menyimpan…' : 'Review Finance Staff'}
                    </button>
                    <button
                      className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={() => { setPanel(panel === 'return' ? 'none' : 'return'); setActionErr(''); }}
                    >
                      Kembalikan Transaksi
                    </button>
                  </>
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
                      {TRANSFER_RED_FLAGS.filter(([code]) => !AUTO_RED_FLAGS.includes(code)).map(([code, label]) => (
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

              {/* FinanceStaff return form — notes are mandatory */}
              {canFinanceReview && panel === 'return' && (
                <div className="rounded-lg border border-amber-300 bg-amber-50/40 p-3 space-y-2">
                  <div>
                    <h3 className="text-sm font-semibold text-neutral-800">Kembalikan Transaksi</h3>
                    <p className="text-xs text-neutral-500">
                      Transaksi dikembalikan ke FrontDesk untuk diperbaiki — bukan penolakan.
                    </p>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground" htmlFor="finance-return-notes">
                      Alasan pengembalian <span className="text-red-600">*</span>
                    </label>
                    <textarea
                      id="finance-return-notes"
                      rows={3}
                      className={inputCls}
                      value={returnNotes}
                      onChange={(e) => { setReturnNotes(e.target.value); setActionErr(''); }}
                      placeholder="Contoh: Nominal tidak sesuai bukti transfer"
                    />
                  </div>
                  <button
                    className="rounded-lg bg-amber-600 px-3 py-2 text-sm text-white hover:bg-amber-700 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doFinanceReturn}
                  >
                    {actionLoading ? 'Menyimpan…' : 'Konfirmasi Kembalikan'}
                  </button>
                </div>
              )}

              {/* FrontDesk edit form — DRAFT or returned transfers */}
              {canEdit && panel === 'edit' && (
                <div className="rounded-lg border p-3 space-y-3">
                  <p className="text-xs text-neutral-500">
                    Perbaiki data transaksi, simpan, lalu ajukan ulang. Pengajuan ulang tetap
                    melalui screening dan seluruh tahap review.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="edit-amount">Nominal *</label>
                      <input
                        id="edit-amount"
                        type="number"
                        className={inputCls}
                        value={editForm.amount}
                        onChange={(e) => setEditForm((s) => ({ ...s, amount: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="edit-beneficiary-name">
                        Nama Rekening Penerima *
                      </label>
                      <input
                        id="edit-beneficiary-name"
                        className={inputCls}
                        value={editForm.beneficiaryAccountName}
                        onChange={(e) => setEditForm((s) => ({ ...s, beneficiaryAccountName: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="edit-beneficiary-number">
                        Nomor Rekening Penerima *
                      </label>
                      <input
                        id="edit-beneficiary-number"
                        className={inputCls}
                        value={editForm.beneficiaryAccountNumber}
                        onChange={(e) => setEditForm((s) => ({ ...s, beneficiaryAccountNumber: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="edit-bank">Bank Penerima *</label>
                      <select
                        id="edit-bank"
                        className={inputCls}
                        value={editForm.beneficiaryBankName}
                        onChange={(e) => {
                          const name = e.target.value;
                          const bank = banks.find((b) => (b.name ?? '') === name);
                          setEditForm((s) => ({
                            ...s,
                            beneficiaryBankName: name,
                            beneficiaryBankCode: bank?.code ?? '',
                          }));
                        }}
                      >
                        {/* Keep the stored bank selectable even if it is not in the list. */}
                        {!banks.some((b) => (b.name ?? '') === editForm.beneficiaryBankName) && (
                          <option value={editForm.beneficiaryBankName}>{editForm.beneficiaryBankName || '— Pilih —'}</option>
                        )}
                        {banks.map((b) => (
                          <option key={`${b.code}-${b.name}`} value={b.name ?? ''}>{b.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="edit-relationship">
                        Hubungan dengan Pengirim *
                      </label>
                      <select
                        id="edit-relationship"
                        className={inputCls}
                        value={editForm.beneficiary_relationship_to_sender}
                        onChange={(e) =>
                          setEditForm((s) => ({ ...s, beneficiary_relationship_to_sender: e.target.value }))
                        }
                      >
                        <option value="">— Pilih —</option>
                        {!BENEFICIARY_RELATIONSHIP_OPTIONS.includes(
                          editForm.beneficiary_relationship_to_sender as (typeof BENEFICIARY_RELATIONSHIP_OPTIONS)[number],
                        ) && editForm.beneficiary_relationship_to_sender && (
                          <option value={editForm.beneficiary_relationship_to_sender}>
                            {editForm.beneficiary_relationship_to_sender}
                          </option>
                        )}
                        {BENEFICIARY_RELATIONSHIP_OPTIONS.map((o) => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="edit-sof">Sumber Dana</label>
                      <select
                        id="edit-sof"
                        className={inputCls}
                        value={editForm.source_of_funds}
                        onChange={(e) => {
                          const v = e.target.value;
                          setEditForm((s) => ({ ...s, source_of_funds: v }));
                          if (!isLainnya(v)) setSourceOfFundsOther('');
                        }}
                      >
                        <option value="">— Pilih —</option>
                        {sourceOfFundsOptions.map((o) => (
                          <option key={o.code} value={o.code}>{o.name}</option>
                        ))}
                        {editForm.source_of_funds &&
                          !sourceOfFundsOptions.find((o) => o.code === editForm.source_of_funds) && (
                            <option value={editForm.source_of_funds}>{editForm.source_of_funds}</option>
                          )}
                      </select>
                      <LainnyaField
                        when={editForm.source_of_funds}
                        value={sourceOfFundsOther}
                        onChange={setSourceOfFundsOther}
                        label="Keterangan Sumber Dana Lainnya"
                        labelClassName="text-xs text-muted-foreground"
                        inputClassName={inputCls}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground" htmlFor="edit-purpose">Tujuan Transaksi</label>
                      <input
                        id="edit-purpose"
                        className={inputCls}
                        value={editForm.transaction_purpose}
                        onChange={(e) => setEditForm((s) => ({ ...s, transaction_purpose: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground" htmlFor="edit-description">Keterangan</label>
                    <textarea
                      id="edit-description"
                      rows={2}
                      className={inputCls}
                      value={editForm.description}
                      onChange={(e) => setEditForm((s) => ({ ...s, description: e.target.value }))}
                    />
                  </div>
                  <button
                    className="rounded-lg bg-kesh-700 px-3 py-2 text-sm text-white hover:bg-kesh-600 disabled:opacity-50"
                    disabled={actionLoading}
                    onClick={doUpdate}
                  >
                    {actionLoading ? 'Menyimpan…' : 'Simpan Perubahan'}
                  </button>
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
