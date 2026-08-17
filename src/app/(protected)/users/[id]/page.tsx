'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, apiUpload, getRoleFromToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatCif } from '@/lib/utils';
// Watchlist display helpers are shared with the transfer screening UI.
import { formatDateTime, formatMatchScore, isBlockingListType, matchedFieldLabel } from '@/lib/transfers';
import { BUSINESS_DOC_TYPES, businessDocLabel } from '@/lib/business-docs';
import PersonCddFields from '@/components/person-cdd-fields';
import BusinessIdentityForm from '@/components/business-identity-form';
import EddForm, { DEFAULT_EDD, type EddFormData } from '@/components/EddForm';
import WebcamCapture from '@/components/WebcamCapture';
import DataReviewCard from '@/components/DataReviewCard';

type Status = 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUIRED';

type ApplicationDetail = {
  id: number | string;
  /** UUID publik dari backend — identitas teknis sekunder; rute tetap pakai id. */
  public_id?: string | null;
  type: 'INDIVIDUAL' | 'BUSINESS';
  status: Status;
  created_at: string;
  submitted_at?: string | null;
  edd_required?: boolean | null;
  edd_completed?: boolean | null;
  revision_reason?: string | null;
  revision_requested_by?: string | null;
  revision_requested_at?: string | null;
  decision_reason?: string | null;
  // Backend-generated decision/review timestamps (read-only display).
  decided_at?: string | null;
  decision_at?: string | null;
  reviewed_at?: string | null;
  approved_at?: string | null;
  reviewed_by?: string | null;
  decided_by?: string | null;
};

type Person = {
  full_name?: string | null;
  identity_type?: string | null;
  identity_number?: string | null;
  pob?: string | null;
  dob?: string | null;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  occupation?: string | null;
  address_identity?: string | null;
  address_residential?: string | null;
  signature_uri?: string | null;
  cif_no?: string | null;
  cif_relationship_type?: string | null;
  // CDD extended fields
  alias?: string | null;
  ktp_number?: string | null;
  sim_number?: string | null;
  passport_number?: string | null;
  province_code?: string | null;
  province_name?: string | null;
  city_code?: string | null;
  city_name?: string | null;
  district_code?: string | null;
  district_name?: string | null;
  village_code?: string | null;
  village_name?: string | null;
  street_address?: string | null;
  house_number?: string | null;
  rt_rw?: string | null;
  apartment_block?: string | null;
  address_landmark?: string | null;
  industry_category?: string | null;
  company_name?: string | null;
  company_address?: string | null;
  monthly_income_range?: string | null;
  source_of_funds?: string | null;
  business_relationship_purpose?: string | null;
  distribution_channel?: string | null;
  // "Lainnya" free-text companions (backend *_other columns).
  occupation_other?: string | null;
  industry_category_other?: string | null;
  source_of_funds_other?: string | null;
  business_relationship_purpose_other?: string | null;
  wic_transaction_purpose_other?: string | null;
  wic_recipient_relationship_other?: string | null;
  // WIC minimum CDD fields
  wic_transaction_purpose?: string | null;
  wic_recipient_relationship?: string | null;
};

type WatchlistStatus = 'CLEAR' | 'NEAR_MATCH' | 'MATCH' | string;

type Business = {
  legal_name?: string | null;
  legal_form?: string | null;
  incorporation_date?: string | null;
  // Akta dipecah dua (migrasi 0061); deed_number tetap ada untuk data lama.
  deed_number?: string | null;
  deed_establishment_number?: string | null;
  deed_latest_amendment_number?: string | null;
  business_license_number?: string | null;
  nib?: string | null;
  npwp?: string | null;
  company_email?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  business_province_code?: string | null;
  business_province_name?: string | null;
  business_city_code?: string | null;
  business_city_name?: string | null;
  business_district_code?: string | null;
  business_district_name?: string | null;
  business_village_code?: string | null;
  business_village_name?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  business_activity?: string | null;
  cif_no?: string | null;
  // Pengurus Utama / PIC (entity-level)
  pic_name?: string | null;
  pic_position?: string | null;
  pic_identity_number?: string | null;
  pic_identity_type?: string | null;
  // Porsi saham pengurus utama (opsional 0–100)
  director_share_percentage?: number | string | null;
  commissioner_share_percentage?: number | string | null;
  // Screening DTTOT/PPPSPM summary per subject (default CLEAR)
  company_watchlist_status?: WatchlistStatus | null;
  management_watchlist_status?: WatchlistStatus | null;
  shareholder_watchlist_status?: WatchlistStatus | null;
};

type Document = {
  id: number | string;
  doc_type: string;
  file_uri?: string | null;   // actual backend field
  file_url?: string | null;   // legacy fallback
  status?: string | null;
  extracted_json?: { original_name?: string; mime?: string; size?: number } | null;
  original_name?: string | null;  // legacy fallback
  created_at?: string | null;
};

