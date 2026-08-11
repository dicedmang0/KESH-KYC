'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatCif } from '@/lib/utils';
import { formatMonitoringAmount, formatDateTime, formatDate } from '@/lib/monitoring';
import {
  getStatementRefund,
  updateStatementRefund,
  matchStatementRefund,
  submitStatementRefund,
  decideStatementRefund,
  refundStatusLabel,
  refundStatusBadgeClass,
  matchConfidenceLabel,
  matchMethodLabel,
  balanceCreditStatusLabel,
  canViewStatementRefund,
  canUpdateStatementRefund,
  canMatchStatementRefund,
  canSubmitStatementRefund,
  canDecideStatementRefund,
  isRefundEditable,
  isRefundMatchable,
  isRefundSubmittable,
  isRefundDecidable,
  type StatementRefund,
} from '@/lib/statement-refunds';

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

function Modal({
  title, children, onClose, onConfirm, confirmLabel, busy, confirmClass,
}: {
  title: string;
  children?: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  busy: boolean;
  confirmClass?: string;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 space-y-3">
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        {children}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-60 ${confirmClass ?? 'bg-kesh-700 hover:bg-kesh-600'}`}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

type ModalKind = 'match' | 'submit' | 'approve' | 'reject' | null;

export default function StatementRefundDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [refund, setRefund] = useState<StatementRefund | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);

  // match form
  const [matchTransferRefNo, setMatchTransferRefNo] = useState('');
  const [matchComplaintNo, setMatchComplaintNo] = useState('');
  const [matchNotes, setMatchNotes] = useState('');
  // decision form
  const [financeNotes, setFinanceNotes] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  // edit form
  const [editBankName, setEditBankName] = useState('');
  const [editBankAccountNo, setEditBankAccountNo] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [saving, setSaving] = useState(false);

  function hydrate(data: StatementRefund) {
    setRefund(data);
    setEditBankName(data.bank_name ?? '');
    setEditBankAccountNo(data.bank_account_no ?? '');
    setEditDescription(data.statement_description ?? '');
    setEditNotes(data.investigation_notes ?? '');
  }

  useEffect(() => {
    if (!id) return;
    let alive = true;
    setLoading(true);
    setErr('');
    (async () => {
      try {
        const data = await getStatementRefund(id);
        if (!alive) return;
        hydrate(data);
      } catch (e: unknown) {
        if (!alive) return;
        setErr(e instanceof Error ? e.message : 'Gagal memuat data refund');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  async function refresh() {
    const data = await getStatementRefund(id);
    hydrate(data);
  }

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      await refresh();
      toast.success(okMsg);
      setModal(null);
      setMatchTransferRefNo(''); setMatchComplaintNo(''); setMatchNotes('');
      setFinanceNotes(''); setRejectReason('');
    } catch (e: unknown) {
      // Backend menolak match nominal berbeda tanpa catatan — tampilkan pesannya.
      toast.error(e instanceof Error ? e.message : 'Aksi gagal. Silakan coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      await updateStatementRefund(id, {
        bank_name: editBankName.trim() || undefined,
        bank_account_no: editBankAccountNo.trim() || undefined,
        statement_description: editDescription.trim() || undefined,
        investigation_notes: editNotes.trim() || undefined,
      });
      await refresh();
      toast.success('Pencatatan refund diperbarui.');
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal memperbarui pencatatan refund.');
    } finally {
      setSaving(false);
    }
  }

  if (!canViewStatementRefund(role)) {
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
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-4 animate-pulse rounded bg-slate-100" />)}
        </div>
      </div>
    );
  }

  if (err) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  }
  if (!refund) return null;

  const status = refund.status;
  const showEdit = canUpdateStatementRefund(role) && isRefundEditable(status);
  const showMatch = canMatchStatementRefund(role) && isRefundMatchable(status);
  const showSubmit = canSubmitStatementRefund(role) && isRefundSubmittable(status);
  const showDecide = canDecideStatementRefund(role) && isRefundDecidable(status);
  const readOnly = !showEdit && !showMatch && !showSubmit && !showDecide;

  const balanceMessage =
    status === 'BALANCE_CREDITED'
      ? 'Saldo partner sudah dikreditkan.'
      : refund.balance_credit_status === 'PENDING_EXTERNAL_POSTING'
        ? 'Refund sudah disetujui. Posting saldo partner menunggu integrasi/sistem balance eksternal.'
        : 'Belum ada posting saldo.';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/statement-refunds" className="text-sm text-kesh-700 hover:underline">
            ← Pencatatan Refund
          </Link>
          <h1 className="mt-1 text-xl font-semibold break-all">{refund.refund_no}</h1>
        </div>
        <span className={`rounded px-2 py-1 text-xs font-medium whitespace-nowrap ${refundStatusBadgeClass(status)}`}>
          {refundStatusLabel(status)}
        </span>
      </div>

      {/* Actions */}
      {(showMatch || showSubmit || showDecide) && (
        <div className="flex flex-wrap gap-2">
          {showMatch && (
            <button
              onClick={() => {
                setMatchTransferRefNo(refund.original_transfer_reference_no ?? '');
                setMatchComplaintNo(refund.complaint_no ?? refund.complaint?.complaint_no ?? '');
                setMatchNotes(refund.investigation_notes ?? '');
                setModal('match');
              }}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Match ke Transaksi
            </button>
          )}
          {showSubmit && (
            <button
              onClick={() => setModal('submit')}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700"
            >
              Ajukan Approval
            </button>
          )}
          {showDecide && (
            <>
              <button
                onClick={() => { setFinanceNotes(''); setModal('approve'); }}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
              >
                Setujui Refund
              </button>
              <button
                onClick={() => { setRejectReason(''); setModal('reject'); }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
              >
                Tolak Refund
              </button>
            </>
          )}
        </div>
      )}

      {showDecide && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Approval refund belum otomatis melakukan posting saldo partner sampai integrasi balance tersedia.
        </div>
      )}

      {/* 1. Ringkasan */}
      <Section title="Ringkasan Refund">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="No. Refund" value={<span className="font-mono">{refund.refund_no}</span>} />
          <Field label="Status" value={
            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${refundStatusBadgeClass(status)}`}>
              {refundStatusLabel(status)}
            </span>
          } />
          <Field label="Nominal" value={formatMonitoringAmount(refund.amount, refund.currency ?? 'IDR')} />
          <Field label="Mata Uang" value={refund.currency} />
          <Field label="Tanggal Statement" value={formatDate(refund.statement_date)} />
          <Field label="Tanggal Dana Masuk" value={formatDateTime(refund.received_at)} />
          <Field label="Nama Bank" value={refund.bank_name} />
          <Field label="No. Rekening" value={refund.bank_account_no ? <span className="font-mono">{refund.bank_account_no}</span> : undefined} />
          <Field label="No. Referensi Bank" value={refund.bank_reference_no ? <span className="font-mono">{refund.bank_reference_no}</span> : undefined} />
        </div>
        <Field label="Deskripsi Statement" value={
          refund.statement_description
            ? <span className="whitespace-pre-wrap text-slate-700">{refund.statement_description}</span>
            : undefined
        } />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {/* Nama aktor, bukan ID numerik internal. */}
          <Field label="Dibuat Oleh" value={refund.created_by_name} />
          <Field label="Tanggal Dibuat" value={formatDateTime(refund.created_at)} />
          <Field label="Diajukan Oleh" value={refund.submitted_by_name} />
          <Field label="Diajukan Pada" value={formatDateTime(refund.submitted_at)} />
        </div>
      </Section>

      {/* 2. Complaint */}
      <Section title="Pengaduan Terkait">
        {refund.complaint ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Identitas pengaduan adalah nomornya; complaint_id internal tidak
                pernah ditampilkan. Data lama tanpa nomor tampil sebagai em dash. */}
            <Field label="Nomor Pengaduan" value={
              (refund.complaint_no ?? refund.complaint.complaint_no) ? (
                <Link
                  href={`/complaints/${refund.complaint.id}`}
                  className="font-mono text-kesh-700 hover:underline break-all"
                >
                  {refund.complaint_no ?? refund.complaint.complaint_no}
                </Link>
              ) : undefined
            } />
            <Field label="Status Pengaduan" value={refund.complaint.status} />
            <Field label="Nama Customer" value={refund.complaint.customer_name} />
            <Field label="No. Transaksi" value={refund.complaint.transaction_reference} />
            <Field label="Tanggal Pengaduan" value={formatDateTime(refund.complaint.created_at)} />
          </div>
        ) : (
          <p className="text-sm text-slate-400">Tidak tertaut ke pengaduan mana pun.</p>
        )}
      </Section>

      {/* 3. Transfer */}
      <Section title="Transaksi Awal">
        {refund.transfer ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {/* Identitas utama transaksi awal adalah nomor referensi partner.
                ID internal tetap ditampilkan, tapi sebagai keterangan kecil. */}
            <Field label="Nomor Referensi Transaksi Awal" value={
              <>
                <Link
                  href={`/transfers/${refund.transfer.id}`}
                  className="font-mono text-kesh-700 hover:underline break-all"
                >
                  {refund.original_transfer_reference_no ?? refund.transfer.partner_reference_no ?? `#${refund.transfer.id}`}
                </Link>
                <div className="text-xs font-normal text-slate-400">
                  Internal Transfer ID: {refund.transfer.id}
                </div>
              </>
            } />
            <Field label="No. Referensi Internal" value={
              refund.transfer.reference_no ? <span className="font-mono">{refund.transfer.reference_no}</span> : undefined
            } />
            <Field label="Nominal Transaksi" value={formatMonitoringAmount(refund.transfer.amount, refund.transfer.currency ?? 'IDR')} />
            <Field label="Status Transaksi" value={refund.transfer.status} />
            <Field label="Hasil" value={refund.transfer.result} />
            <Field label="Bank Penerima" value={refund.transfer.beneficiary_bank_name} />
            <Field label="Rekening Penerima" value={
              refund.transfer.beneficiary_account_number
                ? <span className="font-mono">{refund.transfer.beneficiary_account_number}</span>
                : undefined
            } />
            <Field label="Nama Penerima" value={refund.transfer.beneficiary_account_name} />
            {refund.partner && (
              <>
                <Field label="Partner" value={refund.partner.display_name} />
                <Field label="CIF Partner" value={<span className="font-mono">{formatCif(refund.partner.cif_no)}</span>} />
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Belum dicocokkan ke transaksi asal.</p>
        )}
      </Section>

      {/* 4. Matching */}
      <Section title="Pencocokan & Investigasi">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Metode Match" value={matchMethodLabel(refund.match_method)} />
          <Field label="Match Confidence" value={matchConfidenceLabel(refund.match_confidence)} />
          <Field label="Dicocokkan Oleh" value={refund.matched_by_name} />
          <Field label="Tanggal Match" value={formatDateTime(refund.matched_at)} />
        </div>
        <Field label="Catatan Investigasi" value={
          refund.investigation_notes
            ? <span className="whitespace-pre-wrap text-slate-700">{refund.investigation_notes}</span>
            : undefined
        } />
      </Section>

      {/* 5. Finance */}
      <Section title="Approval Finance">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Disetujui Oleh" value={refund.approved_by_name} />
          <Field label="Tanggal Disetujui" value={formatDateTime(refund.approved_at)} />
          <Field label="Ditolak Oleh" value={refund.rejected_by_name} />
          <Field label="Tanggal Ditolak" value={formatDateTime(refund.rejected_at)} />
        </div>
        <Field label="Catatan Finance" value={
          refund.finance_notes
            ? <span className="whitespace-pre-wrap text-slate-700">{refund.finance_notes}</span>
            : undefined
        } />
        <Field label="Alasan Penolakan" value={
          refund.rejection_reason
            ? <span className="whitespace-pre-wrap text-red-700">{refund.rejection_reason}</span>
            : undefined
        } />
      </Section>

      {/* 6. Balance */}
      <Section title="Posting Saldo">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Status Posting" value={balanceCreditStatusLabel(refund.balance_credit_status)} />
          <Field label="ID Balance Event" value={refund.balance_event_id} />
          <Field label="Tanggal Kredit" value={formatDateTime(refund.credited_at)} />
        </div>
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          status === 'BALANCE_CREDITED'
            ? 'border-teal-200 bg-teal-50 text-teal-800'
            : refund.balance_credit_status === 'PENDING_EXTERNAL_POSTING'
              ? 'border-amber-200 bg-amber-50 text-amber-800'
              : 'border-slate-200 bg-slate-50 text-slate-500'
        }`}>
          {balanceMessage}
        </div>
      </Section>

      {/* Edit — FinanceStaff, sebelum approval */}
      {showEdit && (
        <Section title="Perbarui Pencatatan">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-xs text-slate-500">Nama Bank</label>
              <input
                value={editBankName}
                onChange={(e) => setEditBankName(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">No. Rekening</label>
              <input
                value={editBankAccountNo}
                onChange={(e) => setEditBankAccountNo(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Deskripsi Statement</label>
              <textarea
                rows={2}
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs text-slate-500">Catatan Investigasi</label>
              <textarea
                rows={3}
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
              />
            </div>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-60"
          >
            {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
          </button>
        </Section>
      )}

      {readOnly && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Anda memiliki akses baca saja pada refund ini.
        </div>
      )}

      {/* ── Modals ── */}
      {modal === 'match' && (
        <Modal
          title="Match Refund ke Transaksi"
          busy={busy}
          confirmLabel="Cocokkan"
          onClose={() => setModal(null)}
          onConfirm={() => {
            const ref = matchTransferRefNo.trim();
            if (!ref) {
              toast.error('Nomor referensi transaksi awal wajib diisi.');
              return;
            }
            run(
              () => matchStatementRefund(id, {
                original_transfer_reference_no: ref,
                complaint_no: matchComplaintNo.trim() || undefined,
                match_method: 'MANUAL',
                investigation_notes: matchNotes.trim() || undefined,
              }),
              'Refund berhasil dicocokkan ke transaksi asal.',
            );
          }}
        >
          <div className="space-y-3">
            <div>
              <label htmlFor="match-transfer-reference-no" className="text-xs text-slate-500">
                Nomor Referensi Transaksi Awal <span className="text-red-600">*</span>
              </label>
              <input
                id="match-transfer-reference-no"
                value={matchTransferRefNo}
                onChange={(e) => setMatchTransferRefNo(e.target.value)}
                placeholder="TRF-A8K3P9Q2"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:border-kesh-700"
              />
              <p className="mt-1 text-xs text-slate-400">
                Gunakan nomor referensi yang tampil pada detail transfer, contoh: TRF-A8K3P9Q2.
                Referensi lama yang panjang (KESH-TRF-…) tetap diterima.
              </p>
            </div>
            <div>
              <label htmlFor="match-complaint-no" className="text-xs text-slate-500">
                Nomor Pengaduan (opsional)
              </label>
              <input
                id="match-complaint-no"
                value={matchComplaintNo}
                onChange={(e) => setMatchComplaintNo(e.target.value)}
                placeholder="CMP-M4X7B2D9"
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm font-mono outline-none focus:border-kesh-700"
              />
              <p className="mt-1 text-xs text-slate-400">
                Gunakan nomor pengaduan yang tampil pada detail pengaduan.
              </p>
            </div>
            <div>
              <label htmlFor="match-notes" className="text-xs text-slate-500">Catatan Investigasi</label>
              <textarea
                id="match-notes"
                rows={3}
                value={matchNotes}
                onChange={(e) => setMatchNotes(e.target.value)}
                placeholder="Wajib jika nominal refund berbeda dengan transaksi asal."
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
              />
            </div>
            <p className="text-xs text-slate-400">
              Metode match: Manual. Pencocokan tidak mengkreditkan saldo partner.
            </p>
          </div>
        </Modal>
      )}

      {modal === 'submit' && (
        <Modal
          title="Ajukan Approval"
          busy={busy}
          confirmLabel="Ajukan"
          onClose={() => setModal(null)}
          onConfirm={() => run(() => submitStatementRefund(id), 'Refund diajukan ke Finance Manager.')}
        >
          <p className="text-sm text-slate-600">
            Ajukan refund ini ke Finance Manager untuk approval?
          </p>
        </Modal>
      )}

      {modal === 'approve' && (
        <Modal
          title="Setujui Refund"
          busy={busy}
          confirmLabel="Setujui"
          confirmClass="bg-emerald-600 hover:bg-emerald-700"
          onClose={() => setModal(null)}
          onConfirm={() => run(
            () => decideStatementRefund(id, { decision: 'APPROVED', finance_notes: financeNotes.trim() || undefined }),
            'Refund disetujui.',
          )}
        >
          <div className="space-y-3">
            <p className="text-xs text-amber-700">
              Approval refund belum otomatis melakukan posting saldo partner sampai integrasi balance tersedia.
            </p>
            <div>
              <label htmlFor="approve-finance-notes" className="text-xs text-slate-500">Catatan Finance (opsional)</label>
              <textarea
                id="approve-finance-notes"
                rows={3}
                value={financeNotes}
                onChange={(e) => setFinanceNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
              />
            </div>
          </div>
        </Modal>
      )}

      {modal === 'reject' && (
        <Modal
          title="Tolak Refund"
          busy={busy}
          confirmLabel="Tolak"
          confirmClass="bg-red-600 hover:bg-red-700"
          onClose={() => setModal(null)}
          onConfirm={() => {
            if (!rejectReason.trim()) {
              toast.error('Alasan wajib diisi untuk menolak refund.');
              return;
            }
            run(
              () => decideStatementRefund(id, { decision: 'REJECTED', reason: rejectReason.trim() }),
              'Refund ditolak.',
            );
          }}
        >
          <div>
            <label htmlFor="reject-reason" className="text-xs text-slate-500">Alasan <span className="text-red-600">*</span></label>
            <textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Isi alasan penolakan…"
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
