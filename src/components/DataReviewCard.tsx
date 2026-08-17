'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/lib/toast';
import {
  getDataReviewStatus,
  initiateDataReview,
  submitDataReview,
  decideDataReview,
  dataReviewStatusLabel,
  riskPeriodLabel,
  canViewDataReview,
  canInitiateDataReview,
  canSubmitDataReview,
  canDecideDataReview,
  type DataReviewStatusResponse,
  type DataReviewDecision,
} from '@/lib/data-reviews';

function fmt(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' });
}

function Info({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-800 break-words">{value ?? '—'}</div>
    </div>
  );
}

// Active (non-terminal) review states used to gate action buttons.
const SUBMITTABLE = ['DRAFT', 'RETURNED_FOR_REVISION'];
const DECIDABLE = ['SUBMITTED', 'IN_COMPLIANCE_REVIEW'];

export default function DataReviewCard({ appId, role }: { appId: string; role: string | null }) {
  const [data, setData] = useState<DataReviewStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const [decision, setDecision] = useState<DataReviewDecision | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setData(await getDataReviewStatus(appId));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat status pengkinian data');
    } finally {
      setLoading(false);
    }
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  // Backend restricts the status endpoint; don't render for roles that can't read it.
  if (!canViewDataReview(role)) return null;

  const activeStatus = data?.active_review?.status ?? null;
  const showInitiate = canInitiateDataReview(role) && !data?.active_review;
  const showSubmit = canSubmitDataReview(role) && !!activeStatus && SUBMITTABLE.includes(activeStatus);
  const showDecide = canDecideDataReview(role) && !!activeStatus && DECIDABLE.includes(activeStatus);
  // Draft submission and Compliance decisions belong on the staged diff page,
  // so the detail card only links there and never bypasses review context.
  const showWorkflowShortcuts = false;

  async function run(fn: () => Promise<unknown>, okMsg: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(okMsg);
      setDecision(null);
      setReason('');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Aksi gagal. Silakan coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  async function initiate() {
    setBusy(true);
    try {
      const res = await initiateDataReview(appId);
      toast.success(res.created ? 'Pengkinian data berhasil dimulai.' : 'Pengkinian data sedang berjalan.');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Aksi gagal. Silakan coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  function submitDecision() {
    if (!decision) return;
    if ((decision === 'RETURN_FOR_REVISION' || decision === 'REJECTED') && !reason.trim()) {
      toast.error('Alasan wajib diisi untuk aksi ini.');
      return;
    }
    run(() => decideDataReview(appId, { decision, reason: reason.trim() || undefined }),
      decision === 'APPROVED' ? 'Pengkinian data disetujui.'
        : decision === 'REJECTED' ? 'Pengkinian data ditolak.'
        : 'Pengkinian data dikembalikan untuk perbaikan.');
  }

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pengkinian Data</p>
        <div className="flex items-center gap-2">
          {data && (
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
              {dataReviewStatusLabel(data.status)}
            </span>
          )}
          <Link href="/data-reviews" className="text-xs font-medium text-kesh-700 hover:underline whitespace-nowrap">
            Buka Menu Pengkinian Data →
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Memuat status pengkinian data…</p>
      ) : err ? (
        <p className="text-sm text-red-600">{err}</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Info label="Risk Level" value={data.risk_level ?? '—'} />
            <Info label="Periode Pengkinian" value={riskPeriodLabel(data.risk_level)} />
            <Info label="Tanggal Dasar" value={fmt(data.base_submitted_at)} />
            <Info label="Jatuh Tempo" value={fmt(data.due_at)} />
            <Info
              label="Status Saat Ini"
              value={
                <span className={data.is_due ? 'text-amber-700' : undefined}>
                  {dataReviewStatusLabel(data.status)}
                </span>
              }
            />
          </div>

          {data.last_review && (
            <div className={`rounded-lg p-3 space-y-2 text-xs ${data.active_review ? 'bg-kesh-50 border border-kesh-100 text-kesh-900' : 'bg-slate-50 text-slate-600'}`}>
              <p className={`font-semibold ${data.active_review ? 'text-kesh-800' : 'text-slate-700'}`}>
                {data.active_review ? 'Pengkinian Sedang Berjalan' : 'Review Terakhir'}
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Info label="No. Review" value={<span className="font-mono">{data.last_review.review_no}</span>} />
                <Info label="Status" value={dataReviewStatusLabel(data.last_review.status)} />
                <Info label="Jenis" value={data.last_review.review_type} />
                {data.active_review && (
                  <Info label="Diinisiasi oleh" value={data.active_review.initiated_by_name} />
                )}
                <Info label="Tanggal Dimulai" value={fmt(data.last_review.initiated_at)} />
                <Info label="Diajukan" value={fmt(data.last_review.submitted_at)} />
                <Info label="Direview" value={fmt(data.last_review.reviewed_at)} />
              </div>
              {data.last_review.decision_notes && (
                <p className="pt-1">Catatan: <span className="text-slate-700">{data.last_review.decision_notes}</span></p>
              )}
              {data.active_review && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {showSubmit && (
                    // Konteks draft, BUKAN form onboarding: perubahan di sana
                    // masuk change-set dan baru berlaku setelah Compliance setuju.
                    <Link
                      href={`/data-reviews/${data.active_review.id}/edit`}
                      className="rounded-lg border border-kesh-700 px-3 py-1.5 text-xs font-medium text-kesh-700 hover:bg-kesh-100"
                    >
                      Perbarui Data
                    </Link>
                  )}
                  {canDecideDataReview(role) && (
                    <Link
                      href={`/data-reviews/${data.active_review.id}/edit`}
                      className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      Lihat Perubahan Diusulkan
                    </Link>
                  )}
                  <Link
                    href="/data-reviews"
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                  >
                    Lihat Detail Pengkinian
                  </Link>
                </div>
              )}
            </div>
          )}

          {data.status === 'RETURNED_FOR_REVISION' && (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
              Pengkinian data dikembalikan untuk perbaikan. Perbaiki data lalu ajukan ulang.
            </div>
          )}

          {/* Actions — kept separate from KYC/KYB approval buttons. */}
          {(showInitiate || ((showSubmit || showDecide) && showWorkflowShortcuts)) && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex flex-wrap gap-2">
                {showInitiate && (
                  <button
                    onClick={initiate}
                    disabled={busy}
                    className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-60 transition-colors"
                  >
                    Mulai Pengkinian Data
                  </button>
                )}
                {showSubmit && showWorkflowShortcuts && (
                  <button
                    onClick={() => run(() => submitDataReview(appId), 'Hasil pengkinian data diajukan untuk review Compliance.')}
                    disabled={busy}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
                  >
                    {activeStatus === 'RETURNED_FOR_REVISION' ? 'Ajukan Ulang Hasil Pengkinian' : 'Ajukan Hasil Pengkinian'}
                  </button>
                )}
                {showDecide && showWorkflowShortcuts && (
                  <>
                    <button
                      onClick={() => { setDecision('APPROVED'); setReason(''); }}
                      disabled={busy}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                    >
                      Setujui
                    </button>
                    <button
                      onClick={() => { setDecision('RETURN_FOR_REVISION'); setReason(''); }}
                      disabled={busy}
                      className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
                    >
                      Kembalikan untuk Revisi
                    </button>
                    <button
                      onClick={() => { setDecision('REJECTED'); setReason(''); }}
                      disabled={busy}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
                    >
                      Tolak
                    </button>
                  </>
                )}
              </div>

              {showDecide && showWorkflowShortcuts && decision && decision !== 'APPROVED' && (
                <div className="space-y-2">
                  <label className="text-xs text-slate-500">Alasan <span className="text-red-600">*</span></label>
                  <textarea
                    rows={3}
                    className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:border-kesh-700 resize-y"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Isi alasan…"
                  />
                </div>
              )}

              {showDecide && showWorkflowShortcuts && decision && (
                <button
                  onClick={submitDecision}
                  disabled={busy}
                  className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-60 transition-colors"
                >
                  {busy ? 'Menyimpan…' : 'Konfirmasi Keputusan'}
                </button>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