type EddRecord = {
  data?: Partial<EddFormData> | null;
  completed?: boolean | null;
  edd_required?: boolean | null;
  edd_completed?: boolean | null;
  applicant_snapshot?: Record<string, unknown> | null;
  high_risk_reasons?: Record<string, unknown> | null;
  additional_information?: Record<string, unknown> | null;
  beneficial_owner?: Record<string, unknown> | null;
  officer_analysis?: Record<string, unknown> | null;
  compliance_decision?: Record<string, unknown> | null;
  director_decision?: Record<string, unknown> | null;
  internal_checklist?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type RbaUnmappedParameter = {
  parameter?: string | null;
  value?: string | number | null;
  reason?: string | null;
};

type RbaComponentParameter = {
  name?: string | null;
  value?: string | number | null;
  score?: number | null;
  weight?: number | null;
  contribution?: number | null;
  source_sheet?: string | null;
};

type RbaComponent = {
  weight?: number | null;
  score?: number | null;
  contribution?: number | null;
  value?: string | number | null;
  parameters?: RbaComponentParameter[];
};

type RiskRecord = {
  risk_score?: number | null;
  risk_level?: 'LOW' | 'MEDIUM' | 'HIGH' | string | null;
  override_level?: string | null;
  override_reason?: string | null;
  rba_version?: string | null;
  rba_score_v01?: number | null;
  rba_calculation_status?: 'COMPLETE' | 'INCOMPLETE' | string | null;
  rba_unmapped_parameters?: RbaUnmappedParameter[] | null;
  rba_components?: Record<string, RbaComponent> | null;
};

// GET /applications/:id returns { application, person, business, documents, parties, risk, edd }
type DetailResponse = {
  application: ApplicationDetail;
  person?: Person | null;
  business?: Business | null;
  documents: Document[];
  parties: Party[];
  risk?: RiskRecord | null;
  edd?: EddRecord | null;
  screening?: ScreeningHit[] | null;
  watchlist_summary?: WatchlistSummary | null;
};

type Party = {
  id: number | string;
  role: string;
  full_name: string;
  identity_type?: string | null;
  identity_number?: string | null;
  nationality?: string | null;
  dob?: string | null;
  cif_no?: string | null;
  cif_relationship_type?: string | null;
  // Detail pemegang saham & BO (form terbaru)
  ownership_percentage?: number | string | null;
  address?: string | null;
  identity_document_type?: string | null;
  source_of_funds?: string | null;
  source_of_wealth?: string | null;
};

/** One watchlist match recorded for this application (detail API `screening[]`). */
type ScreeningHit = {
  id?: number | string;
  list_type?: string | null;
  input_name?: string | null;
  matched_name?: string | null;
  matched_field?: string | null;
  match_score?: number | string | null;
  unique_id?: string | null;
  subject_type?: string | null;
  subject_ref?: number | string | null;
  watchlist_id?: number | string | null;
  matched_dob?: string | null;
  matched_nationality?: string | null;
  review_status?: string | null;
  /** Backend classification: MATCH / NEAR_MATCH / CLEAR. */
  status?: string | null;
  created_at?: string | null;
};

type WatchlistSummary = {
  has_hit?: boolean | null;
  status?: WatchlistStatus | null;
  list_types?: string[] | null;
  compliance_blocking?: boolean | null;
};

type PrecheckResult = {
  ready?: boolean;
  missing?: string[];
  [key: string]: unknown;
};


// Individual required doc types and labels
const INDIVIDUAL_REQUIRED_DOC_TYPES = [
  'INDIVIDUAL_KTP_PHOTO',
  'INDIVIDUAL_FACE_PHOTO',
  'INDIVIDUAL_FACE_WITH_KTP_PHOTO',
];

const INDIVIDUAL_DOC_LABELS: Record<string, string> = {
  INDIVIDUAL_KTP_PHOTO: 'Foto KTP',
  INDIVIDUAL_FACE_PHOTO: 'Foto Wajah Pengguna',
  INDIVIDUAL_FACE_WITH_KTP_PHOTO: 'Foto Wajah dengan KTP',
};

const WIC_IDENTITY_DOC_ALIASES = [
  'WIC_IDENTITY_DOCUMENT',
  'INDIVIDUAL_KTP_PHOTO',
  'KTP',
  'SIM',
  'PASPOR',
];

const WIC_SIGNATURE_DOC_ALIASES = [
  'WIC_SIGNATURE_BIOMETRIC',
  'WIC_SIGNATURE',
  'SIGNATURE',
  'BIOMETRIC',
];

const WIC_DOC_OPTIONS = [
  { value: 'WIC_IDENTITY_DOCUMENT', label: 'Dokumen Identitas WIC (KTP/SIM/Paspor)', required: true },
  { value: 'WIC_SIGNATURE_BIOMETRIC', label: 'Tanda Tangan / Biometrik WIC', required: true },
  { value: 'WIC_SUPPORTING_DOCUMENT', label: 'Dokumen Pendukung Lainnya', required: false },
];

function getDocStatusInfo(d?: Document) {
  const hasFile = !!(d?.file_uri ?? d?.file_url);
  const uploadedLike =
    d?.status === 'UPLOADED' || d?.status === 'APPROVED' ||
    (d?.status === 'PENDING' && hasFile) ||
    (!d?.status && hasFile);
  const failedLike = d?.status === 'FAILED' || d?.status === 'REJECTED';
  return {
    uploadedLike: !!uploadedLike,
    failedLike: !!failedLike,
    statusLabel: uploadedLike ? 'Berhasil Terupload' : failedLike ? 'Perlu Upload Ulang' : 'Belum Terupload',
    statusCls: uploadedLike
      ? 'bg-emerald-100 text-emerald-700'
      : failedLike
      ? 'bg-red-100 text-red-700'
      : 'bg-slate-100 text-slate-500',
  };
}

function getErrMsg(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

function getCifRelationshipLabel(value?: string | null): string {
  if (value === 'OUR_CUSTOMER') return 'Our Customer';
  if (value === 'BO') return 'Beneficial Owner';
  if (value === 'WIC') return 'WIC';
  return '—';
}

// Watchlist (DTTOT/PPPSPM) screening status badge — CLEAR / NEAR_MATCH / MATCH.
function WatchlistBadge({ status }: { status?: string | null }) {
  const s = status ?? 'CLEAR';
  const map: Record<string, { label: string; cls: string }> = {
    CLEAR: { label: 'Clear', cls: 'bg-emerald-100 text-emerald-700' },
    NEAR_MATCH: { label: 'Near Match', cls: 'bg-amber-100 text-amber-700' },
    MATCH: { label: 'Match', cls: 'bg-red-100 text-red-700' },
  };
  const info = map[s] ?? { label: s, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${info.cls}`}>{info.label}</span>;
}

const PARTY_ROLE_LABELS: Record<string, string> = {
  DIRECTOR: 'Direktur',
  COMMISSIONER: 'Komisaris',
  MANAGER: 'Manajer',
  BO: 'Beneficial Owner',
  AUTHORIZED_REP: 'PIC',
  SHAREHOLDER: 'Pemegang Saham',
};

function partyRoleLabel(role?: string | null): string {
  if (!role) return '—';
  return PARTY_ROLE_LABELS[role] ?? role;
}

const STATUS_COLOR: Record<Status, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  SUBMITTED: 'bg-amber-100 text-amber-700',
  IN_REVIEW: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-emerald-100 text-emerald-700',
  REJECTED: 'bg-red-100 text-red-700',
  REVISION_REQUIRED: 'bg-orange-100 text-orange-700',
};

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="w-40 shrink-0 font-medium text-slate-600">{label}</span>
      <span className="text-slate-800">{value || '—'}</span>
    </div>
  );
}

function getString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function getStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function getBoolean(v: unknown): boolean {
  return typeof v === 'boolean' ? v : false;
}

function hasEddPayload(record?: EddRecord | null): boolean {
  if (!record) return false;
  if (record.data && Object.keys(record.data).length > 0) return true;
  return [
    'applicant_snapshot',
    'high_risk_reasons',
    'additional_information',
    'beneficial_owner',
    'officer_analysis',
    'compliance_decision',
    'director_decision',
    'internal_checklist',
  ].some((key) => {
    const value = record[key];
    return !!value && typeof value === 'object' && Object.keys(value as Record<string, unknown>).length > 0;
  });
}

function normalizeEddRecord(record?: EddRecord | null): Partial<EddFormData> | null {
  if (!record || !hasEddPayload(record)) return null;
  if (record.data && Object.keys(record.data).length > 0) return record.data;

  const applicant = (record.applicant_snapshot ?? {}) as Record<string, unknown>;
  const reasons = (record.high_risk_reasons ?? {}) as Record<string, unknown>;
  const additional = (record.additional_information ?? {}) as Record<string, unknown>;
  const bo = (record.beneficial_owner ?? {}) as Record<string, unknown>;
  const analysis = (record.officer_analysis ?? {}) as Record<string, unknown>;
  const compliance = (record.compliance_decision ?? {}) as Record<string, unknown>;
  const checklist = (record.internal_checklist ?? {}) as Record<string, unknown>;

  return {
    nama_lengkap: getString(applicant.full_name),
    nomor_identitas: getString(applicant.identity_number),
    jenis_identitas: getString(applicant.identity_type),
    alamat_domisili: getString(applicant.domicile_address),
    pekerjaan_jenis_usaha: getString(applicant.occupation_or_business_type),
    nomor_telepon: getString(applicant.phone_number),
    kategori_pengguna: getString(applicant.customer_category),
    nomor_referensi_cdd: getString(applicant.cdd_reference_no),

    karakteristik_pengguna: getStringArray(reasons.customer_characteristics),
    pola_transaksi: getStringArray(reasons.transaction_patterns),
    hasil_screening_checks: getStringArray(reasons.screening_results),
    klarifikasi_tambahan: getStringArray(reasons.additional_clarification_requests),
    catatan_alasan_edd: getString(reasons.summary_notes),

    tujuan_hubungan: getStringArray(additional.business_relationship_purposes),
    tujuan_lainnya: getString(additional.business_relationship_purpose_other),
    sumber_dana: getStringArray(additional.source_of_funds),
    sumber_dana_lainnya: getString(additional.source_of_funds_other),
    source_of_funds: getString(additional.source_of_funds),
    source_of_funds_other: getString(additional.source_of_funds_other),
    business_relationship_purpose: getString(additional.business_relationship_purpose),
    business_relationship_purpose_other: getString(additional.business_relationship_purpose_other),
    dokumen_sumber_dana: getStringArray(additional.source_of_funds_documents),
    dokumen_sumber_dana_lainnya: getString(additional.source_of_funds_document_other),
    sumber_kekayaan: getStringArray(additional.source_of_wealth),
    sumber_kekayaan_lainnya: getString(additional.source_of_wealth_other),
    dokumen_sumber_kekayaan: getStringArray(additional.source_of_wealth_documents),
    dokumen_sumber_kekayaan_lainnya: getString(additional.source_of_wealth_document_other),

    bertindak_untuk_pihak_lain: getBoolean(bo.acting_for_other_party),
    nama_bo: getString(bo.name),
    hubungan_bo: getString(bo.relationship),
    nomor_identitas_bo: getString(bo.identity_number),
    alamat_bo: getString(bo.address),
    sumber_dana_kekayaan_bo: getString(bo.source_of_funds_and_wealth),
    dokumen_bo: getStringArray(bo.documents),

    konsistensi_data: getString(analysis.data_consistency),
    penjelasan_konsistensi: getString(analysis.data_consistency_explanation),
    kewajaran_transaksi: getString(analysis.transaction_reasonableness),
    catatan_kewajaran: getString(analysis.transaction_reasonableness_notes),
    evaluasi_sumber_dana: getString(analysis.source_of_funds_evaluation),
    penjelasan_evaluasi: getString(analysis.source_of_funds_evaluation_explanation),
    risiko_geografis: getString(analysis.geography_risk),
    risiko_produk: getString(analysis.product_risk),
    rangkuman_risiko: getString(analysis.overall_risk_summary),
    rekomendasi_tindak_lanjut: getStringArray(analysis.follow_up_recommendations),

    keputusan_kepatuhan: getString(compliance.decision),
    alasan_keputusan_kepatuhan: getString(compliance.reason),
    nama_pejabat_kepatuhan: getString(compliance.officer_name),
    // Backend auto-generates the decision timestamp; displayed read-only.
    tanggal_kepatuhan: getString(compliance.date ?? compliance.decided_at),

    checklist_kelengkapan: getStringArray(checklist.completion_items),
  };
}

function buildEddPayload(formData: EddFormData, complete: boolean, userRole?: string | null) {
  const payload = {
    complete,
    applicant_snapshot: {
      full_name: formData.nama_lengkap,
      identity_number: formData.nomor_identitas,
      identity_type: formData.jenis_identitas,
      domicile_address: formData.alamat_domisili,
      occupation_or_business_type: formData.pekerjaan_jenis_usaha,
      phone_number: formData.nomor_telepon,
      customer_category: formData.kategori_pengguna,
      cdd_reference_no: formData.nomor_referensi_cdd,
    },
    high_risk_reasons: {
      customer_characteristics: formData.karakteristik_pengguna,
      transaction_patterns: formData.pola_transaksi,
      screening_results: formData.hasil_screening_checks,
      additional_clarification_requests: formData.klarifikasi_tambahan,
      summary_notes: formData.catatan_alasan_edd,
    },
    additional_information: {
      business_relationship_purposes: formData.tujuan_hubungan,
      business_relationship_purpose: formData.business_relationship_purpose,
      business_relationship_purpose_other: formData.business_relationship_purpose === 'Lainnya'
        ? formData.business_relationship_purpose_other
        : '',
      source_of_funds: formData.source_of_funds,
      source_of_funds_other: formData.source_of_funds === 'Pendapatan lain/Lainnya'
        ? formData.source_of_funds_other
        : '',
      source_of_funds_documents: formData.dokumen_sumber_dana,
      source_of_funds_document_other: formData.dokumen_sumber_dana_lainnya,
      source_of_wealth: formData.sumber_kekayaan,
      source_of_wealth_other: formData.sumber_kekayaan_lainnya,
      source_of_wealth_documents: formData.dokumen_sumber_kekayaan,
      source_of_wealth_document_other: formData.dokumen_sumber_kekayaan_lainnya,
    },
    beneficial_owner: {
      acting_for_other_party: formData.bertindak_untuk_pihak_lain,
      name: formData.nama_bo,
      relationship: formData.hubungan_bo,
      identity_number: formData.nomor_identitas_bo,
      address: formData.alamat_bo,
      source_of_funds_and_wealth: formData.sumber_dana_kekayaan_bo,
      documents: formData.dokumen_bo,
    },
    officer_analysis: {
      data_consistency: formData.konsistensi_data,
      data_consistency_explanation: formData.penjelasan_konsistensi,
      transaction_reasonableness: formData.kewajaran_transaksi,
      transaction_reasonableness_notes: formData.catatan_kewajaran,
      source_of_funds_evaluation: formData.evaluasi_sumber_dana,
      source_of_funds_evaluation_explanation: formData.penjelasan_evaluasi,
      geography_risk: formData.risiko_geografis,
      product_risk: formData.risiko_produk,
      overall_risk_summary: formData.rangkuman_risiko,
      follow_up_recommendations: formData.rekomendasi_tindak_lanjut,
    },
    compliance_decision: {
      decision: formData.keputusan_kepatuhan,
      reason: formData.alasan_keputusan_kepatuhan,
      officer_name: formData.nama_pejabat_kepatuhan,
      // Decision timestamp is generated by the backend — not sent from FE.
    },
    internal_checklist: {
      completion_items: formData.checklist_kelengkapan,
      cdd_form_completed: formData.checklist_kelengkapan.includes('FORM_CDD'),
      additional_cdd_completed: formData.checklist_kelengkapan.includes('FORM_CDD_TAMBAHAN'),
      edd_form_completed: formData.checklist_kelengkapan.includes('FORM_EDD'),
      source_of_funds_document_completed: formData.checklist_kelengkapan.includes('DOK_SUMBER_DANA'),
      source_of_wealth_document_completed: formData.checklist_kelengkapan.includes('DOK_SUMBER_KEKAYAAN'),
      beneficial_owner_document_completed: formData.checklist_kelengkapan.includes('DOK_BO'),
      dttot_pppspm_screening_completed: formData.checklist_kelengkapan.includes('HASIL_SCREENING'),
      edd_interview_notes_completed:
        formData.checklist_kelengkapan.includes('NOTULEN_WAWANCARA') ||
        formData.checklist_kelengkapan.includes('NOTULEN_WAWANCARA_EDD'),
      business_location_photo_completed:
        formData.checklist_kelengkapan.includes('FOTO_LOKASI') ||
        formData.checklist_kelengkapan.includes('FOTO_LOKASI_USAHA'),
    },
  };

  const role = userRole ?? '';
  // FrontDesk owns sections I–IV; ComplianceLead owns sections V–VII.
  if (role === 'FrontDesk') {
    return {
      complete,
      applicant_snapshot: payload.applicant_snapshot,
      high_risk_reasons: payload.high_risk_reasons,
      additional_information: payload.additional_information,
      beneficial_owner: payload.beneficial_owner,
    };
  }
  if (role === 'ComplianceLead') {
    return {
      complete,
      officer_analysis: payload.officer_analysis,
      compliance_decision: payload.compliance_decision,
      internal_checklist: payload.internal_checklist,
    };
  }
  return payload;
}

function riskLevelLabel(level?: string | null) {
  if (level === 'LOW') return 'Rendah';
  if (level === 'MEDIUM') return 'Menengah';
  if (level === 'HIGH') return 'Tinggi';
  return level || '—';
}

function riskLevelClass(level?: string | null) {
  if (level === 'LOW') return 'bg-emerald-100 text-emerald-700';
  if (level === 'MEDIUM') return 'bg-amber-100 text-amber-700';
  if (level === 'HIGH') return 'bg-red-100 text-red-700';
  return 'bg-slate-100 text-slate-600';
}

function formatScore(value?: number | null, digits = 2) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—';
  return value.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function RiskScoreCard({ risk }: { risk?: RiskRecord | null }) {
  const effectiveLevel = risk?.override_level || risk?.risk_level || null;
  const isComplete = risk?.rba_calculation_status === 'COMPLETE';
  const components = risk?.rba_components ?? {};
  const componentRows = [
    { key: 'customer', label: 'Customer Risk' },
    { key: 'product', label: 'Product / Layanan' },
    { key: 'geography', label: 'Geografis' },
    { key: 'distribution', label: 'Saluran Distribusi' },
  ]
    .map(({ key, label }) => ({ key, label, component: components[key] }))
    .filter((row) => !!row.component);

  return (
    <div className="rounded-xl border p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Risk Based Approach</p>
          <p className="mt-1 text-sm text-slate-500">Perhitungan risk score berdasarkan RBA V01.</p>
        </div>
        {risk ? (
          <span className={`rounded px-2 py-0.5 text-xs font-semibold ${riskLevelClass(effectiveLevel)}`}>
            {riskLevelLabel(effectiveLevel)}
          </span>
        ) : null}
      </div>

      {!risk ? (
        <p className="text-sm text-slate-500">Risk belum dihitung. Submit aplikasi terlebih dahulu agar screening dan RBA berjalan.</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Status RBA</p>
              <p className={`mt-1 text-sm font-semibold ${isComplete ? 'text-emerald-700' : 'text-amber-700'}`}>
                {risk.rba_calculation_status || '—'}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">RBA Score V01</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{formatScore(risk.rba_score_v01)}</p>
              <p className="text-xs text-slate-400">Skala 1–3</p>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <p className="text-xs text-slate-500">Risk Score</p>
              <p className="mt-1 text-lg font-semibold text-slate-900">{risk.risk_score ?? '—'}</p>
              <p className="text-xs text-slate-400">Skala 0–100</p>
            </div>
          </div>

          {risk.rba_unmapped_parameters && risk.rba_unmapped_parameters.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Parameter RBA belum lengkap</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                {risk.rba_unmapped_parameters.map((item, idx) => (
                  <li key={idx}>
                    <span className="font-medium">{item.parameter || 'Parameter'}</span>
                    {item.value != null && item.value !== '' ? `: ${item.value}` : ''}
                    {item.reason ? ` — ${item.reason}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {componentRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Komponen RBA</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {componentRows.map(({ key, label, component }) => (
                  <div key={key} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className="text-xs text-slate-500">Bobot {formatScore(component?.weight ?? null, 2)}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Score: <span className="font-medium text-slate-700">{formatScore(component?.score ?? null)}</span>
                      {' · '}Kontribusi: <span className="font-medium text-slate-700">{formatScore(component?.contribution ?? null)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const EDD_ADDITIONAL_DOC_TYPE = 'EDD_ADDITIONAL_DOCUMENT';

// "Dokumen Tambahan EDD" — optional multi-file block. Uploads use a single
// doc_type (EDD_ADDITIONAL_DOCUMENT); multiple rows are allowed.
function EddAdditionalDocs({
  appId,
  docs,
  canEdit,
  onView,
  onDelete,
  onReload,
  onCamera,
}: {
  appId: string;
  docs: Document[];
  canEdit: boolean;
  onView: (docId: number | string) => void;
  onDelete: (docId: number | string) => void;
  onReload: () => Promise<void> | void;
  onCamera: (docType: string, instruction: string, prefix: string) => void;
}) {
  const existing = docs.filter((d) => d.doc_type === EDD_ADDITIONAL_DOC_TYPE);
  const [slots, setSlots] = useState(2);
  const [files, setFiles] = useState<Record<number, File | null>>({});
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null);

  async function uploadSlot(slot: number) {
    const file = files[slot];
    if (!file || !appId) return;
    setUploadingSlot(slot);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('doc_type', EDD_ADDITIONAL_DOC_TYPE);
      await apiUpload(`/applications/${appId}/documents/upload`, form);
      setFiles((s) => ({ ...s, [slot]: null }));
      toast.success('Dokumen berhasil diunggah.');
      await onReload();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Upload gagal. Silakan coba lagi.'));
    } finally {
      setUploadingSlot(null);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 space-y-3">
      <div>
        <p className="text-sm font-semibold text-slate-700">Dokumen Tambahan EDD</p>
        <p className="text-xs text-slate-400">Opsional. Lampirkan dokumen pendukung tambahan untuk proses EDD.</p>
      </div>

      {existing.length > 0 ? (
        <ul className="space-y-1.5">
          {existing.map((d) => {
            const filename = d.extracted_json?.original_name ?? d.original_name;
            const { statusLabel, statusCls } = getDocStatusInfo(d);
            return (
              <li key={String(d.id)} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-slate-700">{filename || 'Dokumen Tambahan'}</span>
                <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                <button type="button" onClick={() => onView(d.id)} className="text-kesh-700 underline text-xs hover:text-kesh-600">Lihat</button>
                {canEdit && (
                  <button type="button" onClick={() => onDelete(d.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-xs text-slate-400">Belum ada dokumen tambahan.</p>
      )}

      {canEdit && (
        <div className="space-y-2 border-t pt-3">
          {Array.from({ length: slots }).map((_, slot) => (
            <div key={slot} className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                onChange={(e) => setFiles((s) => ({ ...s, [slot]: e.target.files?.[0] ?? null }))}
                className="text-sm"
              />
              <button
                type="button"
                disabled={!files[slot] || uploadingSlot === slot}
                onClick={() => uploadSlot(slot)}
                className="rounded-md bg-kesh-700 px-3 py-1.5 text-xs text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {uploadingSlot === slot ? 'Mengunggah…' : 'Upload File'}
              </button>
              <button
                type="button"
                onClick={() => onCamera(EDD_ADDITIONAL_DOC_TYPE, 'Ambil foto dokumen tambahan EDD.', `edd-additional-${appId}`)}
                className="rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors"
              >
                Ambil Foto
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSlots((n) => n + 1)}
            className="rounded-md border px-3 py-1.5 text-xs hover:bg-slate-50 transition-colors"
          >
            + Tambah Dokumen
          </button>
        </div>
      )}
    </div>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [risk, setRisk] = useState<RiskRecord | null>(null);
  const [screening, setScreening] = useState<ScreeningHit[]>([]);
  const [watchlistSummary, setWatchlistSummary] = useState<WatchlistSummary | null>(null);
  const [rescreening, setRescreening] = useState(false);
  const [precheck, setPrecheck] = useState<PrecheckResult | null>(null);
  const [eddData, setEddData] = useState<Partial<EddFormData>>({});
  const [eddSaving, setEddSaving] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  // Which reason-requiring decision the input row is collecting for (null = hidden).
  const [pendingDecision, setPendingDecision] = useState<'REJECTED' | 'RETURN_FOR_REVISION' | null>(null);
  // Business identity edit mode (PATCH /applications/:id/business).
  const [editingBusiness, setEditingBusiness] = useState(false);

  // Document upload (DRAFT only)
  const [docType, setDocType] = useState('KTP');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docInputKey, setDocInputKey] = useState(0);

  // Party add (BUSINESS + DRAFT only)
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyRole, setPartyRole] = useState('DIRECTOR');
  const [partyName, setPartyName] = useState('');
  const [partyIdType, setPartyIdType] = useState('KTP');
  const [partyIdNumber, setPartyIdNumber] = useState('');
  const [partyDob, setPartyDob] = useState('');
  const [partyNat, setPartyNat] = useState('Indonesia');
  const [partyPhone, setPartyPhone] = useState('');
  const [partyEmail, setPartyEmail] = useState('');
  const [partyLoading, setPartyLoading] = useState(false);

  // Individual document upload state
  const ktpInputRef = useRef<HTMLInputElement>(null);
  const [ktpUploading, setKtpUploading] = useState(false);
  // Webcam capture target — any document type can be captured via camera.
  type WebcamTarget = { docType: string; instruction: string; filenamePrefix: string };
  const [webcamTarget, setWebcamTarget] = useState<WebcamTarget | null>(null);
  // Generic "Upload File" support for any document card via a single hidden input.
  const fileUploadRef = useRef<HTMLInputElement>(null);
  const [fileUploadDocType, setFileUploadDocType] = useState<string | null>(null);
  const [uploadingDocType, setUploadingDocType] = useState<string | null>(null);

  async function load() {
    if (!id) return;
    setLoading(true);
    setErr('');
    try {
      // Backend returns { application, person, business, documents, parties, risk }
      const resp = await apiFetch<DetailResponse>(`/applications/${id}`);
      const appData = resp.application;
      if (!appData) throw new Error('Data aplikasi tidak ditemukan dalam response');

      const appWithEdd: ApplicationDetail = {
        ...appData,
        edd_required: appData.edd_required ?? resp.edd?.edd_required ?? false,
        edd_completed: appData.edd_completed ?? resp.edd?.edd_completed ?? resp.edd?.completed ?? false,
      };

      setApp(appWithEdd);
      setPerson(resp.person ?? null);
      setBusiness(resp.business ?? null);
      setRisk(resp.risk ?? null);

      setDocs(resp.documents ?? []);
      setParties(resp.parties ?? []);

      // Populate EDD from main response or dedicated endpoint.
      // Backend stores EDD as grouped JSON sections, while EddForm uses a flat shape.
      const eddFromDetail = normalizeEddRecord(resp.edd);
      if (eddFromDetail) setEddData(eddFromDetail);
      else setEddData({});

      if (appWithEdd.edd_required || resp.edd) {
        const eddResp = await apiFetch<EddRecord>(`/applications/${id}/edd`).catch(() => null);
        const eddFromEndpoint = normalizeEddRecord(eddResp);
        if (eddFromEndpoint) setEddData(eddFromEndpoint);
      }

      // Watchlist hits come with the detail response — no extra GET /screening.
      setScreening(Array.isArray(resp.screening) ? resp.screening : []);
      setWatchlistSummary(resp.watchlist_summary ?? null);
    } catch (e: unknown) {
      setErr(getErrMsg(e, 'Gagal memuat data aplikasi'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    setUserRole(getRoleFromToken(token));
  }, []);

  async function saveEdd(formData: EddFormData, complete: boolean) {
    if (!id) return;
    setEddSaving(true);
    try {
      await apiFetch(`/applications/${id}/edd`, {
        method: 'PATCH',
        body: buildEddPayload(formData, complete, userRole),
      });
      toast.success(complete ? 'EDD berhasil dilengkapi.' : 'Draft EDD berhasil disimpan.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menyimpan data. Silakan coba lagi.'));
    } finally {
      setEddSaving(false);
    }
  }

  async function runPrecheck() {
    if (!id) return;
    setActionLoading(true);
    setPrecheck(null);
    try {
      const res = await apiFetch<PrecheckResult>(`/applications/${id}/precheck`);
      setPrecheck(res);
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menyimpan data. Silakan coba lagi.'));
    } finally {
      setActionLoading(false);
    }
  }

  async function submit() {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/applications/${id}/submit`, { method: 'PATCH' });
      toast.success(app?.status === 'REVISION_REQUIRED' ? 'Aplikasi berhasil diajukan ulang.' : 'Aplikasi berhasil disubmit.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal submit aplikasi. Silakan coba lagi.'));
    } finally {
      setActionLoading(false);
    }
  }

  function handleKycDecisionError(e: unknown) {
    const msg = getErrMsg(e, 'Gagal menyimpan data. Silakan coba lagi.');
    const lowerMsg = msg.toLowerCase();
    if (userRole === 'OperationSupervisor' && (msg.includes('403') || lowerMsg.includes('high') || lowerMsg.includes('risk'))) {
      toast.error('KYC/KYB high risk hanya dapat diputuskan oleh Lead Compliance.');
    } else if (userRole === 'ComplianceLead' && (msg.includes('403') || lowerMsg.includes('low') || lowerMsg.includes('medium'))) {
      toast.error('KYC/KYB low/medium risk hanya dapat diputuskan oleh Operation Supervisor.');
    } else {
      toast.error(msg);
    }
  }

  async function approve() {
    if (!id) return;
    setActionLoading(true);
    try {
      await apiFetch(`/applications/${id}/decision`, {
        method: 'PATCH',
        body: { decision: 'APPROVED' },
      });
      toast.success('Aplikasi berhasil disetujui.');
      await load();
    } catch (e: unknown) {
      handleKycDecisionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function submitDecision() {
    if (!id || !pendingDecision) return;
    const isReject = pendingDecision === 'REJECTED';
    if (!rejectReason.trim()) {
      toast.error(isReject ? 'Alasan penolakan wajib diisi.' : 'Alasan perbaikan wajib diisi.');
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/applications/${id}/decision`, {
        method: 'PATCH',
        body: { decision: pendingDecision, reason: rejectReason.trim() },
      });
      toast.success(isReject ? 'Aplikasi berhasil ditolak.' : 'Aplikasi dikembalikan untuk perbaikan.');
      setPendingDecision(null);
      setRejectReason('');
      await load();
    } catch (e: unknown) {
      handleKycDecisionError(e);
    } finally {
      setActionLoading(false);
    }
  }

  async function uploadDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !docFile) return;
    setDocUploading(true);
    try {
      const form = new FormData();
      form.append('file', docFile);
      // Guard the untouched-dropdown case: `docType` defaults to 'KTP', which is
      // meaningless for a Business application and would never satisfy submit.
      const isBusiness = app?.type === 'BUSINESS';
      const effectiveDocType =
        isBusiness && !BUSINESS_DOC_TYPES.some((t) => t.code === docType)
          ? BUSINESS_DOC_TYPES[0].code
          : isWic && !WIC_DOC_OPTIONS.some((opt) => opt.value === docType)
          ? 'WIC_IDENTITY_DOCUMENT'
          : docType;
      form.append('doc_type', effectiveDocType);
      await apiUpload(`/applications/${id}/documents/upload`, form);
      setDocFile(null);
      setDocInputKey((k) => k + 1);
      toast.success('Dokumen berhasil diunggah.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Upload gagal. Silakan coba lagi.'));
    } finally {
      setDocUploading(false);
    }
  }

  async function viewDocument(docId: number | string) {
    if (!id) return;
    // Pre-open without noopener so the window reference stays navigable.
    // noopener/noreferrer on a blank pre-open causes Chrome to return a null
    // or detached window, leaving the tab stuck at about:blank.
    const newTab = window.open('about:blank', '_blank');
    try {
      const resp = await apiFetch<{ signed_url?: string; expires_in?: number }>(
        `/applications/${id}/documents/${docId}/url`
      );
      if (resp?.signed_url) {
        if (newTab) {
          newTab.location.replace(resp.signed_url);
        } else {
          const blocked = !window.open(resp.signed_url, '_blank', 'noopener,noreferrer');
          if (blocked) toast.error('Gagal membuka dokumen. Silakan coba lagi.');
        }
      } else {
        newTab?.close();
        toast.error('Gagal membuka dokumen. Silakan coba lagi.');
      }
    } catch {
      newTab?.close();
      toast.error('Gagal membuka dokumen. Silakan coba lagi.');
    }
  }

  async function deleteDocument(docId: number | string) {
    if (!id) return;
    try {
      await apiFetch(`/applications/${id}/documents/${docId}`, { method: 'DELETE' });
      toast.success('Dokumen berhasil dihapus.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menghapus dokumen. Silakan coba lagi.'));
    }
  }

  async function addParty(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    if (partyIdNumber.length > 16) {
      toast.error('Nomor Identitas maksimal 16 karakter.');
      return;
    }
    setPartyLoading(true);
    try {
      await apiFetch(`/applications/${id}/parties`, {
        method: 'POST',
        body: {
          role: partyRole,
          full_name: partyName,
          identity_type: partyIdType,
          identity_number: partyIdNumber,
          dob: partyDob || null,
          nationality: partyNat || null,
          phone: partyPhone || null,
          email: partyEmail || null,
        },
      });
      setPartyName('');
      setPartyIdNumber('');
      setPartyDob('');
      setPartyPhone('');
      setPartyEmail('');
      setPartyOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menyimpan data. Silakan coba lagi.'));
    } finally {
      setPartyLoading(false);
    }
  }

  async function deleteParty(partyId: number | string) {
    if (!id) return;
    try {
      await apiFetch(`/applications/${id}/parties/${partyId}`, { method: 'DELETE' });
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menyimpan data. Silakan coba lagi.'));
    }
  }

  async function uploadKtpFile(file: File) {
    if (!id) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.error('Format file harus JPG, PNG, atau WebP.');
      if (ktpInputRef.current) ktpInputRef.current.value = '';
      return;
    }
    setKtpUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('doc_type', 'INDIVIDUAL_KTP_PHOTO');
      await apiUpload(`/applications/${id}/documents/upload`, form);
      if (ktpInputRef.current) ktpInputRef.current.value = '';
      toast.success('Dokumen berhasil diunggah.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Upload gagal. Silakan coba lagi.'));
    } finally {
      setKtpUploading(false);
    }
  }

  async function uploadWebcamCapture(file: File) {
    if (!id || !webcamTarget) throw new Error('Upload gagal. Silakan coba lagi.');
    const form = new FormData();
    form.append('file', file);
    form.append('doc_type', webcamTarget.docType);
    try {
      await apiUpload(`/applications/${id}/documents/upload`, form);
      setWebcamTarget(null);
      toast.success('Dokumen berhasil diunggah.');
      await load();
    } catch (e: unknown) {
      throw new Error(getErrMsg(e, 'Upload gagal. Silakan coba lagi.'));
    }
  }

  // Open the shared camera modal for any document type.
  function openCamera(docType: string, instruction: string, filenamePrefix: string) {
    setWebcamTarget({ docType, instruction, filenamePrefix });
  }

  // Trigger the shared hidden file picker for a specific document type.
  function triggerFileUpload(docType: string) {
    setFileUploadDocType(docType);
    if (fileUploadRef.current) {
      fileUploadRef.current.value = '';
      fileUploadRef.current.click();
    }
  }

  // Upload a picked file to the given document type (shared by all cards).
  async function uploadFileForDocType(file: File, docType: string) {
    if (!id) return;
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(file.type)) {
      toast.error('Format file harus JPG, PNG, WebP, atau PDF.');
      return;
    }
    setUploadingDocType(docType);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('doc_type', docType);
      await apiUpload(`/applications/${id}/documents/upload`, form);
      toast.success('Dokumen berhasil diunggah.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Upload gagal. Silakan coba lagi.'));
    } finally {
      setUploadingDocType(null);
    }
  }

  // Manual re-screen — needed when watchlist data was uploaded after submit.
  async function rescreenWatchlist() {
    setRescreening(true);
    try {
      const res = await apiFetch<{ hit_count?: number; status?: string; risk_level?: string }>(
        `/applications/${id}/rescreen-watchlist`,
        { method: 'POST' },
      );
      toast.success(
        `Re-screen selesai — ${res?.hit_count ?? 0} hit (${res?.status ?? '-'}), risk ${res?.risk_level ?? '-'}`,
      );
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menjalankan re-screen watchlist'));
    } finally {
      setRescreening(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Memuat…</p>;
  if (err) return <p className="p-6 text-sm text-red-600">{err}</p>;
  if (!app) return <p className="p-6 text-sm text-slate-500">Data tidak ditemukan.</p>;

  // Write affordances mirror the backend's @Roles, taking the narrowest of the
  // endpoints behind these buttons: PATCH :id/business, PATCH :id/submit and
  // DELETE :id/documents/:docId are all FrontDesk/ComplianceLead only (plus the
  // SystemAdmin/Director guard bypass). BranchAdmin is deliberately excluded —
  // it may upload documents and manage parties but cannot edit the business
  // identity, delete a document or submit, so a BranchAdmin-only edit journey
  // dead-ends in a 403. Finance, Auditor and OperationSupervisor are read-only.
  const canWrite = ['FrontDesk', 'ComplianceLead', 'SystemAdmin', 'Director'].includes(userRole ?? '');
  // DRAFT and REVISION_REQUIRED are the two statuses the backend still accepts
  // edits and a (re)submit for.
  const canSubmit = canWrite && (app.status === 'DRAFT' || app.status === 'REVISION_REQUIRED');
  const canDecide = app.status === 'SUBMITTED' || app.status === 'IN_REVIEW';
  const canManageParties = canSubmit;

  const displayName = app.type === 'INDIVIDUAL' ? person?.full_name : business?.legal_name;

  const cifNo = app.type === 'INDIVIDUAL' ? person?.cif_no : business?.cif_no;
  const isWic = app.type === 'INDIVIDUAL' && person?.cif_relationship_type === 'WIC';
  const displayCifNo = isWic ? 'Tidak diterbitkan (WIC)' : formatCif(cifNo);

  // For INDIVIDUAL submit validation — WIC uses minimum CDD docs,
  // while Our Customer uses full KYC photo docs.
  const uploadedDocTypeSet = new Set(
    docs
      .filter((d) => {
        const hasFile = !!(d.file_uri ?? d.file_url);
        return d.status === 'UPLOADED' || d.status === 'APPROVED' ||
          (d.status === 'PENDING' && hasFile) || (!d.status && hasFile);
      })
      .map((d) => d.doc_type)
  );
  const hasUploadedDoc = (aliases: string[]) => aliases.some((t) => uploadedDocTypeSet.has(t));
  const missingIndivDocs = app.type === 'INDIVIDUAL' && canSubmit
    ? isWic
      ? [
          ...(!hasUploadedDoc(WIC_IDENTITY_DOC_ALIASES) ? ['WIC_IDENTITY_DOCUMENT'] : []),
          ...(!hasUploadedDoc(WIC_SIGNATURE_DOC_ALIASES) ? ['WIC_SIGNATURE_BIOMETRIC'] : []),
        ]
      : INDIVIDUAL_REQUIRED_DOC_TYPES.filter((t) => !uploadedDocTypeSet.has(t))
    : [];

  const effectiveRiskLevel = risk?.override_level || risk?.risk_level || null;
  const isHighRisk = effectiveRiskLevel === 'HIGH';
  const eddRequired = (app.edd_required ?? false) || isHighRisk;
  const eddCompleted = app.edd_completed ?? false;
  const approveBlocked = eddRequired && !eddCompleted;

  // KYC final decision follows risk profiling:
  // LOW/MEDIUM → Operation Supervisor. HIGH → Lead Compliance after EDD complete.
  // Director and SystemAdmin remain full access. Frontline fills EDD for HIGH risk.
  const isLowOrMediumRisk = effectiveRiskLevel === 'LOW' || effectiveRiskLevel === 'MEDIUM';
  const isFullAccessRole = ['SystemAdmin', 'Director'].includes(userRole ?? '');
  const canDecideByRole = isFullAccessRole
    || (userRole === 'OperationSupervisor' && isLowOrMediumRisk)
    || (userRole === 'ComplianceLead' && isHighRisk);

  // Watchlist screening — the backend decides blocking; FE only mirrors it so the
  // Screening section and the RBA card can never contradict each other.
  const complianceBlocking =
    watchlistSummary?.compliance_blocking === true ||
    screening.some((h) => h.status === 'MATCH' && isBlockingListType(h.list_type));
  const pepOnlyHit =
    !complianceBlocking &&
    screening.some((h) => h.status !== 'CLEAR' && String(h.list_type ?? '').toUpperCase() === 'PEP');
  const canRescreen = ['ComplianceLead', 'SystemAdmin', 'Director'].includes(userRole ?? '');

  const canViewRisk = ['SystemAdmin', 'Director', 'ComplianceLead', 'OperationSupervisor', 'FrontDesk', 'Auditor'].includes(userRole ?? '');
  const canEditEdd = ['SystemAdmin', 'Director', 'FrontDesk', 'ComplianceLead'].includes(userRole ?? '');
  const canViewEdd = ['SystemAdmin', 'Director', 'FrontDesk', 'ComplianceLead', 'Auditor'].includes(userRole ?? '');
  const showEddSection = canViewEdd && (eddRequired || Object.keys(eddData).length > 0);

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            {cifNo && (
              <span className="font-mono text-base font-bold text-kesh-700">
                {displayCifNo}
              </span>
            )}
            <h1 className="text-xl font-semibold">{displayName || '—'}</h1>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Aplikasi #{app.id ?? id}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[app.status] ?? 'bg-slate-100 text-slate-700'}`}>
              {{ DRAFT: 'Draft', SUBMITTED: 'Diajukan', IN_REVIEW: 'Dalam Review', APPROVED: 'Disetujui', REJECTED: 'Ditolak', REVISION_REQUIRED: 'Perlu Perbaikan' }[app.status] ?? app.status}
            </span>
            <span className="text-xs text-slate-500">{{ INDIVIDUAL: 'Individu', BUSINESS: 'Perusahaan' }[app.type] ?? app.type}</span>
          </div>
        </div>
        <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700 underline transition-colors">
          Kembali
        </button>
      </div>

      {/* Revision banner */}
      {app.status === 'REVISION_REQUIRED' && (
        <div className="rounded-md border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 space-y-1">
          <p className="font-semibold">
            Aplikasi dikembalikan untuk perbaikan. Silakan perbarui data lalu submit ulang.
          </p>
          {app.revision_reason && (
            <p>Alasan: <span className="font-medium">{app.revision_reason}</span></p>
          )}
          {app.revision_requested_by && (
            <p className="text-xs text-orange-700">Dikembalikan oleh: {app.revision_requested_by}</p>
          )}
          {app.revision_requested_at && (
            <p className="text-xs text-orange-700">
              Tanggal: {new Date(app.revision_requested_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
            </p>
          )}
          {app.type === 'BUSINESS' && canSubmit && (
            <p className="text-xs text-orange-700">
              Gunakan &quot;Ubah Identitas&quot; pada Informasi Identitas Badan Usaha, perbarui dokumen
              dan pihak terkait bila perlu, lalu tekan &quot;Ajukan Ulang&quot;.
            </p>
          )}
        </div>
      )}

      {/* Watchlist sanction banner */}
      {complianceBlocking && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800">
          Customer terindikasi masuk daftar DTTOT/PPPSPM. Aplikasi memerlukan review Compliance.
        </div>
      )}
      {pepOnlyHit && (
        <div role="alert" className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span className="font-semibold">Customer terindikasi masuk daftar PEP.</span>{' '}
          Enhanced Due Diligence (EDD) diperlukan sebelum aplikasi disetujui.
        </div>
      )}

      {/* EDD banner */}
      {eddRequired && !eddCompleted && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold">Application ini memerlukan Enhanced Due Diligence (EDD) sebelum dapat disetujui.</p>
        </div>
      )}
      {eddCompleted && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
          EDD lengkap
        </div>
      )}

      {/* Tindakan */}
      <div className="rounded-xl border p-4 space-y-4">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Tindakan</p>

        {/* Button group — all actions in one unified row */}
        <div className="flex flex-wrap gap-3">
          {canWrite && (
            <button
              onClick={runPrecheck}
              disabled={actionLoading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Pra-Pemeriksaan
            </button>
          )}

          {canSubmit && (
            <button
              onClick={submit}
              disabled={actionLoading}
              className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
            >
              {app.status === 'REVISION_REQUIRED' ? 'Ajukan Ulang' : 'Ajukan'}
            </button>
          )}

          {canDecide && canDecideByRole && (
            <>
              {/* Sanksi aktif memblokir approval di backend — jangan tawarkan tombolnya. */}
              {!complianceBlocking && (
                <button
                  onClick={approve}
                  disabled={actionLoading || approveBlocked}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  Setujui
                </button>
              )}
              <button
                onClick={() => { setPendingDecision('REJECTED'); setRejectReason(''); }}
                disabled={actionLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Tolak…
              </button>
              <button
                onClick={() => { setPendingDecision('RETURN_FOR_REVISION'); setRejectReason(''); }}
                disabled={actionLoading}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
              >
                Kembalikan untuk Revisi…
              </button>
            </>
          )}
        </div>

        {/* Helper text — rendered below button group, not inside row */}
        {canDecide && canDecideByRole && complianceBlocking && (
          <p className="text-xs text-red-700">
            Aplikasi tidak dapat disetujui karena masih terdapat match DTTOT/PPPSPM aktif.
            Pilih Tolak atau selesaikan review watchlist terlebih dahulu.
          </p>
        )}
        {approveBlocked && !complianceBlocking && canDecide && canDecideByRole && (
          <p className="text-xs text-amber-700">
            Approve hanya bisa dilakukan setelah EDD selesai.
          </p>
        )}

        {/* Missing docs warning */}
        {missingIndivDocs.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
            Dokumen wajib belum lengkap:{' '}
            {missingIndivDocs
              .map((t) => INDIVIDUAL_DOC_LABELS[t] ?? WIC_DOC_OPTIONS.find((o) => o.value === t)?.label ?? t)
              .join(', ')}
          </div>
        )}

        {/* Reason input — shared by Tolak and Kembalikan untuk Revisi */}
        {pendingDecision && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-slate-500">
                {pendingDecision === 'REJECTED' ? 'Alasan Penolakan *' : 'Alasan Perbaikan *'}
              </label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={
                  pendingDecision === 'REJECTED'
                    ? 'Tuliskan alasan penolakan...'
                    : 'Tuliskan alasan yang perlu diperbaiki...'
                }
              />
            </div>
            <button
              onClick={submitDecision}
              disabled={actionLoading}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 transition-colors ${
                pendingDecision === 'REJECTED'
                  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              {pendingDecision === 'REJECTED' ? 'Tolak' : 'Kembalikan'}
            </button>
            <button
              onClick={() => { setPendingDecision(null); setRejectReason(''); }}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Batal
            </button>
          </div>
        )}

        {/* Approved notice */}
        {app.status === 'APPROVED' && (
          <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
            <p className="font-medium">Aplikasi telah disetujui.</p>
          </div>
        )}

        {/* Rejected notice */}
        {app.status === 'REJECTED' && (
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <p className="font-medium">Aplikasi telah ditolak.</p>
            {app.decision_reason && <p className="mt-1">Alasan: {app.decision_reason}</p>}
          </div>
        )}

        {/* Decision / review timestamp — backend-generated, read-only */}
        {(app.decided_at || app.decision_at || app.approved_at || app.reviewed_at) && (
          <p className="text-xs text-slate-500">
            Waktu keputusan/review:{' '}
            {new Date(
              (app.decided_at || app.decision_at || app.approved_at || app.reviewed_at) as string,
            ).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
          </p>
        )}

        {/* Precheck result */}
        {precheck && app.status !== 'APPROVED' && (
          <div className={`rounded-lg p-3 text-sm ${precheck.ready === false ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
            {precheck.ready === false ? (
              <>
                <p className="font-medium">Belum siap untuk submit:</p>
                <ul className="list-disc pl-5 mt-1 space-y-0.5">
                  {(precheck.missing ?? []).map((m, i) => <li key={i}>{m}</li>)}
                </ul>
              </>
            ) : (
              <p className="font-medium">Siap untuk submit.</p>
            )}
          </div>
        )}
      </div>

      {canViewRisk && <RiskScoreCard risk={risk} />}

      {/* Pengkinian Data — periodic customer data review (separate from KYC/KYB approval). */}
      <DataReviewCard appId={String(id)} role={userRole} />

      {/* Detail info */}
      {app.type === 'INDIVIDUAL' ? (
        <div className="rounded-xl border p-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Informasi Individu</p>
            <span className={'rounded-full px-2.5 py-1 text-xs font-semibold ' + (isWic ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
              {isWic ? 'WIC' : 'Our Customer'}
            </span>
          </div>
          {isWic && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              WIC tetap tidak diterbitkan CIF dan batas transaksi maksimal Rp100.000.000 tetap berlaku.
            </div>
          )}
          <PersonCddFields
            person={person as unknown as Record<string, unknown> | null}
            customerType={isWic ? 'WIC' : 'OUR_CUSTOMER'}
            disabled={!canSubmit}
            save={(patch) => apiFetch('/applications/' + id, { method: 'PATCH', body: patch })}
            onSaved={async () => {
              toast.success('Data berhasil disimpan.');
              await load();
            }}
          />
          <div className="border-t pt-2 space-y-2">
            <Row label="CIF Pengguna Jasa" value={displayCifNo} />
            <Row label="Jenis Customer" value={isWic ? 'WIC' : 'Our Customer'} />
          </div>
        </div>
      ) : app.type === 'BUSINESS' ? (
        <div className="rounded-xl border p-4 space-y-2">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Informasi Identitas Badan Usaha</p>
            {/* Same gate as the backend: FrontDesk/ComplianceLead (+SystemAdmin/
                Director bypass) on DRAFT or REVISION_REQUIRED. */}
            {canSubmit && (
              <button
                type="button"
                onClick={() => setEditingBusiness((v) => !v)}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
              >
                {editingBusiness ? 'Batal' : 'Ubah Identitas'}
              </button>
            )}
          </div>

          {canSubmit && editingBusiness && business ? (
            <BusinessIdentityForm
              appId={app.id ?? id}
              business={business}
              onCancel={() => setEditingBusiness(false)}
              onSaved={async () => {
                setEditingBusiness(false);
                await load();
              }}
            />
          ) : (
          <>
          <Row label="Nama Badan Usaha" value={business?.legal_name} />
          <Row label="Bentuk Badan Usaha" value={business?.legal_form} />
          {/* Data lama hanya punya deed_number — tampilkan sebagai akta pendirian. */}
          <Row
            label="No. Akta Pendirian"
            value={business?.deed_establishment_number || business?.deed_number}
          />
          <Row label="No. Akta Perubahan Terakhir" value={business?.deed_latest_amendment_number} />
          <Row label="Tanggal Pendirian" value={business?.incorporation_date} />
          <Row label="Nomor Izin Usaha (NIB/OSS/SIUP)" value={business?.business_license_number || business?.nib} />
          <Row label="NPWP Badan Usaha" value={business?.npwp} />
          <Row label="Bidang Usaha" value={business?.business_activity} />
          {/* Baris lama tanpa kolom wilayah jatuh ke "—" lewat Row. */}
          <Row label="Alamat" value={business?.address_line} />
          <Row label="Provinsi" value={business?.business_province_name || business?.province} />
          <Row label="Kota / Kabupaten" value={business?.business_city_name || business?.city} />
          <Row label="Kecamatan" value={business?.business_district_name} />
          <Row label="Kelurahan / Desa" value={business?.business_village_name} />
          <Row label="Kode Pos" value={business?.postal_code} />
          <Row label="Nomor Telepon Perusahaan" value={business?.phone} />
          <Row label="Email Perusahaan" value={business?.company_email} />
          <Row label="CIF Badan Hukum" value={formatCif(business?.cif_no)} />

          <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2 mt-4">Pengurus Utama / PIC</p>
          <Row label="Nama Pengurus Utama / PIC" value={business?.pic_name} />
          <Row label="Jabatan" value={business?.pic_position} />
          <Row label="Nomor Identitas" value={business?.pic_identity_number} />
          <Row label="Jenis Identitas" value={business?.pic_identity_type} />
          <Row
            label="Porsi Saham Direktur Utama"
            value={business?.director_share_percentage != null && business?.director_share_percentage !== ''
              ? `${business.director_share_percentage}%`
              : null}
          />
          <Row
            label="Porsi Saham Komisaris"
            value={business?.commissioner_share_percentage != null && business?.commissioner_share_percentage !== ''
              ? `${business.commissioner_share_percentage}%`
              : null}
          />

          </>
          )}

          {/* Screening summary stays visible while editing — it is read-only. */}
          <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2 mt-4">Screening DTTOT / PPPSPM</p>
          <div className="flex flex-wrap gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Perusahaan</span>
              <WatchlistBadge status={business?.company_watchlist_status} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Pengurus</span>
              <WatchlistBadge status={business?.management_watchlist_status} />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-40 shrink-0 font-medium text-slate-600">Pemegang Saham</span>
              <WatchlistBadge status={business?.shareholder_watchlist_status} />
            </div>
          </div>
        </div>
      ) : null}

      {/* Documents */}
      {app.type === 'INDIVIDUAL' ? (
        <div className="rounded-xl border p-4 space-y-4">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Dokumen</p>

          {isWic ? (
            <>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                Dokumen WIC mengikuti format CDD Walk-In Customer: dokumen identitas dan tanda tangan/biometrik. Foto wajah dan foto wajah dengan KTP tidak diwajibkan untuk WIC.
              </div>

              <div className="space-y-3">
                {WIC_DOC_OPTIONS.map((opt) => {
                  const aliases = opt.value === 'WIC_IDENTITY_DOCUMENT'
                    ? WIC_IDENTITY_DOC_ALIASES
                    : opt.value === 'WIC_SIGNATURE_BIOMETRIC'
                      ? WIC_SIGNATURE_DOC_ALIASES
                      : [opt.value];
                  const doc = docs.find((d) => aliases.includes(d.doc_type));
                  const { uploadedLike, statusLabel, statusCls } = getDocStatusInfo(doc);
                  const filename = doc?.extracted_json?.original_name ?? doc?.original_name;
                  return (
                    <div key={opt.value} className="rounded-lg border p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">
                          {opt.label} {opt.required && <span className="text-red-500">*</span>}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{opt.value}</p>
                        {filename && <p className="mt-0.5 text-xs text-slate-500 truncate">{filename}</p>}
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                      {doc && (
                        <button type="button" onClick={() => viewDocument(doc.id)} className="text-xs text-kesh-700 underline hover:text-kesh-600">Lihat</button>
                      )}
                      {canSubmit && (
                        <>
                          <button
                            type="button"
                            disabled={uploadingDocType === opt.value}
                            onClick={() => triggerFileUpload(opt.value)}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                          >
                            {uploadingDocType === opt.value ? 'Mengunggah…' : 'Upload File'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openCamera(opt.value, `Ambil foto untuk ${opt.label}.`, `wic-${opt.value.toLowerCase()}-${id}`)}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
                          >
                            {uploadedLike ? 'Ambil Ulang' : 'Ambil Foto'}
                          </button>
                          {doc && (
                            <button type="button" onClick={() => deleteDocument(doc.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>

              {canSubmit && (
                <form onSubmit={uploadDocument} className="border-t pt-3 space-y-2">
                  <p className="text-xs font-medium text-slate-600">Upload Dokumen WIC / Pendukung</p>
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Tipe</label>
                      <select
                        value={WIC_DOC_OPTIONS.some((o) => o.value === docType) ? docType : 'WIC_IDENTITY_DOCUMENT'}
                        onChange={(e) => setDocType(e.target.value)}
                        className="rounded-md border bg-white px-2 py-1.5 text-sm"
                      >
                        {WIC_DOC_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">File *</label>
                      <input
                        key={docInputKey}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf"
                        required
                        onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={docUploading || !docFile}
                      className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
                    >
                      {docUploading ? 'Mengunggah…' : 'Unggah'}
                    </button>
                  </div>
                </form>
              )}

              {docs.filter((d) => ![
                ...WIC_IDENTITY_DOC_ALIASES,
                ...WIC_SIGNATURE_DOC_ALIASES,
                'WIC_SUPPORTING_DOCUMENT',
                EDD_ADDITIONAL_DOC_TYPE,
              ].includes(d.doc_type)).length > 0 && (
                <div className="pt-2 border-t space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Dokumen Lainnya</p>
                  <ul className="space-y-1.5">
                    {docs
                      .filter((d) => ![
                        ...WIC_IDENTITY_DOC_ALIASES,
                        ...WIC_SIGNATURE_DOC_ALIASES,
                        'WIC_SUPPORTING_DOCUMENT',
                        EDD_ADDITIONAL_DOC_TYPE,
                      ].includes(d.doc_type))
                      .map((d) => {
                        const filename = d.extracted_json?.original_name ?? d.original_name;
                        const { statusLabel, statusCls } = getDocStatusInfo(d);
                        return (
                          <li key={String(d.id)} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium text-slate-700">{d.doc_type}</span>
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                            {filename && <span className="text-slate-500">— {filename}</span>}
                            <button type="button" onClick={() => viewDocument(d.id)} className="text-kesh-700 underline text-xs hover:text-kesh-600">Lihat</button>
                            {canSubmit && (
                              <button type="button" onClick={() => deleteDocument(d.id)} className="ml-auto text-xs text-red-600 hover:underline">Hapus</button>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Hidden KTP file input */}
              <input
                ref={ktpInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadKtpFile(f); }}
              />

              <div className="space-y-3">
                {/* 1. Foto KTP */}
                {(() => {
                  const doc = docs.find((d) => d.doc_type === 'INDIVIDUAL_KTP_PHOTO');
                  const { uploadedLike, statusLabel, statusCls } = getDocStatusInfo(doc);
                  return (
                    <div className="rounded-lg border p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Foto KTP</p>
                        <p className="text-xs text-slate-400 font-mono">INDIVIDUAL_KTP_PHOTO</p>
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                      {doc && (
                        <button type="button" onClick={() => viewDocument(doc.id)} className="text-xs text-kesh-700 underline hover:text-kesh-600">Lihat</button>
                      )}
                      {canSubmit && (
                        <>
                          <button
                            type="button"
                            disabled={ktpUploading}
                            onClick={() => ktpInputRef.current?.click()}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                          >
                            {ktpUploading ? 'Mengunggah…' : 'Upload File'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openCamera('INDIVIDUAL_KTP_PHOTO', 'Pastikan KTP terlihat jelas dan seluruh bagian masuk dalam bingkai.', `individual-ktp-photo-${id}`)}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
                          >
                            {uploadedLike ? 'Ambil Ulang' : 'Ambil Foto'}
                          </button>
                          {doc && (
                            <button type="button" onClick={() => deleteDocument(doc.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* 2. Foto Wajah Pengguna */}
                {(() => {
                  const doc = docs.find((d) => d.doc_type === 'INDIVIDUAL_FACE_PHOTO');
                  const { uploadedLike, statusLabel, statusCls } = getDocStatusInfo(doc);
                  return (
                    <div className="rounded-lg border p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Foto Wajah Pengguna</p>
                        <p className="text-xs text-slate-400 font-mono">INDIVIDUAL_FACE_PHOTO</p>
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                      {doc && (
                        <button type="button" onClick={() => viewDocument(doc.id)} className="text-xs text-kesh-700 underline hover:text-kesh-600">Lihat</button>
                      )}
                      {canSubmit && (
                        <>
                          <button
                            type="button"
                            disabled={uploadingDocType === 'INDIVIDUAL_FACE_PHOTO'}
                            onClick={() => triggerFileUpload('INDIVIDUAL_FACE_PHOTO')}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                          >
                            {uploadingDocType === 'INDIVIDUAL_FACE_PHOTO' ? 'Mengunggah…' : 'Upload File'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openCamera('INDIVIDUAL_FACE_PHOTO', 'Pastikan wajah pengguna terlihat jelas menghadap kamera.', `individual-face-photo-${id}`)}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
                          >
                            {uploadedLike ? 'Ambil Ulang' : 'Ambil Foto'}
                          </button>
                          {doc && (
                            <button type="button" onClick={() => deleteDocument(doc.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* 3. Foto Wajah dengan KTP */}
                {(() => {
                  const doc = docs.find((d) => d.doc_type === 'INDIVIDUAL_FACE_WITH_KTP_PHOTO');
                  const { uploadedLike, statusLabel, statusCls } = getDocStatusInfo(doc);
                  return (
                    <div className="rounded-lg border p-3 flex flex-wrap items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700">Foto Wajah dengan KTP</p>
                        <p className="text-xs text-slate-400 font-mono">INDIVIDUAL_FACE_WITH_KTP_PHOTO</p>
                      </div>
                      <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                      {doc && (
                        <button type="button" onClick={() => viewDocument(doc.id)} className="text-xs text-kesh-700 underline hover:text-kesh-600">Lihat</button>
                      )}
                      {canSubmit && (
                        <>
                          <button
                            type="button"
                            disabled={uploadingDocType === 'INDIVIDUAL_FACE_WITH_KTP_PHOTO'}
                            onClick={() => triggerFileUpload('INDIVIDUAL_FACE_WITH_KTP_PHOTO')}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
                          >
                            {uploadingDocType === 'INDIVIDUAL_FACE_WITH_KTP_PHOTO' ? 'Mengunggah…' : 'Upload File'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openCamera('INDIVIDUAL_FACE_WITH_KTP_PHOTO', 'Pastikan wajah pengguna terlihat jelas dan KTP dipegang di dekat wajah.', `individual-face-with-ktp-${id}`)}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
                          >
                            {uploadedLike ? 'Ambil Ulang' : 'Ambil Foto'}
                          </button>
                          {doc && (
                            <button type="button" onClick={() => deleteDocument(doc.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Extra docs outside the 3 required types (legacy / admin uploads) */}
              {docs.filter((d) => !INDIVIDUAL_REQUIRED_DOC_TYPES.includes(d.doc_type) && d.doc_type !== EDD_ADDITIONAL_DOC_TYPE).length > 0 && (
                <div className="pt-2 border-t space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Dokumen Lainnya</p>
                  <ul className="space-y-1.5">
                    {docs
                      .filter((d) => !INDIVIDUAL_REQUIRED_DOC_TYPES.includes(d.doc_type) && d.doc_type !== EDD_ADDITIONAL_DOC_TYPE)
                      .map((d) => {
                        const filename = d.extracted_json?.original_name ?? d.original_name;
                        const { statusLabel, statusCls } = getDocStatusInfo(d);
                        return (
                          <li key={String(d.id)} className="flex flex-wrap items-center gap-2 text-sm">
                            <span className="font-medium text-slate-700">{d.doc_type}</span>
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>{statusLabel}</span>
                            {filename && <span className="text-slate-500">— {filename}</span>}
                            <button type="button" onClick={() => viewDocument(d.id)} className="text-kesh-700 underline text-xs hover:text-kesh-600">Lihat</button>
                            {canSubmit && (
                              <button type="button" onClick={() => deleteDocument(d.id)} className="ml-auto text-xs text-red-600 hover:underline">Hapus</button>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        /* ── Business: existing generic document upload section ─────────── */
        <div className="rounded-xl border p-4 space-y-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Dokumen</p>

          {docs.filter((d) => d.doc_type !== EDD_ADDITIONAL_DOC_TYPE).length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada dokumen.</p>
          ) : (
            <ul className="space-y-1.5">
              {docs.filter((d) => d.doc_type !== EDD_ADDITIONAL_DOC_TYPE).map((d) => {
                const filename = d.extracted_json?.original_name ?? d.original_name;
                const { statusLabel, statusCls } = getDocStatusInfo(d);
                return (
                  <li key={String(d.id)} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-700">{businessDocLabel(d.doc_type)}</span>
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${statusCls}`}>
                      {statusLabel}
                    </span>
                    {filename && <span className="text-slate-500">— {filename}</span>}
                    <button
                      type="button"
                      onClick={() => viewDocument(d.id)}
                      className="text-kesh-700 underline text-xs hover:text-kesh-600"
                    >
                      Lihat
                    </button>
                    {canSubmit && (
                      <button
                        type="button"
                        onClick={() => deleteDocument(d.id)}
                        className="ml-auto text-xs text-red-600 hover:underline"
                      >
                        Hapus
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {/* Upload form — DRAFT only */}
          {canSubmit && (
            <form onSubmit={uploadDocument} className="border-t pt-3 space-y-2">
              <p className="text-xs font-medium text-slate-600">Upload Dokumen Baru</p>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Tipe</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    {/* Tipe dokumen KYB sesuai validasi submit backend — daftar
                        legacy (AKTA_PENDIRIAN/NIB_SIUP/…) tidak punya padanan
                        untuk dokumen pengurus/pemegang saham/BO. */}
                    {BUSINESS_DOC_TYPES.map((t) => (
                      <option key={t.code} value={t.code}>{t.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">File *</label>
                  <input
                    key={docInputKey}
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    required
                    onChange={(e) => setDocFile(e.target.files?.[0] ?? null)}
                    className="text-sm"
                  />
                </div>
                <button
                  type="submit"
                  disabled={docUploading || !docFile}
                  className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
                >
                  {docUploading ? 'Mengunggah…' : 'Upload File'}
                </button>
                <button
                  type="button"
                  onClick={() => openCamera(docType, `Ambil foto untuk dokumen ${docType}.`, `business-${docType.toLowerCase()}-${id}`)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 transition-colors"
                >
                  Ambil Foto
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Parties (Business only) */}
      {app.type === 'BUSINESS' && (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Pihak Terkait</p>
            {canManageParties && (
              <button
                type="button"
                onClick={() => setPartyOpen((v) => !v)}
                className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
              >
                {partyOpen ? 'Batal' : '+ Tambah Pihak'}
              </button>
            )}
          </div>

          {/* Add party form — DRAFT only */}
          {canManageParties && partyOpen && (
            <form onSubmit={addParty} className="rounded-lg border bg-slate-50 p-3 space-y-3">
              <p className="text-xs font-semibold text-slate-700">Tambah Pihak Terkait</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Role *</label>
                  <select
                    value={partyRole}
                    onChange={(e) => setPartyRole(e.target.value)}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    {['DIRECTOR', 'COMMISSIONER', 'MANAGER', 'SHAREHOLDER', 'BO', 'AUTHORIZED_REP'].map((r) => (
                      <option key={r} value={r}>{partyRoleLabel(r)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nama Lengkap *</label>
                  <input
                    required
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Jenis Identitas</label>
                  <select
                    value={partyIdType}
                    onChange={(e) => setPartyIdType(e.target.value)}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    {['KTP', 'SIM', 'PASPOR', 'LAINNYA'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nomor Identitas</label>
                  <input
                    value={partyIdNumber}
                    onChange={(e) => setPartyIdNumber(e.target.value)}
                    maxLength={16}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                  <p className="text-xs text-slate-400">Maksimal 16 karakter.</p>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Tanggal Lahir</label>
                  <input
                    type="date"
                    value={partyDob}
                    onChange={(e) => setPartyDob(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Kewarganegaraan</label>
                  <input
                    value={partyNat}
                    onChange={(e) => setPartyNat(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Telepon</label>
                  <input
                    value={partyPhone}
                    onChange={(e) => setPartyPhone(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Email</label>
                  <input
                    type="email"
                    value={partyEmail}
                    onChange={(e) => setPartyEmail(e.target.value)}
                    className="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPartyOpen(false)}
                  className="rounded-md border px-3 py-1.5 text-sm hover:bg-white"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={partyLoading}
                  className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
                >
                  {partyLoading ? 'Menyimpan…' : 'Simpan'}
                </button>
              </div>
            </form>
          )}

          {parties.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada pihak terkait.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-slate-500">
                    <th className="py-1 pr-4">Nama</th>
                    <th className="py-1 pr-4">Peran</th>
                    <th className="py-1 pr-4">Identitas</th>
                    <th className="py-1 pr-4">Kepemilikan</th>
                    <th className="py-1 pr-4">CIF</th>
                    <th className="py-1">Parameter CIF</th>
                    {canManageParties && <th className="py-1" />}
                  </tr>
                </thead>
                <tbody>
                  {parties.map((p) => {
                    const isOwner = p.role === 'BO' || p.role === 'SHAREHOLDER';
                    return (
                    <tr key={String(p.id)} className="border-b last:border-0 align-top">
                      <td className="py-1.5 pr-4 font-medium">
                        {p.full_name}
                        {isOwner && (p.address || p.source_of_funds || p.source_of_wealth) && (
                          <div className="text-xs font-normal text-slate-400 mt-0.5 space-y-0.5">
                            {p.address && <div>Alamat: {p.address}</div>}
                            {p.source_of_funds && <div>Sumber Dana: {p.source_of_funds}</div>}
                            {p.source_of_wealth && <div>Sumber Kekayaan: {p.source_of_wealth}</div>}
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-4">{partyRoleLabel(p.role)}</td>
                      <td className="py-1.5 pr-4 text-slate-600">
                        {(p.identity_document_type || p.identity_type) && p.identity_number
                          ? `${p.identity_document_type || p.identity_type}: ${p.identity_number}`
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-slate-600">
                        {p.ownership_percentage != null && p.ownership_percentage !== ''
                          ? `${p.ownership_percentage}%`
                          : '—'}
                      </td>
                      <td className="py-1.5 pr-4 text-slate-600">{formatCif(p.cif_no)}</td>
                      <td className="py-1.5">{getCifRelationshipLabel(p.cif_relationship_type)}</td>
                      {canManageParties && (
                        <td className="py-1.5 text-right">
                          <button
                            onClick={() => deleteParty(p.id)}
                            className="text-xs text-red-600 hover:underline"
                          >
                            Hapus
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* EDD — Enhanced Due Diligence */}
      {showEddSection && canViewEdd && (
        <div className="rounded-xl border border-red-200 bg-red-50/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Enhanced Due Diligence (EDD)</p>
              {eddCompleted && (
                <span className="mt-1 inline-block rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">EDD Lengkap</span>
              )}
            </div>
            {!canEditEdd && (
              <span className="text-xs text-slate-500 italic">Hanya dapat dilihat</span>
            )}
          </div>

          <EddForm
            initialData={{ ...DEFAULT_EDD, ...eddData }}
            canEdit={canEditEdd}
            userRole={userRole}
            eddCompleted={eddCompleted}
            saving={eddSaving}
            saveError=""
            onSaveDraft={(data) => saveEdd(data, false)}
            onComplete={(data) => saveEdd(data, true)}
          />

          <EddAdditionalDocs
            appId={String(id)}
            docs={docs}
            canEdit={canEditEdd}
            onView={viewDocument}
            onDelete={deleteDocument}
            onReload={load}
            onCamera={openCamera}
          />
        </div>
      )}

      {/* Screening */}
      {app.status === 'DRAFT' ? (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Screening</p>
          <p className="text-sm text-slate-500">
            Screening belum dijalankan. Submit aplikasi terlebih dahulu.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Screening</p>
              <div className="mt-1 flex items-center gap-2">
                <WatchlistBadge status={watchlistSummary?.status ?? 'CLEAR'} />
                {(watchlistSummary?.list_types ?? []).map((t) => (
                  <span
                    key={t}
                    className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                      isBlockingListType(t) ? 'bg-red-600 text-white' : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            {canRescreen && (
              <button
                type="button"
                onClick={rescreenWatchlist}
                disabled={rescreening}
                className="shrink-0 rounded-md border border-kesh-600 px-3 py-1.5 text-xs font-medium text-kesh-700 hover:bg-kesh-50 disabled:opacity-50"
              >
                {rescreening ? 'Memproses…' : 'Re-screen Watchlist'}
              </button>
            )}
          </div>

          {screening.length > 0 ? (
            <>
              <p className="text-xs text-slate-500">
                {screening.length} entri watchlist cocok dengan data customer.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="bg-slate-50 text-slate-600">
                    <tr>
                      <th className="border px-2 py-1 text-left">Jenis List</th>
                      <th className="border px-2 py-1 text-left">Input Name</th>
                      <th className="border px-2 py-1 text-left">Matched Name</th>
                      <th className="border px-2 py-1 text-left">Matched Field</th>
                      <th className="border px-2 py-1 text-left">Match Score</th>
                      <th className="border px-2 py-1 text-left">Unique ID</th>
                      <th className="border px-2 py-1 text-left">Subject Type</th>
                      <th className="border px-2 py-1 text-left">Subject Ref</th>
                      <th className="border px-2 py-1 text-left">DOB</th>
                      <th className="border px-2 py-1 text-left">Nationality</th>
                      <th className="border px-2 py-1 text-left">Review Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {screening.map((h, i) => (
                      <tr key={h.id ?? `${h.unique_id ?? 'hit'}-${i}`}>
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
                        <td className="border px-2 py-1">{h.subject_ref ?? '-'}</td>
                        <td className="border px-2 py-1">{h.matched_dob ? String(h.matched_dob).slice(0, 10) : '-'}</td>
                        <td className="border px-2 py-1">{h.matched_nationality ?? '-'}</td>
                        <td className="border px-2 py-1">
                          {h.review_status ?? '-'}
                          {h.status && h.status !== h.review_status ? ` (${h.status})` : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-400">
                Terakhir dicek: {formatDateTime(screening[0]?.created_at)}
              </p>
            </>
          ) : (
            <p className="text-sm text-emerald-700">Tidak ada match pada watchlist.</p>
          )}
        </div>
      )}

      {/* Shared hidden file input — used by every "Upload File" action. */}
      <input
        ref={fileUploadRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f && fileUploadDocType) uploadFileForDocType(f, fileUploadDocType);
        }}
      />

      {/* Webcam capture modal — any document type */}
      {webcamTarget && (
        <WebcamCapture
          instruction={webcamTarget.instruction}
          filenamePrefix={webcamTarget.filenamePrefix}
          onCapture={uploadWebcamCapture}
          onClose={() => setWebcamTarget(null)}
        />
      )}
    </div>
  );
}
