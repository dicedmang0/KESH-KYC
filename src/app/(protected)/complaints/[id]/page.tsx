'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { formatCif } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { formatDateTime, formatMonitoringAmount } from '@/lib/monitoring';
import { canViewTransfers } from '@/lib/transfers';
import ComplaintCustomerModal from '@/components/complaint-customer-modal';
import {
  refundStatusLabel,
  refundStatusBadgeClass,
  balanceCreditStatusLabel,
} from '@/lib/statement-refunds';
import {
  getComplaint,
  verifyComplaintData,
  operationInvestigation,
  cooReviewComplaint,
  amlReviewComplaint,
  financeReviewComplaint,
  financeManagerReviewComplaint,
  resolveComplaint,
  closeComplaint,
  formatComplaintStatus,
  formatComplaintCategory,
  formatComplaintChannel,
  formatComplaintPriority,
  formatComplaintLevel,
  formatLevel3Risk,
  formatComplaintStage,
  formatDataVerification,
  formatOperationResult,
  formatAmlDecision,
  formatFinanceDecision,
  formatCooDecision,
  formatFinanceManagerDecision,
  complaintStatusBadgeClass,
  complaintLevelBadgeClass,
  complaintTimeline,
  isLevelFlowComplaint,
  financeDecisionOptions,
  complianceDecisionOptions,
  canViewComplaints,
  canVerifyComplaintData,
  canOperationInvestigate,
  canCooReview,
  canAmlReview,
  canFinanceReview,
  canFinanceManagerReview,
  canResolveComplaint,
  canCloseComplaint,
  isComplaintReadOnly,
  DATA_VERIFICATION_LABELS,
  OPERATION_RESULT_LABELS,
  COO_DECISION_LABELS,
  FINANCE_MANAGER_DECISION_LABELS,
  type Complaint,
  type DataVerificationStatus,
  type OperationInvestigationResult,
  type AmlDecision,
  type CooDecision,
  type FinanceDecision,
  type FinanceManagerDecision,
} from '@/lib/complaints';

// ── Small UI helpers ──────────────────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-800 break-words">
        {value ?? <span className="text-slate-400 font-normal">—</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border p-4 space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h2>
      {children}
    </div>
  );
}

function Notes({ label, value }: { label: string; value?: string | null }) {
  return (
    <Field
      label={label}
      value={value ? <span className="whitespace-pre-wrap text-slate-700">{value}</span> : undefined}
    />
  );
}

/**
 * Timeline tahap. Hanya tahap yang relevan dengan complaint_level yang tampil
 * (LEVEL_1 tanpa Finance/Compliance, LEVEL_3 tanpa Finance) — daftarnya datang
 * dari complaintTimeline() supaya FE tidak punya versi aturan sendiri.
 */
