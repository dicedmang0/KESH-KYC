'use client';

import { useMemo, useState } from 'react';
import EddForm, { DEFAULT_EDD, type EddFormData } from '@/components/EddForm';
import { stageEddDraft } from '@/lib/data-review-drafts';
import { toast } from '@/lib/toast';

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}
function text(value: unknown): string { return typeof value === 'string' ? value : ''; }
function list(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []; }
function bool(value: unknown): boolean { return value === true; }

export function normalizeFrontDeskEdd(edd: Record<string, unknown> | null): Partial<EddFormData> {
  const applicant = object(edd?.applicant_snapshot);
  const reasons = object(edd?.high_risk_reasons);
  const additional = object(edd?.additional_information);
  const bo = object(edd?.beneficial_owner);
  return {
    nama_lengkap: text(applicant.full_name), nomor_identitas: text(applicant.identity_number),
    jenis_identitas: text(applicant.identity_type), alamat_domisili: text(applicant.domicile_address),
    pekerjaan_jenis_usaha: text(applicant.occupation_or_business_type), nomor_telepon: text(applicant.phone_number),
    kategori_pengguna: text(applicant.customer_category), nomor_referensi_cdd: text(applicant.cdd_reference_no),
    karakteristik_pengguna: list(reasons.customer_characteristics), pola_transaksi: list(reasons.transaction_patterns),
    hasil_screening_checks: list(reasons.screening_results), klarifikasi_tambahan: list(reasons.additional_clarification_requests),
    catatan_alasan_edd: text(reasons.summary_notes), tujuan_hubungan: list(additional.business_relationship_purposes),
    tujuan_lainnya: text(additional.business_relationship_purpose_other),
    source_of_funds: text(additional.source_of_funds), source_of_funds_other: text(additional.source_of_funds_other),
    business_relationship_purpose: text(additional.business_relationship_purpose),
    business_relationship_purpose_other: text(additional.business_relationship_purpose_other),
    dokumen_sumber_dana: list(additional.source_of_funds_documents),
    dokumen_sumber_dana_lainnya: text(additional.source_of_funds_document_other),
    sumber_kekayaan: list(additional.source_of_wealth), sumber_kekayaan_lainnya: text(additional.source_of_wealth_other),
    dokumen_sumber_kekayaan: list(additional.source_of_wealth_documents),
    dokumen_sumber_kekayaan_lainnya: text(additional.source_of_wealth_document_other),
    bertindak_untuk_pihak_lain: bool(bo.acting_for_other_party), nama_bo: text(bo.name),
    hubungan_bo: text(bo.relationship), nomor_identitas_bo: text(bo.identity_number), alamat_bo: text(bo.address),
    sumber_dana_kekayaan_bo: text(bo.source_of_funds_and_wealth), dokumen_bo: list(bo.documents),
  };
}

export function buildFrontDeskEddSections(data: EddFormData): Record<string, unknown> {
  return {
    applicant_snapshot: {
      full_name: data.nama_lengkap, identity_number: data.nomor_identitas,
      identity_type: data.jenis_identitas, domicile_address: data.alamat_domisili,
      occupation_or_business_type: data.pekerjaan_jenis_usaha, phone_number: data.nomor_telepon,
      customer_category: data.kategori_pengguna, cdd_reference_no: data.nomor_referensi_cdd,
    },
    high_risk_reasons: {
      customer_characteristics: data.karakteristik_pengguna, transaction_patterns: data.pola_transaksi,
      screening_results: data.hasil_screening_checks,
      additional_clarification_requests: data.klarifikasi_tambahan, summary_notes: data.catatan_alasan_edd,
    },
    additional_information: {
      business_relationship_purposes: data.tujuan_hubungan,
      business_relationship_purpose: data.business_relationship_purpose,
      business_relationship_purpose_other: data.business_relationship_purpose === 'Lainnya' ? data.business_relationship_purpose_other : '',
      source_of_funds: data.source_of_funds,
      source_of_funds_other: data.source_of_funds === 'Pendapatan lain/Lainnya' ? data.source_of_funds_other : '',
      source_of_funds_documents: data.dokumen_sumber_dana,
      source_of_funds_document_other: data.dokumen_sumber_dana_lainnya,
      source_of_wealth: data.sumber_kekayaan, source_of_wealth_other: data.sumber_kekayaan_lainnya,
      source_of_wealth_documents: data.dokumen_sumber_kekayaan,
      source_of_wealth_document_other: data.dokumen_sumber_kekayaan_lainnya,
    },
    beneficial_owner: {
      acting_for_other_party: data.bertindak_untuk_pihak_lain, name: data.nama_bo,
      relationship: data.hubungan_bo, identity_number: data.nomor_identitas_bo,
      address: data.alamat_bo, source_of_funds_and_wealth: data.sumber_dana_kekayaan_bo,
      documents: data.dokumen_bo,
    },
  };
}

export default function DataReviewEddEditor({
  reviewId, proposed, version, disabled, role, onChanged,
}: {
  reviewId: string;
  proposed: Record<string, unknown> | null;
  version: number;
  disabled: boolean;
  role: string | null;
  onChanged: () => Promise<void> | void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const initialData = useMemo(() => ({ ...DEFAULT_EDD, ...normalizeFrontDeskEdd(proposed) }), [proposed]);

  async function save(data: EddFormData) {
    setSaving(true);
    setError('');
    try {
      await stageEddDraft(reviewId, buildFrontDeskEddSections(data), version);
      toast.success('Perubahan EDD bagian I–IV disimpan di draft.');
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan EDD draft.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="draft-edd-editor">
      <div className="mb-3"><h2 className="text-sm font-semibold text-slate-800">Enhanced Due Diligence (EDD)</h2><p className="text-xs text-slate-500">Dalam pengkinian data, FrontDesk hanya dapat mengusulkan bagian I sampai IV sesuai kebijakan saat ini.</p></div>
      <EddForm initialData={initialData} canEdit={!disabled} userRole={role} eddCompleted={false} saving={saving} saveError={error} onSaveDraft={save} onComplete={() => undefined} />
    </div>
  );
}
