'use client';

// Konteks edit Pengkinian Data. SENGAJA route terpisah dari /users/:id:
// pengguna harus sadar ia sedang menyusun DRAFT PERUBAHAN, bukan menyunting
// data nasabah yang berlaku. Apa pun yang disimpan di sini masuk change-set;
// data KYC/KYB live baru berubah setelah Compliance menyetujui.
//
// Field-nya TIDAK ditulis ulang di sini — halaman ini memakai komponen form CDD
// yang sama dengan alur normal (PersonCddFields / BusinessIdentityForm) dan
// hanya menukar adapter penyimpanannya ke endpoint draft.

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/app/providers';
import { getRoleFromToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import DataReviewDiff from '@/components/DataReviewDiff';
import PersonCddFields from '@/components/person-cdd-fields';
import BusinessIdentityForm, { type BusinessIdentity } from '@/components/business-identity-form';
import DataReviewPartyEditor from '@/components/DataReviewPartyEditor';
import DataReviewDocumentEditor from '@/components/DataReviewDocumentEditor';
import DataReviewEddEditor from '@/components/DataReviewEddEditor';
import {
  getDataReviewDraft,
  stagePersonDraft,
  stageBusinessDraft,
  discardDataReviewChange,
  canEditDataReviewDraft,
  canDecideDataReviewDraft,
  type DataReviewDraft,
} from '@/lib/data-review-drafts';
import { canViewDataReview, dataReviewStatusLabel, decideDataReview, submitDataReview, type DataReviewDecision } from '@/lib/data-reviews';

export default function DataReviewEditPage() {
  const params = useParams();
  const router = useRouter();
  const reviewId = params?.reviewId as string;
  const { token } = useAuth();
  const role = getRoleFromToken(token);

  const [draft, setDraft] = useState<DataReviewDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [decision, setDecision] = useState<DataReviewDecision | null>(null);
  const [decisionNotes, setDecisionNotes] = useState('');

  const load = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setErr('');
    try {
      setDraft(await getDataReviewDraft(reviewId));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal memuat draft pengkinian data');
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [reviewId]);

  useEffect(() => { load(true); }, [load]);

  const canEdit = canEditDataReviewDraft(role);
  const canReview = canDecideDataReviewDraft(role);

  if (!canViewDataReview(role)) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Anda tidak memiliki akses ke draft pengkinian data ini.
      </div>
    );
  }
  if (loading) return <div className="p-6 text-sm text-slate-500">Memuat draft…</div>;
  if (err) {
    return <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</div>;
  }
  if (!draft) return null;

  const isBusiness = draft.review.application_type === 'BUSINESS';
  // Compliance boleh membaca draft, tapi tidak boleh menyunting usulan.
  const formDisabled = !draft.review.editable || !canEdit;

  async function discard(changeId: number) {
    setBusy(true);
    try {
      await discardDataReviewChange(reviewId, changeId);
      toast.success('Usulan perubahan dibatalkan.');
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal membatalkan usulan.');
    } finally {
      setBusy(false);
    }
  }

  async function submitForReview() {
    if (!draft) return;
    setBusy(true);
    try {
      await submitDataReview(draft.review.application_id);
      toast.success('Pengkinian data diajukan untuk review Compliance.');
      router.push(`/users/${draft.review.application_id}`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal mengajukan pengkinian data.');
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!draft || !decision) return;
    if ((decision === 'RETURN_FOR_REVISION' || decision === 'REJECTED') && !decisionNotes.trim()) {
      toast.error('Catatan keputusan wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      await decideDataReview(draft.review.application_id, {
        decision,
        reason: decisionNotes.trim() || undefined,
        expected_version: draft.review.version,
      });
      toast.success(decision === 'APPROVED' ? 'Pengkinian data disetujui dan dipromosikan.' : decision === 'RETURN_FOR_REVISION' ? 'Draft dikembalikan untuk revisi.' : 'Pengkinian data ditolak.');
      setDecision(null);
      setDecisionNotes('');
      if (decision === 'APPROVED') router.push(`/users/${draft.review.application_id}`);
      else await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Gagal menyimpan keputusan.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Banner konteks — pembeda utama dari form onboarding biasa. */}
      <div
        className="rounded-xl border border-kesh-200 bg-kesh-50 p-4"
        data-testid="draft-context-banner"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-kesh-700">
              Pengkinian Data — Draft Perubahan
            </p>
            <h1 className="mt-1 text-lg font-semibold text-slate-800">{draft.review.review_no}</h1>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Perubahan di halaman ini <strong>belum berlaku</strong>. Data nasabah baru diperbarui
              setelah Compliance menyetujui pengkinian ini.
            </p>
          </div>
          <div className="text-right">
            <span className="rounded bg-white px-2 py-1 text-xs font-medium text-slate-700">
              Status: {dataReviewStatusLabel(draft.review.status)}
            </span>
            <div className="mt-1 text-xs text-slate-500">Versi draft {draft.review.version}</div>
          </div>
        </div>
        <Link
          href={`/users/${draft.review.application_id}`}
          className="mt-3 inline-block text-sm text-kesh-700 hover:underline"
        >
          ← Kembali ke detail pengguna jasa
        </Link>
      </div>

      {!draft.review.editable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Draft terkunci pada status {dataReviewStatusLabel(draft.review.status)} — menunggu
          keputusan Compliance.
        </div>
      )}
      {draft.review.editable && !canEdit && (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          Hanya Frontline yang dapat menyunting draft. Anda melihat usulan sebagai peninjau.
        </div>
      )}
      {draft.review.decision_notes && (
        <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <span className="font-semibold">Catatan Compliance:</span> {draft.review.decision_notes}
        </div>
      )}

      {/* Form CDD — komponen yang sama dengan alur normal, adapter ditukar. */}
      <div className="rounded-2xl border p-4">
        <h2 className="text-sm font-semibold text-slate-800">
          {isBusiness ? 'Data Badan Usaha' : 'Data Pribadi'}
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Nilai awal diambil dari usulan terakhir Anda; nilai yang berlaku saat ini ditampilkan
          sebagai pembanding.
        </p>

        <div className="mt-4">
          {isBusiness ? (
            <BusinessIdentityForm
              key={reviewId}
              appId={draft.review.application_id}
              business={(draft.proposed.business ?? {}) as BusinessIdentity}
              disabled={formDisabled}
              saveAdapter={(patch) =>
                stageBusinessDraft(reviewId, patch as Record<string, unknown>, draft!.review.version)
              }
              submitLabel="Simpan Draft"
              onSaved={load}
              onCancel={() => router.push(`/users/${draft.review.application_id}`)}
            />
          ) : (
            <PersonCddFields
              key={reviewId}
              person={draft.proposed.person}
              compareTo={draft.current.person}
              customerType={
                (draft.proposed.person?.cif_relationship_type ??
                  draft.current.person?.cif_relationship_type) === 'WIC'
                  ? 'WIC'
                  : 'OUR_CUSTOMER'
              }
              disabled={formDisabled}
              submitLabel="Simpan Draft"
              save={(patch) => stagePersonDraft(reviewId, patch, draft!.review.version)}
              onSaved={load}
            />
          )}
        </div>

        {draft.review.editable && canEdit && (
          <div className="mt-4 border-t pt-4">
            <button
              onClick={submitForReview}
              disabled={busy || !draft.review.has_pending_changes}
              title={draft.review.has_pending_changes ? undefined : 'Belum ada perubahan untuk diajukan'}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
            >
              Ajukan untuk Review Compliance
            </button>
          </div>
        )}
      </div>

      {isBusiness && (
        <div className="rounded-2xl border p-4">
          <DataReviewPartyEditor reviewId={reviewId} rows={draft.proposed.parties} version={draft.review.version} disabled={formDisabled} onChanged={load} />
        </div>
      )}

      <div className="rounded-2xl border p-4">
        <DataReviewDocumentEditor reviewId={reviewId} applicationType={draft.review.application_type} rows={draft.proposed.documents} version={draft.review.version} disabled={formDisabled} onChanged={load} />
      </div>

      <div className="rounded-2xl border border-red-200 bg-red-50/20 p-4">
        <DataReviewEddEditor reviewId={reviewId} proposed={draft.proposed.edd} version={draft.review.version} disabled={formDisabled} role={role} onChanged={load} />
      </div>

      {/* Ringkasan usulan (sebelum → sesudah) */}
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Usulan Perubahan</h2>
          <span className="text-xs text-slate-500">{draft.changes.length} usulan</span>
        </div>
        <div className="mt-3">
          <DataReviewDiff changes={draft.changes} />
        </div>
        {draft.review.editable && canEdit && draft.changes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.changes.map((c) => (
              <button
                key={c.id}
                onClick={() => discard(c.id)}
                disabled={busy}
                className="rounded-lg border px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Batalkan usulan #{c.id}
              </button>
            ))}
          </div>
        )}
      </div>

      {canReview && ['SUBMITTED', 'IN_COMPLIANCE_REVIEW'].includes(draft.review.status) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3" data-testid="compliance-decision-panel">
          <div><h2 className="text-sm font-semibold text-slate-800">Keputusan Compliance</h2><p className="text-xs text-slate-600">Pastikan seluruh nilai SEBELUM dan SESUDAH di atas sudah ditinjau.</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setDecision('APPROVED')} className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Setujui</button>
            <button type="button" onClick={() => setDecision('RETURN_FOR_REVISION')} className="rounded-md bg-orange-600 px-3 py-2 text-sm font-medium text-white">Kembalikan untuk Revisi</button>
            <button type="button" onClick={() => setDecision('REJECTED')} className="rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white">Tolak</button>
          </div>
          {decision && <div className="space-y-2">
            <label htmlFor="compliance-decision-notes" className="text-xs font-medium text-slate-700">Catatan {decision !== 'APPROVED' && <span className="text-red-600">*</span>}</label>
            <textarea id="compliance-decision-notes" rows={3} value={decisionNotes} onChange={(e) => setDecisionNotes(e.target.value)} placeholder="Isi catatan keputusan…" className="w-full rounded-md border bg-white px-3 py-2 text-sm" />
            <button type="button" disabled={busy} onClick={decide} className="rounded-md bg-kesh-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? 'Menyimpan…' : 'Konfirmasi Keputusan'}</button>
          </div>}
        </div>
      )}
    </div>
  );
}
