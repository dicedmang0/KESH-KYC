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
import { evaluateTransfer } from '@/lib/monitoring';
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
  const canSubmit = role === 'FinanceStaff' && row?.status === 'DRAFT';
  const canDecide = role === 'FinanceManager' && row?.status === 'SUBMITTED';
  const canSetResult = role === 'FinanceManager' && row?.status === 'APPROVED';
  const hasAnyAction = canSubmit || canDecide || canSetResult;
  const canEvaluateMonitoring = role === 'ComplianceLead' || role === 'SystemAdmin';

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
              <Field label="ID Aplikasi Pengirim" value={row.sender_application_id} />
              <Field label="Nomor Rekening Sumber" value={row.source_account_no} />
              <Field label="Nama Rekening Sumber" value={row.source_account_name} />
              <Field label="Kode Bank Sumber" value={row.source_bank_code} />
              <Field label="Nama Bank Sumber" value={row.source_bank_name} />
            </div>
          </SectionCard>

          {/* 3. Beneficiary */}
          <SectionCard title="Penerima">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Field label="Nama Rekening" value={row.beneficiary_account_name} />
              <Field label="Nomor Rekening" value={row.beneficiary_account_number} />
              <Field label="Kode Bank" value={row.beneficiary_bank_code} />
              <Field label="Nama Bank" value={row.beneficiary_bank_name} />
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
                    Ajukan
                  </button>
                )}
                {canDecide && (
                  <>
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-700 disabled:opacity-50"
                      disabled={actionLoading}
                      onClick={() => { setPanel(panel === 'approve' ? 'none' : 'approve'); setActionErr(''); }}
                    >
                      Setujui
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

              {/* Approve form */}
              {canDecide && panel === 'approve' && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div>
                    <label className="text-xs text-muted-foreground">Catatan keputusan (opsional)</label>
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
                    {actionLoading ? 'Menyimpan…' : 'Konfirmasi Setujui'}
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
                    <label className="text-xs text-muted-foreground">Catatan keputusan (opsional)</label>
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

          {!hasAnyAction && (
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