function WorkflowTimeline({ complaint }: { complaint: Complaint }) {
  const steps = complaintTimeline(complaint);
  if (steps.length === 0) return null;

  const mark = { done: '✓', current: '●', todo: '○' } as const;
  const tone = {
    done: 'text-emerald-600',
    current: 'text-kesh-700',
    todo: 'text-slate-300',
  } as const;

  return (
    <Section title="Alur Penanganan">
      <ol className="space-y-2" data-testid="complaint-timeline">
        {steps.map((s) => (
          <li key={s.status} className="flex items-start gap-3" data-stage={s.status}>
            <span className={`mt-0.5 text-sm leading-none ${tone[s.state]}`} aria-hidden>
              {mark[s.state]}
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-800">{s.actor}</div>
              <div className={`text-xs ${s.state === 'todo' ? 'text-slate-400' : 'text-slate-600'}`}>
                {s.detail}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/**
 * Form aksi workflow: satu pilihan + catatan. Dipakai oleh verify-data,
 * operation investigation, COO review, compliance review, dan finance review.
 */
function WorkflowForm({
  options,
  requiresNotes,
  submitLabel,
  onSubmit,
}: {
  options: Record<string, string>;
  requiresNotes: (choice: string) => boolean;
  submitLabel: string;
  onSubmit: (choice: string, notes: string) => Promise<void>;
}) {
  const keys = Object.keys(options);
  const [choice, setChoice] = useState(keys[0]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const notesNeeded = requiresNotes(choice);
  const valid = !notesNeeded || notes.trim().length > 0;

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="text-xs text-slate-500">Keputusan / Hasil</label>
          <select
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white outline-none focus:border-kesh-700"
            value={choice}
            onChange={(e) => setChoice(e.target.value)}
          >
            {keys.map((k) => (
              <option key={k} value={k}>{options[k]}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className="text-xs text-slate-500">
          Catatan {notesNeeded && <span className="text-red-500">*</span>}
        </label>
        <textarea
          rows={3}
          className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Tuliskan catatan hasil pemeriksaan…"
        />
      </div>
      <button
        onClick={async () => {
          setBusy(true);
          try {
            await onSubmit(choice, notes.trim());
            setNotes('');
          } finally {
            setBusy(false);
          }
        }}
        disabled={busy || !valid}
        className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
      >
        {busy ? 'Menyimpan…' : submitLabel}
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ComplaintDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // resolve / close forms
  const [resolutionNotes, setResolutionNotes] = useState('');
  const [communicationNotes, setCommunicationNotes] = useState('');
  const [closingNotes, setClosingNotes] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setErr('');
    (async () => {
      try {
        const data = await getComplaint(id);
        if (!alive) return;
        setComplaint(data);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Gagal memuat data pengaduan');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  /** Semua aksi workflow memakai jalur yang sama: kirim, pasang hasil, beri tahu. */
  async function run(fn: () => Promise<Complaint>, successMsg: string) {
    try {
      const updated = await fn();
      // Respons aksi datang dari UPDATE … RETURNING * sehingga hanya memuat
      // kolom mentah (*_by numerik, tanpa nama aktor). Ambil ulang detail agar
      // nama aktor dan data turunan ikut segar; kalau gagal, pakai respons aksi.
      try {
        setComplaint(await getComplaint(id));
      } catch {
        setComplaint(updated);
      }
      toast.success(successMsg);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Aksi gagal. Silakan coba lagi.');
    }
  }

  if (!canViewComplaints(role)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke halaman ini.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-100" />
        <div className="rounded-2xl border p-4 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {err}
      </div>
    );
  }

  if (!complaint) return null;

  const c = complaint;
  const readOnly = isComplaintReadOnly(role, c);
  // Ringkasan di bawah datang dari respons detail pengaduan, bukan dari
  // /transfers/:id — ComplaintHandling memang ditolak 403 di rute itu, jadi
  // tautannya pun hanya muncul untuk role yang benar-benar bisa membukanya.
  const canOpenTransfer = canViewTransfers(role);
  const linkedCustomer = c.linked_customer;
  const linkedTransfer = c.linked_transfer;
  // GET /applications/:id tidak dibatasi @Roles di backend, jadi semua role yang
  // boleh membuka tiket ini juga boleh membaca data lengkap pengguna jasanya —
  // termasuk ComplaintHandling yang tidak punya menu /users.
  const customerApplicationId = linkedCustomer?.application_id ?? c.customer_application_id;
  const transferRef =
    linkedTransfer?.partner_reference_no ??
    c.transaction_partner_reference_no ??
    c.transaction_reference;
  const transferId = linkedTransfer?.transfer_id ?? c.transfer_id;
  // Tiket alur COO menyembunyikan tahap yang tidak relevan dengan levelnya.
  // Tiket legacy tetap menampilkan semuanya seperti sebelumnya.
  const levelFlow = isLevelFlowComplaint(c);
  const showCoo = levelFlow || c.status === 'COO_REVIEW';
  const showFinance =
    !levelFlow || c.complaint_level === 'LEVEL_2' || c.finance_decision != null;
  const showCompliance =
    !levelFlow || c.complaint_level === 'LEVEL_3' || c.aml_decision != null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/complaints" className="text-sm text-kesh-700 hover:underline">
            ← Pengaduan
          </Link>
          <h1 className="mt-1 text-xl font-semibold break-all">
            {c.complaint_no ?? `Pengaduan #${c.id}`}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {/* Resi penerimaan pengaduan — tersedia untuk semua role yang boleh
              membuka pengaduan ini (isinya read-only). */}
          <Link
            href={`/complaints/${id}/receipt`}
            className="rounded-lg border border-kesh-700 px-3 py-1.5 text-sm font-medium text-kesh-700 hover:bg-kesh-50"
          >
            Cetak Resi Pengaduan
          </Link>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${complaintLevelBadgeClass(c.complaint_level)}`}>
            {formatComplaintLevel(c.complaint_level)}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${complaintStatusBadgeClass(c.status)}`}>
            {formatComplaintStatus(c.status)}
          </span>
        </div>
      </div>

      {/* 0. Alur penanganan — hanya tahap yang relevan dengan level tiket */}
      <WorkflowTimeline complaint={c} />

      {/* 1. Ringkasan */}
      <Section title="Ringkasan Pengaduan">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="No. Pengaduan" value={<span className="font-mono break-all">{c.complaint_no ?? `#${c.id}`}</span>} />
          <Field label="Status" value={formatComplaintStatus(c.status)} />
          <Field label="Tahap Berjalan" value={formatComplaintStage(c.status)} />
          <Field label="Complaint Level" value={formatComplaintLevel(c.complaint_level)} />
          <Field label="Kategori Risiko Level 3" value={c.level_3_risk_category ? formatLevel3Risk(c.level_3_risk_category) : undefined} />
          <Field label="Jenis Pengaduan" value={formatComplaintCategory(c.category)} />
          <Field label="Nama Pengguna / Merchant" value={c.customer_name} />
          <Field label="CIF" value={<span className="font-mono">{formatCif(c.customer_cif_no)}</span>} />
          <Field label="Tipe Customer" value={c.customer_type} />
          <Field
            label="Transaksi / Transfer"
            value={
              transferRef ? (
                canOpenTransfer && transferId ? (
                  <Link href={`/transfers/${transferId}`} className="font-mono text-kesh-700 hover:underline break-all">
                    {transferRef}
                  </Link>
                ) : (
                  <span className="font-mono break-all">{transferRef}</span>
                )
              ) : undefined
            }
          />
          <Field label="Kanal" value={formatComplaintChannel(c.channel)} />
          <Field label="Prioritas" value={formatComplaintPriority(c.priority)} />
          {/* Nama aktor, bukan ID numerik internal. */}
          <Field label="Dibuat Oleh" value={c.created_by_name} />
          <Field label="Tanggal Dibuat" value={formatDateTime(c.created_at)} />
          {c.resolved_at && <Field label="Tanggal Selesai" value={formatDateTime(c.resolved_at)} />}
          {c.closed_at && <Field label="Tanggal Ditutup" value={formatDateTime(c.closed_at)} />}
        </div>
        <Notes label="Penjelasan Pengaduan" value={c.complaint_notes} />
      </Section>

      {/* 1b. Pengguna jasa tertaut — ringkasan ikut di respons detail, jadi role
              yang tidak boleh membuka /users tetap melihat datanya di sini. */}
      <Section title="Data Pengguna Jasa">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field
            label="Nama Pengguna Jasa"
            value={
              customerApplicationId ? (
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(true)}
                  className="text-left text-kesh-700 underline decoration-dotted underline-offset-2 hover:text-kesh-600"
                >
                  {linkedCustomer?.customer_name ?? c.customer_name ?? 'Lihat data pengguna jasa'}
                </button>
              ) : (
                (linkedCustomer?.customer_name ?? c.customer_name)
              )
            }
          />
          <Field
            label="CIF"
            value={<span className="font-mono">{formatCif(linkedCustomer?.cif_no ?? c.customer_cif_no)}</span>}
          />
          <Field label="Tipe Pengguna Jasa" value={linkedCustomer?.customer_type ?? c.customer_type} />
          <Field label="Status Pengguna Jasa" value={linkedCustomer?.customer_status} />
          <Field label="Tingkat Risiko" value={linkedCustomer?.risk_level} />
          <Field label="Kontak" value={linkedCustomer?.contact ?? c.customer_contact} />
          {/* Identitas teknis sekunder — bukan ID numerik internal. */}
          <Field
            label="Public ID"
            value={
              linkedCustomer?.application_public_id ? (
                customerApplicationId ? (
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(true)}
                    className="text-left font-mono text-xs break-all text-kesh-700 underline decoration-dotted underline-offset-2 hover:text-kesh-600"
                  >
                    {linkedCustomer.application_public_id}
                  </button>
                ) : (
                  <span className="font-mono text-xs break-all">{linkedCustomer.application_public_id}</span>
                )
              ) : undefined
            }
          />
        </div>
        {customerApplicationId && (
          <p className="text-xs text-slate-400">
            Klik nama atau Public ID untuk melihat data lengkap pengguna jasa.
          </p>
        )}
      </Section>

      {/* 1c. Transaksi tertaut — sama, ringkasan datang dari detail pengaduan. */}
      <Section title="Data Transaksi Terkait">
        {transferRef ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field
              label="No. Referensi Transaksi"
              value={
                canOpenTransfer && transferId ? (
                  <Link href={`/transfers/${transferId}`} className="font-mono text-kesh-700 hover:underline break-all">
                    {transferRef}
                  </Link>
                ) : (
                  <span className="font-mono break-all">{transferRef}</span>
                )
              }
            />
            <Field
              label="Nominal"
              value={
                (linkedTransfer?.amount ?? c.transaction_amount) != null
                  ? formatMonitoringAmount(linkedTransfer?.amount ?? c.transaction_amount)
                  : undefined
              }
            />
            <Field
              label="Tanggal Transaksi"
              value={
                (linkedTransfer?.transaction_date ?? c.transaction_date)
                  ? formatDateTime(linkedTransfer?.transaction_date ?? c.transaction_date)
                  : undefined
              }
            />
            <Field label="Status Transaksi" value={linkedTransfer?.status ?? c.transaction_status} />
            <Field label="Nama Penerima" value={linkedTransfer?.beneficiary_account_name} />
            <Field
              label="Rekening Penerima"
              value={
                linkedTransfer?.beneficiary_account_number ? (
                  <span className="font-mono break-all">{linkedTransfer.beneficiary_account_number}</span>
                ) : undefined
              }
            />
            <Field label="Bank Penerima" value={linkedTransfer?.beneficiary_bank_name} />
            <Field
              label="Public ID"
              value={
                linkedTransfer?.transfer_public_id ? (
                  <span className="font-mono text-xs break-all">{linkedTransfer.transfer_public_id}</span>
                ) : undefined
              }
            />
          </div>
        ) : (
          <p className="text-sm text-slate-500">Pengaduan ini tidak tertaut ke transaksi transfer.</p>
        )}
      </Section>

      {/* 2. Verifikasi data */}
      <Section title="Verifikasi Data Nasabah">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Hasil Verifikasi" value={c.data_verification_status ? formatDataVerification(c.data_verification_status) : undefined} />
          <Field label="Tanggal Verifikasi" value={c.data_verified_at ? formatDateTime(c.data_verified_at) : undefined} />
          <Field label="Diverifikasi Oleh" value={c.data_verified_by_name} />
        </div>
        <Notes label="Catatan Verifikasi" value={c.data_verification_notes} />
        {canVerifyComplaintData(role, c) && (
          <WorkflowForm
            options={DATA_VERIFICATION_LABELS}
            // Backend mewajibkan catatan hanya saat data tidak lengkap.
            requiresNotes={(v) => v === 'INCOMPLETE'}
            submitLabel="Simpan Verifikasi Data"
            onSubmit={(choice, notes) =>
              run(
                () => verifyComplaintData(id, {
                  data_verification_status: choice as DataVerificationStatus,
                  notes: notes || undefined,
                }),
                'Verifikasi data tersimpan.'
              )
            }
          />
        )}
      </Section>

      {/* 3. Investigasi transaksi */}
      <Section title="Investigasi Transaksi">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Hasil Investigasi" value={c.operation_investigation_result ? formatOperationResult(c.operation_investigation_result) : undefined} />
          <Field label="Tanggal Investigasi" value={c.operation_investigated_at ? formatDateTime(c.operation_investigated_at) : undefined} />
          <Field label="Investigasi Oleh" value={c.operation_investigated_by_name} />
        </div>
        <Notes label="Catatan Investigasi" value={c.operation_investigation_notes} />
        {canOperationInvestigate(role, c) && (
          <WorkflowForm
            options={OPERATION_RESULT_LABELS}
            requiresNotes={() => true}
            submitLabel="Simpan Hasil Investigasi"
            onSubmit={(choice, notes) =>
              run(
                () => operationInvestigation(id, {
                  result: choice as OperationInvestigationResult,
                  notes,
                }),
                'Hasil investigasi tersimpan.'
              )
            }
          />
        )}
      </Section>

      {/* 3b. Review COO — tujuan setelah Setujui ditentukan complaint_level */}
      {showCoo && (
        <Section title="Review COO">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Keputusan" value={c.coo_decision ? formatCooDecision(c.coo_decision) : undefined} />
            <Field label="Tanggal Review" value={c.coo_reviewed_at ? formatDateTime(c.coo_reviewed_at) : undefined} />
            <Field label="Review Oleh" value={c.coo_reviewed_by_name} />
          </div>
          <Notes label="Catatan COO" value={c.coo_notes} />
          {canCooReview(role, c) && (
            <WorkflowForm
              options={COO_DECISION_LABELS}
              requiresNotes={() => true}
              submitLabel="Simpan Keputusan COO"
              onSubmit={(choice, notes) =>
                run(
                  () => cooReviewComplaint(id, { decision: choice as CooDecision, notes }),
                  'Keputusan COO tersimpan.'
                )
              }
            />
          )}
          {canCooReview(role, c) && (
            <p className="text-xs text-slate-400">
              Tahap berikutnya mengikuti Complaint Level tiket ini —
              tidak dipilih manual.
            </p>
          )}
        </Section>
      )}

      {/* 4. AML / Compliance */}
      {showCompliance && (
        <Section title="AML / Compliance Review">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Keputusan" value={c.aml_decision ? formatAmlDecision(c.aml_decision) : undefined} />
            <Field label="Tanggal Review" value={c.aml_reviewed_at ? formatDateTime(c.aml_reviewed_at) : undefined} />
            <Field label="Compliance Review Oleh" value={c.compliance_reviewed_by_name ?? c.aml_reviewed_by_name} />
          </div>
          <Notes label="Catatan Compliance" value={c.aml_notes} />
          {canAmlReview(role, c) && (
            <WorkflowForm
              options={complianceDecisionOptions(c)}
              requiresNotes={() => true}
              submitLabel="Simpan Keputusan Compliance"
              onSubmit={(choice, notes) =>
                run(
                  () => amlReviewComplaint(id, { decision: choice as AmlDecision, notes }),
                  'Keputusan compliance tersimpan.'
                )
              }
            />
          )}
        </Section>
      )}

      {/* 5. Finance Staff review */}
      {showFinance && (
        <Section title="Finance Staff Review">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Keputusan" value={c.finance_decision ? formatFinanceDecision(c.finance_decision) : undefined} />
            <Field label="Tanggal Review" value={c.finance_reviewed_at ? formatDateTime(c.finance_reviewed_at) : undefined} />
            <Field label="Finance Review Oleh" value={c.finance_reviewed_by_name} />
          </div>
          <Notes label="Catatan Finance" value={c.finance_review_notes} />
          {canFinanceReview(role, c) && (
            <WorkflowForm
              options={financeDecisionOptions(c)}
              requiresNotes={() => true}
              submitLabel="Simpan Keputusan Finance"
              onSubmit={(choice, notes) =>
                run(
                  () => financeReviewComplaint(id, { decision: choice as FinanceDecision, notes }),
                  'Keputusan finance tersimpan.'
                )
              }
            />
          )}
          <p className="text-xs text-slate-400">
            Pencatatan refund tetap dilakukan melalui menu Pencatatan Refund.
          </p>
        </Section>
      )}

      {/* 5b. Finance Manager review — layer kedua LEVEL_2 */}
      {showFinance && (
        <Section title="Finance Manager Review">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field
              label="Keputusan"
              value={c.finance_manager_decision ? formatFinanceManagerDecision(c.finance_manager_decision) : undefined}
            />
            <Field
              label="Tanggal Review"
              value={c.finance_manager_reviewed_at ? formatDateTime(c.finance_manager_reviewed_at) : undefined}
            />
            <Field label="Review Oleh" value={c.finance_manager_reviewed_by_name} />
          </div>
          <Notes label="Catatan Finance Manager" value={c.finance_manager_notes} />
          {canFinanceManagerReview(role, c) && (
            <WorkflowForm
              options={FINANCE_MANAGER_DECISION_LABELS}
              requiresNotes={() => true}
              submitLabel="Simpan Keputusan Finance Manager"
              onSubmit={(choice, notes) =>
                run(
                  () => financeManagerReviewComplaint(id, {
                    decision: choice as FinanceManagerDecision,
                    notes,
                  }),
                  'Keputusan Finance Manager tersimpan.'
                )
              }
            />
          )}
        </Section>
      )}

      {/* 6. Refund terkait — read-only. Refund tidak menutup pengaduan. */}
      {(c.statement_refunds?.length ?? 0) > 0 && (
        <Section title="Refund Terkait">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Refund No</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap text-right">Nominal</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Tanggal Dana Masuk</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Status</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">Posting Saldo</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {c.statement_refunds?.map((r) => (
                  <tr key={String(r.id)} className="border-t align-top">
                    <td className="px-3 py-2 font-mono text-xs text-slate-600 break-all">{r.refund_no}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-right font-medium text-slate-800">
                      {formatMonitoringAmount(r.amount, r.currency ?? 'IDR')}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-600">{formatDateTime(r.received_at)}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${refundStatusBadgeClass(r.status)}`}>
                        {refundStatusLabel(r.status)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {r.credited_at
                        ? balanceCreditStatusLabel('CREDITED')
                        : r.approved_at
                          ? balanceCreditStatusLabel('PENDING_EXTERNAL_POSTING')
                          : '—'}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Link href={`/statement-refunds/${r.id}`} className="text-xs font-medium text-kesh-700 hover:underline">
                        Detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400">
            Refund tidak menutup pengaduan secara otomatis — penyelesaian pengaduan tetap dilakukan manual.
          </p>
        </Section>
      )}

      {c.status === 'REFUND_PROCESS' && (
        <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-800">
          Proses refund dilakukan melalui menu Pencatatan Refund.
        </div>
      )}

      {/* 7. Penyelesaian & penutupan */}
      <Section title="Penyelesaian & Penutupan">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Diselesaikan Oleh" value={c.resolved_by_name} />
          <Field label="Ditutup Oleh" value={c.closed_by_name} />
        </div>
        <Notes label="Catatan Penyelesaian" value={c.resolution_notes} />
        <Notes label="Catatan Komunikasi Nasabah" value={c.customer_communication_notes} />
        <Notes label="Catatan Penutupan" value={c.closing_notes} />

        {canResolveComplaint(role, c) && (
          <div className="space-y-3 border-t pt-3">
            <div>
              <label className="text-xs text-slate-500">
                Catatan Penyelesaian <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                placeholder="Ringkasan penyelesaian pengaduan…"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">Catatan Komunikasi ke Nasabah</label>
              <textarea
                rows={3}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
                value={communicationNotes}
                onChange={(e) => setCommunicationNotes(e.target.value)}
                placeholder="Isi komunikasi yang sudah disampaikan ke nasabah / merchant…"
              />
            </div>
            <button
              onClick={async () => {
                setBusy(true);
                await run(
                  () => resolveComplaint(id, {
                    resolution_notes: resolutionNotes.trim(),
                    customer_communication_notes: communicationNotes.trim() || undefined,
                  }),
                  'Pengaduan diselesaikan.'
                );
                setBusy(false);
              }}
              disabled={busy || resolutionNotes.trim().length === 0}
              className="rounded-lg bg-kesh-700 text-white px-4 py-2 text-sm hover:bg-kesh-600 disabled:opacity-60 transition-colors"
            >
              {busy ? 'Menyimpan…' : 'Selesaikan Pengaduan'}
            </button>
          </div>
        )}

        {canCloseComplaint(role, c) && (
          <div className="space-y-3 border-t pt-3">
            <div>
              <label className="text-xs text-slate-500">
                Catatan Penutupan <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                placeholder="Alasan / ringkasan penutupan tiket…"
              />
            </div>
            <button
              onClick={async () => {
                setBusy(true);
                await run(
                  () => closeComplaint(id, { closing_notes: closingNotes.trim() }),
                  'Pengaduan ditutup.'
                );
                setBusy(false);
              }}
              disabled={busy || closingNotes.trim().length === 0}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60 transition-colors"
            >
              {busy ? 'Menyimpan…' : 'Tutup Pengaduan'}
            </button>
          </div>
        )}
      </Section>

      {readOnly && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          {c.status === 'CLOSED'
            ? 'Pengaduan sudah ditutup — halaman ini hanya dapat dibaca.'
            : 'Anda memiliki akses baca saja pada pengaduan ini.'}
        </div>
      )}

      {customerModalOpen && customerApplicationId && (
        <ComplaintCustomerModal
          applicationId={customerApplicationId}
          onClose={() => setCustomerModalOpen(false)}
        />
      )}
    </div>
  );
}
