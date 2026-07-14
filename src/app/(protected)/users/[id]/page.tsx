'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, apiUpload, getRoleFromToken } from '@/lib/api';
import { toast } from '@/lib/toast';
import { formatCif, isLainnya } from '@/lib/utils';
import LainnyaField from '@/components/lainnya-field';
import EddForm, { DEFAULT_EDD, type EddFormData } from '@/components/EddForm';
import WebcamCapture from '@/components/WebcamCapture';

type Status = 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

type ApplicationDetail = {
  id: number | string;
  type: 'INDIVIDUAL' | 'BUSINESS';
  status: Status;
  created_at: string;
  submitted_at?: string | null;
  edd_required?: boolean | null;
  edd_completed?: boolean | null;
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
  incorporation_place?: string | null;
  incorporation_date?: string | null;
  deed_number?: string | null;
  business_license_number?: string | null;
  nib?: string | null;
  npwp?: string | null;
  company_email?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  phone?: string | null;
  industry_code?: string | null;
  business_activity?: string | null;
  cif_no?: string | null;
  // Pengurus Utama / PIC (entity-level)
  pic_name?: string | null;
  pic_position?: string | null;
  pic_identity_number?: string | null;
  pic_identity_type?: string | null;
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

type ScreeningResult = {
  status?: string;
  checked_at?: string | null;
  matches?: { name: string; list_type: string; match_score?: number }[];
  [key: string]: unknown;
};

type PrecheckResult = {
  ready?: boolean;
  missing?: string[];
  [key: string]: unknown;
};

type RefItem = { code: string; name: string };

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
  const director = (record.director_decision ?? {}) as Record<string, unknown>;
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
    tanggal_kepatuhan: getString(compliance.date),

    keputusan_direktur: getString(director.decision),
    alasan_keputusan_direktur: getString(director.reason),
    nama_direktur: getString(director.director_name),
    tanggal_direktur: getString(director.date),

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
      date: formData.tanggal_kepatuhan,
    },
    director_decision: {
      decision: formData.keputusan_direktur,
      reason: formData.alasan_keputusan_direktur,
      director_name: formData.nama_direktur,
      date: formData.tanggal_direktur,
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
  if (role === 'FrontDesk') {
    return {
      complete,
      applicant_snapshot: payload.applicant_snapshot,
      high_risk_reasons: payload.high_risk_reasons,
      additional_information: payload.additional_information,
    };
  }
  if (role === 'ComplianceLead') {
    return {
      complete,
      beneficial_owner: payload.beneficial_owner,
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

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [app, setApp] = useState<ApplicationDetail | null>(null);
  const [person, setPerson] = useState<Person | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [parties, setParties] = useState<Party[]>([]);
  const [risk, setRisk] = useState<RiskRecord | null>(null);
  const [screening, setScreening] = useState<ScreeningResult | null>(null);
  const [precheck, setPrecheck] = useState<PrecheckResult | null>(null);
  const [eddData, setEddData] = useState<Partial<EddFormData>>({});
  const [eddSaving, setEddSaving] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

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
  type WebcamTarget = 'INDIVIDUAL_FACE_PHOTO' | 'INDIVIDUAL_FACE_WITH_KTP_PHOTO';
  const [webcamTarget, setWebcamTarget] = useState<WebcamTarget | null>(null);

  // Individual CDD extended form state
  const [cddAlias, setCddAlias] = useState('');
  const [cddKtp, setCddKtp] = useState('');
  const [cddKtpErr, setCddKtpErr] = useState('');
  const [cddSim, setCddSim] = useState('');
  const [cddSimErr, setCddSimErr] = useState('');
  const [cddPassport, setCddPassport] = useState('');
  const [cddPassportErr, setCddPassportErr] = useState('');
  const [cddNationality, setCddNationality] = useState('Indonesia');
  const [cddProvinceCode, setCddProvinceCode] = useState('');
  const [cddCityCode, setCddCityCode] = useState('');
  const [cddDistrictCode, setCddDistrictCode] = useState('');
  const [cddVillageCode, setCddVillageCode] = useState('');
  const [cddStreet, setCddStreet] = useState('');
  const [cddHouseNo, setCddHouseNo] = useState('');
  const [cddRtRw, setCddRtRw] = useState('');
  const [cddApartment, setCddApartment] = useState('');
  const [cddLandmark, setCddLandmark] = useState('');
  const [cddIndustry, setCddIndustry] = useState('');
  const [cddIndustryOther, setCddIndustryOther] = useState('');
  const [cddCompanyName, setCddCompanyName] = useState('');
  const [cddCompanyAddress, setCddCompanyAddress] = useState('');
  const [cddIncomeRange, setCddIncomeRange] = useState('');
  const [cddOccupation, setCddOccupation] = useState('');
  const [cddOccupationOther, setCddOccupationOther] = useState('');
  const [cddCifRelationshipType, setCddCifRelationshipType] = useState<'OUR_CUSTOMER' | 'WIC'>('OUR_CUSTOMER');
  const [cddSourceOfFunds, setCddSourceOfFunds] = useState('');
  const [cddSourceOfFundsOther, setCddSourceOfFundsOther] = useState('');
  const [cddBusinessPurpose, setCddBusinessPurpose] = useState('');
  const [cddBusinessPurposeOther, setCddBusinessPurposeOther] = useState('');
  const [cddDistributionChannel, setCddDistributionChannel] = useState('');
  const [cddSaving, setCddSaving] = useState(false);

  // WIC minimum CDD form state (SOP Walk-In Customer)
  const [wicFullName, setWicFullName] = useState('');
  const [wicIdentityType, setWicIdentityType] = useState('KTP');
  const [wicIdentityNumber, setWicIdentityNumber] = useState('');
  const [wicAddressIdentity, setWicAddressIdentity] = useState('');
  const [wicPob, setWicPob] = useState('');
  const [wicDob, setWicDob] = useState('');
  const [wicTransactionPurpose, setWicTransactionPurpose] = useState('');
  const [wicRecipientRelationship, setWicRecipientRelationship] = useState('');

  // Reference data for dropdowns
  const [provinces, setProvinces] = useState<RefItem[]>([]);
  const [regencies, setRegencies] = useState<RefItem[]>([]);
  const [districts, setDistricts] = useState<RefItem[]>([]);
  const [villages, setVillages] = useState<RefItem[]>([]);
  const [nationalities, setNationalities] = useState<RefItem[]>([]);
  const [industryCategories, setIndustryCategories] = useState<RefItem[]>([]);
  const [incomeRanges, setIncomeRanges] = useState<RefItem[]>([]);
  const [occupations, setOccupations] = useState<RefItem[]>([]);
  const [sourceOfFundsOptions, setSourceOfFundsOptions] = useState<RefItem[]>([]);
  const [businessPurposeOptions, setBusinessPurposeOptions] = useState<RefItem[]>([]);
  const [distributionOptions, setDistributionOptions] = useState<RefItem[]>([]);
  const [regenciesLoading, setRegenciesLoading] = useState(false);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [villagesLoading, setVillagesLoading] = useState(false);

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

      // Populate CDD form from person data (Individual only)
      if (appData.type === 'INDIVIDUAL' && resp.person) {
        const p = resp.person;
        setCddAlias(p.alias ?? '');
        setCddKtp(p.ktp_number ?? '');
        setCddSim(p.sim_number ?? '');
        setCddPassport(p.passport_number ?? '');
        setCddNationality(p.nationality ?? 'Indonesia');
        setCddProvinceCode(p.province_code ?? '');
        setCddCityCode(p.city_code ?? '');
        setCddDistrictCode(p.district_code ?? '');
        setCddVillageCode(p.village_code ?? '');
        setCddStreet(p.street_address ?? '');
        setCddHouseNo(p.house_number ?? '');
        setCddRtRw(p.rt_rw ?? '');
        setCddApartment(p.apartment_block ?? '');
        setCddLandmark(p.address_landmark ?? '');
        setCddIndustry(p.industry_category ?? '');
        setCddIndustryOther(p.industry_category_other ?? '');
        setCddCompanyName(p.company_name ?? '');
        setCddCompanyAddress(p.company_address ?? '');
        setCddIncomeRange(p.monthly_income_range ?? '');
        setCddOccupation(p.occupation ?? '');
        setCddOccupationOther(p.occupation_other ?? '');
        setCddCifRelationshipType(p.cif_relationship_type === 'WIC' ? 'WIC' : 'OUR_CUSTOMER');
        setCddSourceOfFunds(p.source_of_funds ?? '');
        setCddSourceOfFundsOther(p.source_of_funds_other ?? '');
        setCddBusinessPurpose(p.business_relationship_purpose ?? '');
        setCddBusinessPurposeOther(p.business_relationship_purpose_other ?? '');
        setCddDistributionChannel(p.distribution_channel ?? '');
        // WIC minimum CDD prefill
        setWicFullName(p.full_name ?? '');
        setWicIdentityType(p.identity_type ?? 'KTP');
        setWicIdentityNumber(p.identity_number ?? '');
        setWicAddressIdentity(p.address_identity ?? '');
        setWicPob(p.pob ?? '');
        setWicDob((p.dob ?? '').slice(0, 10));
        setWicTransactionPurpose(p.wic_transaction_purpose ?? '');
        setWicRecipientRelationship(p.wic_recipient_relationship ?? '');
      }
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

      // Only fetch screening after submission — DRAFT hasn't run screening yet
      if (appData.status !== 'DRAFT') {
        const screeningData = await apiFetch<ScreeningResult>(`/applications/${id}/screening`).catch(() => null);
        setScreening(screeningData);
      }
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

  // Load static reference lists when app type is INDIVIDUAL
  useEffect(() => {
    if (app?.type !== 'INDIVIDUAL') return;
    function toList<T>(r: unknown): T[] {
      if (Array.isArray(r)) return r as T[];
      if (r && typeof r === 'object' && 'data' in r && Array.isArray((r as { data: unknown }).data)) {
        return (r as { data: T[] }).data;
      }
      return [];
    }
    Promise.all([
      apiFetch<unknown>('/references/provinces'),
      apiFetch<unknown>('/references/nationalities'),
      apiFetch<unknown>('/references/rba/industries'),
      apiFetch<unknown>('/references/monthly-income-ranges'),
      apiFetch<unknown>('/references/rba/occupations'),
      apiFetch<unknown>('/references/rba/source-of-funds'),
      apiFetch<unknown>('/references/rba/business-purposes'),
      apiFetch<unknown>('/references/rba/distributions'),
    ]).then(([prov, nat, ind, inc, occ, sof, purpose, dist]) => {
      setProvinces(toList<RefItem>(prov));
      setNationalities(toList<RefItem>(nat));
      setIndustryCategories(toList<RefItem>(ind));
      setIncomeRanges(toList<RefItem>(inc));
      setOccupations(toList<RefItem>(occ));
      setSourceOfFundsOptions(toList<RefItem>(sof));
      setBusinessPurposeOptions(toList<RefItem>(purpose));
      setDistributionOptions(toList<RefItem>(dist));
    }).catch(() => {});
  }, [app?.type]);

  // Cascade: load regencies when province changes
  useEffect(() => {
    if (!cddProvinceCode) { setRegencies([]); return; }
    function toList(r: unknown): RefItem[] {
      if (Array.isArray(r)) return r as RefItem[];
      if (r && typeof r === 'object' && 'data' in r && Array.isArray((r as { data: unknown }).data)) {
        return (r as { data: RefItem[] }).data;
      }
      return [];
    }
    setRegenciesLoading(true);
    apiFetch<unknown>(`/references/regencies?province_code=${encodeURIComponent(cddProvinceCode)}`)
      .then((r) => setRegencies(toList(r)))
      .catch(() => setRegencies([]))
      .finally(() => setRegenciesLoading(false));
  }, [cddProvinceCode]);

  // Cascade: load districts when city changes
  useEffect(() => {
    if (!cddCityCode) { setDistricts([]); return; }
    function toList(r: unknown): RefItem[] {
      if (Array.isArray(r)) return r as RefItem[];
      if (r && typeof r === 'object' && 'data' in r && Array.isArray((r as { data: unknown }).data)) {
        return (r as { data: RefItem[] }).data;
      }
      return [];
    }
    setDistrictsLoading(true);
    apiFetch<unknown>(`/references/districts?regency_code=${encodeURIComponent(cddCityCode)}`)
      .then((r) => setDistricts(toList(r)))
      .catch(() => setDistricts([]))
      .finally(() => setDistrictsLoading(false));
  }, [cddCityCode]);

  // Cascade: load villages when district changes
  useEffect(() => {
    if (!cddDistrictCode) { setVillages([]); return; }
    function toList(r: unknown): RefItem[] {
      if (Array.isArray(r)) return r as RefItem[];
      if (r && typeof r === 'object' && 'data' in r && Array.isArray((r as { data: unknown }).data)) {
        return (r as { data: RefItem[] }).data;
      }
      return [];
    }
    setVillagesLoading(true);
    apiFetch<unknown>(`/references/villages?district_code=${encodeURIComponent(cddDistrictCode)}`)
      .then((r) => setVillages(toList(r)))
      .catch(() => setVillages([]))
      .finally(() => setVillagesLoading(false));
  }, [cddDistrictCode]);

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
      toast.success('Aplikasi berhasil disubmit.');
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

  async function reject() {
    if (!id) return;
    if (!rejectReason.trim()) {
      toast.error('Alasan penolakan wajib diisi.');
      return;
    }
    setActionLoading(true);
    try {
      await apiFetch(`/applications/${id}/decision`, {
        method: 'PATCH',
        body: { decision: 'REJECTED', reason: rejectReason.trim() },
      });
      toast.success('Aplikasi berhasil ditolak.');
      setShowRejectInput(false);
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
      const effectiveDocType = isWic && !WIC_DOC_OPTIONS.some((opt) => opt.value === docType)
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

  function validateCdd(): boolean {
    let valid = true;
    if (!cddKtp.trim() || !/^\d{15,16}$/.test(cddKtp)) {
      setCddKtpErr('Nomor KTP wajib diisi 15–16 digit angka.');
      valid = false;
    } else {
      setCddKtpErr('');
    }
    if (cddSim.length > 20) {
      setCddSimErr('Nomor SIM maksimal 20 karakter.');
      valid = false;
    } else {
      setCddSimErr('');
    }
    if (cddPassport.length > 20) {
      setCddPassportErr('Nomor Paspor maksimal 20 karakter.');
      valid = false;
    } else {
      setCddPassportErr('');
    }

    // "Lainnya" companions — required when the related dropdown is "Lainnya".
    const lainnyaChecks: Array<[boolean, string]> = [
      [isLainnya(cddOccupation) && !cddOccupationOther.trim(), 'Keterangan Pekerjaan Lainnya wajib diisi.'],
      [isLainnya(cddIndustry) && !cddIndustryOther.trim(), 'Keterangan Industri Lainnya wajib diisi.'],
      [isLainnya(cddSourceOfFunds) && !cddSourceOfFundsOther.trim(), 'Keterangan Sumber Dana Lainnya wajib diisi.'],
      [isLainnya(cddBusinessPurpose) && !cddBusinessPurposeOther.trim(), 'Keterangan Tujuan Hubungan Bisnis Lainnya wajib diisi.'],
    ];
    for (const [invalid, message] of lainnyaChecks) {
      if (invalid) {
        toast.error(message);
        valid = false;
      }
    }
    return valid;
  }

  async function saveCdd() {
    if (!id) return;
    if (!validateCdd()) return;
    setCddSaving(true);
    try {
      await apiFetch(`/applications/${id}`, {
        method: 'PATCH',
        body: {
          alias: cddAlias || null,
          ktp_number: cddKtp || null,
          sim_number: cddSim || null,
          passport_number: cddPassport || null,
          province_code: cddProvinceCode || null,
          city_code: cddCityCode || null,
          district_code: cddDistrictCode || null,
          village_code: cddVillageCode || null,
          street_address: cddStreet || null,
          house_number: cddHouseNo || null,
          rt_rw: cddRtRw || null,
          apartment_block: cddApartment || null,
          address_landmark: cddLandmark || null,
          nationality: cddNationality || null,
          occupation: cddOccupation || null,
          occupation_other: isLainnya(cddOccupation) ? cddOccupationOther || null : null,
          industry_category: cddIndustry || null,
          industry_category_other: isLainnya(cddIndustry) ? cddIndustryOther || null : null,
          company_name: cddCompanyName || null,
          company_address: cddCompanyAddress || null,
          monthly_income_range: cddIncomeRange || null,
          source_of_funds: cddSourceOfFunds || null,
          source_of_funds_other: isLainnya(cddSourceOfFunds) ? cddSourceOfFundsOther || null : null,
          business_relationship_purpose: cddBusinessPurpose || null,
          business_relationship_purpose_other: isLainnya(cddBusinessPurpose) ? cddBusinessPurposeOther || null : null,
          distribution_channel: cddDistributionChannel || null,
          cif_relationship_type: cddCifRelationshipType,
        },
      });
      toast.success('Data berhasil disimpan.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menyimpan data. Silakan coba lagi.'));
    } finally {
      setCddSaving(false);
    }
  }

  // WIC minimum CDD save — only the SOP fields, no Our Customer / RBA payload.
  async function saveWic() {
    if (!id) return;
    setCddSaving(true);
    try {
      await apiFetch(`/applications/${id}`, {
        method: 'PATCH',
        body: {
          full_name: wicFullName || null,
          identity_type: wicIdentityType || null,
          identity_number: wicIdentityNumber || null,
          address_identity: wicAddressIdentity || null,
          pob: wicPob || null,
          dob: wicDob || null,
          wic_transaction_purpose: wicTransactionPurpose || null,
          wic_recipient_relationship: wicRecipientRelationship || null,
          cif_relationship_type: cddCifRelationshipType,
        },
      });
      toast.success('Data berhasil disimpan.');
      await load();
    } catch (e: unknown) {
      toast.error(getErrMsg(e, 'Gagal menyimpan data. Silakan coba lagi.'));
    } finally {
      setCddSaving(false);
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
    form.append('doc_type', webcamTarget);
    try {
      await apiUpload(`/applications/${id}/documents/upload`, form);
      setWebcamTarget(null);
      toast.success('Dokumen berhasil diunggah.');
      await load();
    } catch (e: unknown) {
      throw new Error(getErrMsg(e, 'Upload gagal. Silakan coba lagi.'));
    }
  }

  if (loading) return <p className="p-6 text-sm text-slate-500">Memuat…</p>;
  if (err) return <p className="p-6 text-sm text-red-600">{err}</p>;
  if (!app) return <p className="p-6 text-sm text-slate-500">Data tidak ditemukan.</p>;

  const canSubmit = app.status === 'DRAFT';
  const canDecide = app.status === 'SUBMITTED' || app.status === 'IN_REVIEW';

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

  const canViewRisk = ['SystemAdmin', 'Director', 'ComplianceLead', 'OperationSupervisor', 'FrontDesk', 'Auditor'].includes(userRole ?? '');
  const canEditEdd = ['SystemAdmin', 'Director', 'FrontDesk', 'ComplianceLead'].includes(userRole ?? '');
  const canViewEdd = ['SystemAdmin', 'Director', 'FrontDesk', 'ComplianceLead', 'Auditor'].includes(userRole ?? '');
  const showEddSection = canViewEdd && (eddRequired || Object.keys(eddData).length > 0);

  return (
    <div className="space-y-5 p-6 max-w-3xl">
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
              {{ DRAFT: 'Draft', SUBMITTED: 'Diajukan', IN_REVIEW: 'Dalam Review', APPROVED: 'Disetujui', REJECTED: 'Ditolak' }[app.status] ?? app.status}
            </span>
            <span className="text-xs text-slate-500">{{ INDIVIDUAL: 'Individu', BUSINESS: 'Perusahaan' }[app.type] ?? app.type}</span>
          </div>
        </div>
        <button onClick={() => router.back()} className="text-sm text-slate-500 hover:text-slate-700 underline transition-colors">
          Kembali
        </button>
      </div>

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
          <button
            onClick={runPrecheck}
            disabled={actionLoading}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            Pra-Pemeriksaan
          </button>

          {canSubmit && (
            <button
              onClick={submit}
              disabled={actionLoading}
              className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
            >
              Ajukan
            </button>
          )}

          {canDecide && canDecideByRole && (
            <>
              <button
                onClick={approve}
                disabled={actionLoading || approveBlocked}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                Setujui
              </button>
              <button
                onClick={() => setShowRejectInput(true)}
                disabled={actionLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                Tolak…
              </button>
            </>
          )}
        </div>

        {/* Helper text — rendered below button group, not inside row */}
        {approveBlocked && canDecide && canDecideByRole && (
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

        {/* Reject reason input */}
        {showRejectInput && (
          <div className="flex flex-wrap gap-2 items-end">
            <div className="flex-1 min-w-[220px]">
              <label className="text-xs text-slate-500">Alasan penolakan *</label>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Tuliskan alasan penolakan..."
              />
            </div>
            <button
              onClick={reject}
              disabled={actionLoading}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              Konfirmasi Penolakan
            </button>
            <button
              onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
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

      {/* Detail info */}
      {app.type === 'INDIVIDUAL' ? (
        canSubmit ? (
          /* ── DRAFT: Editable CDD form ──────────────────────────────── */
          <div className="rounded-xl border p-4 space-y-5">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Informasi Individu</p>

            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 space-y-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-slate-500">Parameter CIF / Jenis Pengguna</span>
                  <select
                    value={cddCifRelationshipType}
                    onChange={(e) => setCddCifRelationshipType(e.target.value as 'OUR_CUSTOMER' | 'WIC')}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="OUR_CUSTOMER">Our Customer</option>
                    <option value="WIC">Walk-In Customer (WIC)</option>
                  </select>
                </label>
                <div className="rounded-lg bg-white/70 p-3 text-xs text-slate-600">
                  {cddCifRelationshipType === 'WIC' ? (
                    <>
                      <p className="font-semibold text-emerald-800">CDD Walk-In Customer (&lt; Rp100 juta)</p>
                      <p className="mt-1">WIC tidak diterbitkan CIF dan limit transaksi maksimal Rp100.000.000.</p>
                    </>
                  ) : (
                    <>
                      <p className="font-semibold text-emerald-800">Our Customer</p>
                      <p className="mt-1">Customer normal akan menggunakan CIF untuk transaksi dan pelaporan.</p>
                    </>
                  )}
                </div>
              </div>
            </div>

            {cddCifRelationshipType === 'WIC' ? (
              /* ── WIC minimum CDD layout (form SOP Walk-In Customer) ─── */
              <>
                {/* A. Identitas Minimum */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-600 border-b pb-1">A. Identitas Minimum</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Nama Lengkap <span className="text-red-500">*</span></label>
                      <input
                        value={wicFullName}
                        onChange={(e) => setWicFullName(e.target.value)}
                        placeholder="Nama sesuai identitas"
                        className="rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Jenis Identitas</label>
                      <select
                        value={wicIdentityType}
                        onChange={(e) => setWicIdentityType(e.target.value)}
                        className="rounded-md border bg-white px-2 py-1.5 text-sm"
                      >
                        <option value="KTP">KTP</option>
                        <option value="SIM">SIM</option>
                        <option value="PASPOR">Paspor</option>
                        {wicIdentityType && !['KTP', 'SIM', 'PASPOR'].includes(wicIdentityType) && (
                          <option value={wicIdentityType}>{wicIdentityType}</option>
                        )}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Nomor Identitas <span className="text-red-500">*</span></label>
                      <input
                        value={wicIdentityNumber}
                        onChange={(e) => setWicIdentityNumber(e.target.value)}
                        placeholder="Nomor sesuai identitas"
                        className="rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Tempat Lahir</label>
                      <input
                        value={wicPob}
                        onChange={(e) => setWicPob(e.target.value)}
                        placeholder="Tempat lahir"
                        className="rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Tanggal Lahir</label>
                      <input
                        type="date"
                        value={wicDob}
                        onChange={(e) => setWicDob(e.target.value)}
                        className="rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1 sm:col-span-2">
                      <label className="text-xs text-slate-500">Alamat minimal sesuai identitas</label>
                      <textarea
                        value={wicAddressIdentity}
                        onChange={(e) => setWicAddressIdentity(e.target.value)}
                        placeholder="Tulis alamat sesuai identitas"
                        rows={2}
                        className="rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-slate-400">
                    Tanda tangan / biometrik pengguna dilampirkan pada bagian Dokumen.
                  </p>
                </div>

                {/* B. Tujuan Transaksi */}
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-600 border-b pb-1">B. Tujuan Transaksi</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Tujuan Transaksi</label>
                      <input
                        value={wicTransactionPurpose}
                        onChange={(e) => setWicTransactionPurpose(e.target.value)}
                        placeholder="Contoh: transfer keluarga, pembayaran, dll."
                        className="rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-slate-500">Hubungan dengan Penerima</label>
                      <input
                        value={wicRecipientRelationship}
                        onChange={(e) => setWicRecipientRelationship(e.target.value)}
                        placeholder="Contoh: keluarga, rekan usaha, dll."
                        className="rounded-md border px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 border-t pt-3">
                  <button
                    type="button"
                    onClick={saveWic}
                    disabled={cddSaving}
                    className="rounded-md bg-kesh-700 px-4 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
                  >
                    {cddSaving ? 'Menyimpan…' : 'Simpan Data'}
                  </button>
                </div>

                <div className="border-t pt-2 space-y-2">
                  <Row label="CIF Pengguna Jasa" value="Tidak diterbitkan (WIC)" />
                  <Row label="Parameter CIF" value="WIC / Walk-In Customer" />
                </div>
              </>
            ) : (
              <>
            {/* 1. Data Pribadi */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600 border-b pb-1">Data Pribadi</p>
              <div className="space-y-2">
                <Row label="Nama Lengkap" value={person?.full_name} />
                <Row label="Email" value={person?.email} />
                <Row label="Telepon" value={person?.phone} />
                <Row label="Tempat / Tgl Lahir" value={[person?.pob, person?.dob].filter(Boolean).join(', ')} />
                <Row label="Jenis Kelamin" value={person?.gender} />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs text-slate-500">Alias</label>
                <input
                  value={cddAlias}
                  onChange={(e) => setCddAlias(e.target.value)}
                  placeholder="Nama alias (opsional)"
                  className="rounded-md border px-2 py-1.5 text-sm"
                />
              </div>
            </div>

            {/* 2. Identitas */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600 border-b pb-1">Identitas</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nomor KTP <span className="text-red-500">*</span></label>
                  <input
                    value={cddKtp}
                    onChange={(e) => { setCddKtp(e.target.value.replace(/\D/g, '')); setCddKtpErr(''); }}
                    maxLength={16}
                    placeholder="15–16 digit angka"
                    className={`rounded-md border px-2 py-1.5 text-sm${cddKtpErr ? ' border-red-400' : ''}`}
                  />
                  {cddKtpErr && <p className="text-xs text-red-600">{cddKtpErr}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nomor SIM</label>
                  <input
                    value={cddSim}
                    onChange={(e) => { setCddSim(e.target.value); setCddSimErr(''); }}
                    maxLength={20}
                    placeholder="Opsional, maks. 20 karakter"
                    className={`rounded-md border px-2 py-1.5 text-sm${cddSimErr ? ' border-red-400' : ''}`}
                  />
                  {cddSimErr && <p className="text-xs text-red-600">{cddSimErr}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nomor Paspor</label>
                  <input
                    value={cddPassport}
                    onChange={(e) => { setCddPassport(e.target.value); setCddPassportErr(''); }}
                    maxLength={20}
                    placeholder="Opsional, maks. 20 karakter"
                    className={`rounded-md border px-2 py-1.5 text-sm${cddPassportErr ? ' border-red-400' : ''}`}
                  />
                  {cddPassportErr && <p className="text-xs text-red-600">{cddPassportErr}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Kewarganegaraan</label>
                  <select
                    value={cddNationality}
                    onChange={(e) => setCddNationality(e.target.value)}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">— Pilih —</option>
                    {nationalities.map((n) => (
                      <option key={n.code} value={n.code}>{n.name}</option>
                    ))}
                    {/* Fallback: keep existing value selectable even if not in list */}
                    {cddNationality && !nationalities.find((n) => n.code === cddNationality) && (
                      <option value={cddNationality}>{cddNationality}</option>
                    )}
                  </select>
                </div>
              </div>
              {person?.identity_number && !cddKtp && (
                <p className="text-xs text-slate-400">
                  Nomor identitas lama: <span className="font-mono">{person.identity_number}</span>
                </p>
              )}
            </div>

            {/* 3. Alamat */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600 border-b pb-1">Alamat</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Provinsi</label>
                  <select
                    value={cddProvinceCode}
                    onChange={(e) => {
                      setCddProvinceCode(e.target.value);
                      setCddCityCode('');
                      setCddDistrictCode('');
                      setCddVillageCode('');
                    }}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm"
                  >
                    <option value="">— Pilih Provinsi —</option>
                    {provinces.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Kota / Kabupaten</label>
                  <select
                    value={cddCityCode}
                    disabled={!cddProvinceCode || regenciesLoading}
                    onChange={(e) => {
                      setCddCityCode(e.target.value);
                      setCddDistrictCode('');
                      setCddVillageCode('');
                    }}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {regenciesLoading ? (
                      <option disabled>Memuat...</option>
                    ) : cddProvinceCode && regencies.length === 0 ? (
                      <option disabled>Data kota/kabupaten belum tersedia untuk provinsi ini.</option>
                    ) : (
                      <>
                        <option value="">— Pilih Kota/Kabupaten —</option>
                        {regencies.map((r) => (
                          <option key={r.code} value={r.code}>{r.name}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Kecamatan</label>
                  <select
                    value={cddDistrictCode}
                    disabled={!cddCityCode || districtsLoading}
                    onChange={(e) => {
                      setCddDistrictCode(e.target.value);
                      setCddVillageCode('');
                    }}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {districtsLoading ? (
                      <option disabled>Memuat...</option>
                    ) : cddCityCode && districts.length === 0 ? (
                      <option disabled>Data kecamatan belum tersedia untuk kota/kabupaten ini.</option>
                    ) : (
                      <>
                        <option value="">— Pilih Kecamatan —</option>
                        {districts.map((d) => (
                          <option key={d.code} value={d.code}>{d.name}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Kelurahan / Desa</label>
                  <select
                    value={cddVillageCode}
                    disabled={!cddDistrictCode || villagesLoading}
                    onChange={(e) => setCddVillageCode(e.target.value)}
                    className="rounded-md border bg-white px-2 py-1.5 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  >
                    {villagesLoading ? (
                      <option disabled>Memuat...</option>
                    ) : cddDistrictCode && villages.length === 0 ? (
                      <option disabled>Data kelurahan/desa belum tersedia untuk kecamatan ini.</option>
                    ) : (
                      <>
                        <option value="">— Pilih Kelurahan/Desa —</option>
                        {villages.map((v) => (
                          <option key={v.code} value={v.code}>{v.name}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nama Jalan</label>
                  <input value={cddStreet} onChange={(e) => setCddStreet(e.target.value)} placeholder="Nama jalan" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nomor Rumah</label>
                  <input value={cddHouseNo} onChange={(e) => setCddHouseNo(e.target.value)} placeholder="Nomor rumah" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">RT / RW</label>
                  <input value={cddRtRw} onChange={(e) => setCddRtRw(e.target.value)} placeholder="Contoh: 001/002" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Apartemen / Blok</label>
                  <input value={cddApartment} onChange={(e) => setCddApartment(e.target.value)} placeholder="Opsional" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-xs text-slate-500">Patokan</label>
                  <input value={cddLandmark} onChange={(e) => setCddLandmark(e.target.value)} placeholder="Patokan alamat (opsional)" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>

            {/* 4. Pekerjaan */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600 border-b pb-1">Pekerjaan</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Pekerjaan</label>
                  <select value={cddOccupation} onChange={(e) => { const v = e.target.value; setCddOccupation(v); if (!isLainnya(v)) setCddOccupationOther(''); }} className="rounded-md border bg-white px-2 py-1.5 text-sm">
                    <option value="">— Pilih pekerjaan —</option>
                    {occupations.map((o) => (
                      <option key={o.code} value={o.name}>{o.name}</option>
                    ))}
                    {cddOccupation && !occupations.find((o) => o.name === cddOccupation) && (
                      <option value={cddOccupation}>{cddOccupation}</option>
                    )}
                  </select>
                  <LainnyaField
                    when={cddOccupation}
                    value={cddOccupationOther}
                    onChange={setCddOccupationOther}
                    label="Keterangan Pekerjaan Lainnya"
                    labelClassName="text-xs text-slate-500"
                    inputClassName="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Industri / Kegiatan Usaha</label>
                  <select value={cddIndustry} onChange={(e) => { const v = e.target.value; setCddIndustry(v); if (!isLainnya(v)) setCddIndustryOther(''); }} className="rounded-md border bg-white px-2 py-1.5 text-sm">
                    <option value="">— Pilih industri —</option>
                    {industryCategories.map((c) => (
                      <option key={c.code} value={c.code}>{c.name}</option>
                    ))}
                    {cddIndustry && !industryCategories.find((c) => c.code === cddIndustry || c.name === cddIndustry) && (
                      <option value={cddIndustry}>{cddIndustry}</option>
                    )}
                  </select>
                  <LainnyaField
                    when={cddIndustry}
                    value={cddIndustryOther}
                    onChange={setCddIndustryOther}
                    label="Keterangan Industri Lainnya"
                    labelClassName="text-xs text-slate-500"
                    inputClassName="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Penghasilan / Bulan</label>
                  <select value={cddIncomeRange} onChange={(e) => setCddIncomeRange(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-sm">
                    <option value="">— Pilih rentang —</option>
                    {incomeRanges.length === 0 ? (
                      <option value="" disabled>Rentang penghasilan belum tersedia.</option>
                    ) : (
                      incomeRanges.map((r) => (
                        <option key={r.code} value={r.code}>{r.name}</option>
                      ))
                    )}
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Nama Perusahaan</label>
                  <input value={cddCompanyName} onChange={(e) => setCddCompanyName(e.target.value)} placeholder="Diisi jika pengguna bekerja" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-xs text-slate-500">Alamat Tempat Bekerja</label>
                  <input value={cddCompanyAddress} onChange={(e) => setCddCompanyAddress(e.target.value)} placeholder="Opsional" className="rounded-md border px-2 py-1.5 text-sm" />
                </div>
              </div>
            </div>


            {/* 5. Hubungan Bisnis (RBA) */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-600 border-b pb-1">Hubungan Bisnis (RBA)</p>
              <p className="text-xs text-slate-500">Pilihan ini digunakan untuk perhitungan Risk Based Approach sesuai SOP.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Sumber Dana</label>
                  <select value={cddSourceOfFunds} onChange={(e) => { const v = e.target.value; setCddSourceOfFunds(v); if (!isLainnya(v)) setCddSourceOfFundsOther(''); }} className="rounded-md border bg-white px-2 py-1.5 text-sm">
                    <option value="">— Pilih sumber dana —</option>
                    {sourceOfFundsOptions.map((o) => (
                      <option key={o.code} value={o.code}>{o.name}</option>
                    ))}
                    {cddSourceOfFunds && !sourceOfFundsOptions.find((o) => o.code === cddSourceOfFunds || o.name === cddSourceOfFunds) && (
                      <option value={cddSourceOfFunds}>{cddSourceOfFunds}</option>
                    )}
                  </select>
                  <LainnyaField
                    when={cddSourceOfFunds}
                    value={cddSourceOfFundsOther}
                    onChange={setCddSourceOfFundsOther}
                    label="Keterangan Sumber Dana Lainnya"
                    labelClassName="text-xs text-slate-500"
                    inputClassName="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Tujuan Hubungan Bisnis</label>
                  <select value={cddBusinessPurpose} onChange={(e) => { const v = e.target.value; setCddBusinessPurpose(v); if (!isLainnya(v)) setCddBusinessPurposeOther(''); }} className="rounded-md border bg-white px-2 py-1.5 text-sm">
                    <option value="">— Pilih tujuan —</option>
                    {businessPurposeOptions.map((o) => (
                      <option key={o.code} value={o.code}>{o.name}</option>
                    ))}
                    {cddBusinessPurpose && !businessPurposeOptions.find((o) => o.code === cddBusinessPurpose || o.name === cddBusinessPurpose) && (
                      <option value={cddBusinessPurpose}>{cddBusinessPurpose}</option>
                    )}
                  </select>
                  <LainnyaField
                    when={cddBusinessPurpose}
                    value={cddBusinessPurposeOther}
                    onChange={setCddBusinessPurposeOther}
                    label="Keterangan Tujuan Hubungan Bisnis Lainnya"
                    labelClassName="text-xs text-slate-500"
                    inputClassName="rounded-md border px-2 py-1.5 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500">Saluran Distribusi</label>
                  <select value={cddDistributionChannel} onChange={(e) => setCddDistributionChannel(e.target.value)} className="rounded-md border bg-white px-2 py-1.5 text-sm">
                    <option value="">— Pilih saluran —</option>
                    {distributionOptions.map((o) => (
                      <option key={o.code} value={o.code}>{o.name}</option>
                    ))}
                    {cddDistributionChannel && !distributionOptions.find((o) => o.code === cddDistributionChannel || o.name === cddDistributionChannel) && (
                      <option value={cddDistributionChannel}>{cddDistributionChannel}</option>
                    )}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 border-t pt-3">
              <button
                type="button"
                onClick={saveCdd}
                disabled={cddSaving}
                className="rounded-md bg-kesh-700 px-4 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {cddSaving ? 'Menyimpan…' : 'Simpan Data'}
              </button>
            </div>

            <div className="border-t pt-2 space-y-2">
              <Row label="CIF Pengguna Jasa" value={person?.cif_relationship_type === 'WIC' ? 'Tidak diterbitkan (WIC)' : formatCif(person?.cif_no)} />
              <Row label="Parameter CIF" value={getCifRelationshipLabel(person?.cif_relationship_type)} />
            </div>
              </>
            )}
          </div>
        ) : (
          /* ── Non-DRAFT: Read-only individual view ──────────────────── */
          isWic ? (
            /* WIC minimum CDD — read-only */
            <div className="rounded-xl border p-4 space-y-2">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Informasi Individu (WIC)</p>
              <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <p className="font-semibold">CDD Walk-In Customer (&lt; Rp100 juta)</p>
                <p className="mt-1">WIC tidak diterbitkan CIF dan transaksi dibatasi maksimal Rp100.000.000.</p>
              </div>

              <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2">A. Identitas Minimum</p>
              <Row label="Nama Lengkap" value={person?.full_name} />
              <Row label="Jenis Identitas" value={person?.identity_type} />
              <Row label="Nomor Identitas" value={person?.identity_number} />
              <Row label="Alamat sesuai Identitas" value={person?.address_identity} />
              <Row label="Tempat Lahir" value={person?.pob} />
              <Row label="Tanggal Lahir" value={person?.dob} />

              <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2 mt-4">B. Tujuan Transaksi</p>
              <Row label="Tujuan Transaksi" value={person?.wic_transaction_purpose} />
              <Row label="Hubungan dengan Penerima" value={person?.wic_recipient_relationship} />

              <div className="border-t pt-2 mt-4 space-y-2">
                <Row label="CIF Pengguna Jasa" value="Tidak diterbitkan (WIC)" />
                <Row label="Parameter CIF" value="WIC / Walk-In Customer" />
              </div>
            </div>
          ) : (
          /* Our Customer — read-only full view */
          <div className="rounded-xl border p-4 space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Informasi Individu</p>

            <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2">Data Pribadi</p>
            <Row label="Nama Lengkap" value={person?.full_name} />
            <Row label="Alias" value={person?.alias} />
            <Row label="Email" value={person?.email} />
            <Row label="Telepon" value={person?.phone} />
            <Row label="Tempat / Tgl Lahir" value={[person?.pob, person?.dob].filter(Boolean).join(', ')} />
            <Row label="Jenis Kelamin" value={person?.gender} />

            <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2 mt-4">Identitas</p>
            <Row label="Nomor KTP" value={person?.ktp_number} />
            <Row label="Nomor SIM" value={person?.sim_number} />
            <Row label="Nomor Paspor" value={person?.passport_number} />
            <Row label="Kewarganegaraan" value={person?.nationality} />
            {person?.identity_number && !person?.ktp_number && (
              <Row label="Nomor Identitas (Lama)" value={person?.identity_number} />
            )}

            <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2 mt-4">Alamat</p>
            <Row label="Provinsi" value={person?.province_name} />
            <Row label="Kota / Kabupaten" value={person?.city_name} />
            <Row label="Kecamatan" value={person?.district_name} />
            <Row label="Kelurahan / Desa" value={person?.village_name} />
            <Row label="Nama Jalan" value={person?.street_address} />
            <Row label="Nomor Rumah" value={person?.house_number} />
            <Row label="RT / RW" value={person?.rt_rw} />
            <Row label="Apartemen / Blok" value={person?.apartment_block} />
            <Row label="Patokan" value={person?.address_landmark} />
            <Row label="Alamat KTP" value={person?.address_identity} />
            <Row label="Alamat Domisili" value={person?.address_residential} />

            <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2 mt-4">Pekerjaan</p>
            <Row label="Pekerjaan" value={person?.occupation} />
            <Row label="Industri / Kegiatan Usaha" value={person?.industry_category} />
            <Row label="Nama Perusahaan" value={person?.company_name} />
            <Row label="Alamat Tempat Bekerja" value={person?.company_address} />
            <Row label="Penghasilan / Bulan" value={person?.monthly_income_range} />

            <div className="border-t pt-2 mt-4 space-y-2">
              <Row label="CIF Pengguna Jasa" value={formatCif(person?.cif_no)} />
              <Row label="Parameter CIF" value={getCifRelationshipLabel(person?.cif_relationship_type)} />
            </div>
          </div>
          )
        )
      ) : (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Informasi Identitas Badan Usaha</p>
          <Row label="Nama Badan Usaha" value={business?.legal_name} />
          <Row label="Bentuk Badan Usaha" value={business?.legal_form} />
          <Row label="Nomor Akta Pendirian & Perubahan Terakhir" value={business?.deed_number} />
          <Row label="Tanggal Pendirian" value={business?.incorporation_date} />
          <Row label="Tempat Pendirian" value={business?.incorporation_place} />
          <Row label="Nomor Izin Usaha (NIB/OSS/SIUP)" value={business?.business_license_number || business?.nib} />
          <Row label="NPWP Badan Usaha" value={business?.npwp} />
          <Row label="KBLI" value={business?.industry_code} />
          <Row label="Bidang Usaha" value={business?.business_activity} />
          <Row label="Alamat Kedudukan" value={business?.address_line} />
          <Row label="Kota" value={business?.city} />
          <Row label="Provinsi" value={business?.province} />
          <Row label="Kode Pos" value={business?.postal_code} />
          <Row label="Nomor Telepon Perusahaan" value={business?.phone} />
          <Row label="Email Perusahaan" value={business?.company_email} />
          <Row label="CIF Badan Hukum" value={formatCif(business?.cif_no)} />

          <p className="text-xs font-semibold text-slate-600 border-b pb-1 mb-2 mt-4">Pengurus Utama / PIC</p>
          <Row label="Nama Pengurus Utama / PIC" value={business?.pic_name} />
          <Row label="Jabatan" value={business?.pic_position} />
          <Row label="Nomor Identitas" value={business?.pic_identity_number} />
          <Row label="Jenis Identitas" value={business?.pic_identity_type} />

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
      )}

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
                  const { statusLabel, statusCls } = getDocStatusInfo(doc);
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
                      {canSubmit && doc && (
                        <button type="button" onClick={() => deleteDocument(doc.id)} className="text-xs text-red-600 hover:underline">Hapus</button>
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
              ].includes(d.doc_type)).length > 0 && (
                <div className="pt-2 border-t space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Dokumen Lainnya</p>
                  <ul className="space-y-1.5">
                    {docs
                      .filter((d) => ![
                        ...WIC_IDENTITY_DOC_ALIASES,
                        ...WIC_SIGNATURE_DOC_ALIASES,
                        'WIC_SUPPORTING_DOCUMENT',
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
                            {ktpUploading ? 'Mengunggah…' : uploadedLike ? 'Upload Ulang' : 'Upload'}
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
                            onClick={() => setWebcamTarget('INDIVIDUAL_FACE_PHOTO')}
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
                            onClick={() => setWebcamTarget('INDIVIDUAL_FACE_WITH_KTP_PHOTO')}
                            className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50"
                          >
                            {uploadedLike ? 'Ambil Ulang' : 'Ambil Foto dengan KTP'}
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
              {docs.filter((d) => !INDIVIDUAL_REQUIRED_DOC_TYPES.includes(d.doc_type)).length > 0 && (
                <div className="pt-2 border-t space-y-1.5">
                  <p className="text-xs font-medium text-slate-500">Dokumen Lainnya</p>
                  <ul className="space-y-1.5">
                    {docs
                      .filter((d) => !INDIVIDUAL_REQUIRED_DOC_TYPES.includes(d.doc_type))
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

          {docs.length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada dokumen.</p>
          ) : (
            <ul className="space-y-1.5">
              {docs.map((d) => {
                const filename = d.extracted_json?.original_name ?? d.original_name;
                const { statusLabel, statusCls } = getDocStatusInfo(d);
                return (
                  <li key={String(d.id)} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium text-slate-700">{d.doc_type}</span>
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
                    {['AKTA_PENDIRIAN', 'NIB_SIUP', 'NPWP_BADAN', 'KTP_KUASA'].map((t) => (
                      <option key={t} value={t}>{t}</option>
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
                  {docUploading ? 'Mengunggah…' : 'Unggah'}
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
            {canSubmit && (
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
          {canSubmit && partyOpen && (
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
                    {canSubmit && <th className="py-1" />}
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
                      {canSubmit && (
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
      ) : screening ? (
        <div className="rounded-xl border p-4 space-y-2">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Screening</p>
          {screening.status && (
            <p className="text-sm">
              <span className="font-medium">Status:</span> {{ DRAFT: 'Draft', SUBMITTED: 'Diajukan', IN_REVIEW: 'Dalam Review', APPROVED: 'Disetujui', REJECTED: 'Ditolak', CLEAN: 'Bersih', HIT: 'Terdeteksi' }[screening.status ?? ''] ?? screening.status}
            </p>
          )}
          {screening.checked_at && (
            <p className="text-xs text-slate-500">
              Diperiksa: {new Date(screening.checked_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
            </p>
          )}
          {Array.isArray(screening.matches) && screening.matches.length > 0 ? (
            <div className="mt-2">
              <p className="text-sm font-medium text-red-700 mb-1">
                Match ditemukan ({screening.matches.length}):
              </p>
              <ul className="space-y-1">
                {screening.matches.map((m, i) => (
                  <li key={i} className="text-sm text-red-600">
                    {m.name} — {m.list_type}
                    {m.match_score != null ? ` (score: ${m.match_score})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-emerald-700">Tidak ada match pada watchlist.</p>
          )}
        </div>
      ) : null}

      {/* Webcam capture modal — Individual face photos */}
      {webcamTarget && (
        <WebcamCapture
          instruction={
            webcamTarget === 'INDIVIDUAL_FACE_PHOTO'
              ? 'Pastikan wajah pengguna terlihat jelas menghadap kamera.'
              : 'Pastikan wajah pengguna terlihat jelas dan KTP dipegang di dekat wajah.'
          }
          filenamePrefix={
            webcamTarget === 'INDIVIDUAL_FACE_PHOTO'
              ? `individual-face-photo-${id}`
              : `individual-face-with-ktp-${id}`
          }
          onCapture={uploadWebcamCapture}
          onClose={() => setWebcamTarget(null)}
        />
      )}
    </div>
  );
}
