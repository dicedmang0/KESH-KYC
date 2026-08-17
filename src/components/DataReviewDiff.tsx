'use client';

// Tampilan SEBELUM vs SESUDAH untuk Compliance. Dipakai di halaman review
// pengkinian data supaya Compliance tidak perlu membandingkan dua form besar
// secara manual — yang ditampilkan hanya field yang benar-benar diusulkan
// berubah, langsung dari before_data/after_data milik tiap change-set row.

import {
  entityTypeLabel,
  draftStateLabel,
  type DataReviewChange,
} from '@/lib/data-review-drafts';

/** Label field CDD → Bahasa Indonesia. Fallback: nama kolom apa adanya. */
const FIELD_LABELS: Record<string, string> = {
  full_name: 'Nama Lengkap',
  alias: 'Alias',
  identity_type: 'Jenis Identitas', identity_number: 'Nomor Identitas',
  ktp_number: 'Nomor KTP', sim_number: 'Nomor SIM', passport_number: 'Nomor Paspor',
  pob: 'Tempat Lahir', dob: 'Tanggal Lahir', gender: 'Jenis Kelamin', nationality: 'Kewarganegaraan',
  address_identity: 'Alamat Identitas',
  address_residential: 'Alamat Domisili',
  occupation: 'Pekerjaan',
  occupation_other: 'Pekerjaan (Lainnya)',
  industry_category: 'Bidang Industri', industry_category_other: 'Bidang Industri (Lainnya)',
  phone: 'Telepon',
  email: 'Email',
  source_of_funds: 'Sumber Dana',
  source_of_funds_other: 'Sumber Dana (Lainnya)',
  business_relationship_purpose: 'Tujuan Hubungan Usaha',
  business_relationship_purpose_other: 'Tujuan Hubungan Usaha (Lainnya)',
  distribution_channel: 'Saluran Distribusi', pep_self_declared: 'PEP (Deklarasi Mandiri)',
  signature_uri: 'Tanda Tangan',
  monthly_income_range: 'Rentang Penghasilan',
  company_name: 'Nama Perusahaan',
  company_address: 'Alamat Perusahaan',
  province_name: 'Provinsi',
  city_name: 'Kota/Kabupaten',
  district_name: 'Kecamatan',
  village_name: 'Kelurahan/Desa',
  street_address: 'Alamat Jalan',
  house_number: 'Nomor Rumah', rt_rw: 'RT/RW', apartment_block: 'Blok/Apartemen',
  address_landmark: 'Patokan Alamat',
  legal_name: 'Nama Badan Usaha',
  trade_name: 'Nama Dagang',
  legal_form: 'Bentuk Badan Usaha', legal_form_other: 'Bentuk Badan Usaha (Lainnya)',
  business_activity: 'Bidang Usaha',
  business_activity_other: 'Bidang Usaha (Lainnya)',
  nib: 'NIB',
  npwp: 'NPWP',
  business_license_number: 'Nomor Izin Usaha', incorporation_date: 'Tanggal Pendirian',
  country: 'Negara Pendirian', company_email: 'Email Perusahaan',
  pic_name: 'Nama Pengurus Utama / PIC', pic_position: 'Jabatan PIC',
  pic_identity_number: 'Nomor Identitas PIC', pic_identity_type: 'Jenis Identitas PIC',
  business_province_name: 'Provinsi', business_city_name: 'Kota/Kabupaten',
  business_district_name: 'Kecamatan', business_village_name: 'Kelurahan/Desa',
  director_share_percentage: 'Porsi Saham Direktur Utama',
  commissioner_share_percentage: 'Porsi Saham Komisaris',
  deed_establishment_number: 'Nomor Akta Pendirian',
  deed_latest_amendment_number: 'Nomor Akta Perubahan Terakhir',
  address_line: 'Alamat Kedudukan', representative_signature_name: 'Penanda Tangan Perwakilan',
  verification_officer: 'Petugas Verifikasi', supervisor: 'Supervisor',
  role: 'Peran',
  ownership_percentage: 'Persentase Kepemilikan',
  doc_type: 'Jenis Dokumen',
  file_uri: 'Berkas',
  applicant_snapshot: 'I. Data Dasar Pengguna Jasa', high_risk_reasons: 'II. Alasan EDD',
  additional_information: 'III. Informasi Tambahan', beneficial_owner: 'IV. Beneficial Owner',
  domicile_address: 'Alamat Domisili', occupation_or_business_type: 'Pekerjaan / Jenis Usaha',
  phone_number: 'Nomor Telepon', customer_category: 'Kategori Pengguna', cdd_reference_no: 'Referensi CDD',
  customer_characteristics: 'Karakteristik Pengguna', transaction_patterns: 'Pola Transaksi',
  screening_results: 'Hasil Screening', additional_clarification_requests: 'Klarifikasi Tambahan',
  summary_notes: 'Catatan Alasan EDD', business_relationship_purposes: 'Tujuan Hubungan Usaha',
  source_of_funds_documents: 'Dokumen Sumber Dana', source_of_wealth: 'Sumber Kekayaan',
  source_of_wealth_documents: 'Dokumen Sumber Kekayaan', acting_for_other_party: 'Bertindak untuk Pihak Lain',
  name: 'Nama BO', relationship: 'Hubungan dengan BO', source_of_funds_and_wealth: 'Sumber Dana & Kekayaan BO',
  documents: 'Dokumen BO',
};

function fieldLabel(k: string): string {
  const parts = k.split('.');
  return parts.map((part) => FIELD_LABELS[part] ?? part.replaceAll('_', ' ')).join(' · ');
}

/** Nilai apa pun → teks yang aman ditampilkan. */
function displayValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.map(displayValue).join(', ') : '—';
  if (typeof v === 'object') return JSON.stringify(v, null, 2);
  return String(v);
}

function flatten(value: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      Object.assign(result, flatten(child as Record<string, unknown>, path));
    } else result[path] = child;
  }
  return result;
}

/** Nama berkas dari key/URI panjang, supaya kolom tidak melebar. */
function shortFile(v: unknown): string {
  const s = displayValue(v);
  if (s === '—') return s;
  const parts = s.split('/');
  return parts[parts.length - 1] || s;
}

function ValuePair({
  label,
  before,
  after,
  isFile,
}: {
  label: string;
  before: unknown;
  after: unknown;
  isFile?: boolean;
}) {
  const fmt = isFile ? shortFile : displayValue;
  return (
    <div className="grid gap-2 border-t border-slate-100 py-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)] sm:gap-3">
      <div className="text-xs font-medium text-slate-500 sm:pt-0.5">{label}</div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-400 sm:hidden">SEBELUM</div>
        <div className="whitespace-pre-wrap break-all text-sm text-slate-500 line-through decoration-slate-300">
          {fmt(before)}
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wide text-slate-400 sm:hidden">SESUDAH</div>
        <div className="whitespace-pre-wrap break-all text-sm font-medium text-emerald-700">{fmt(after)}</div>
      </div>
    </div>
  );
}

function ChangeCard({ change }: { change: DataReviewChange }) {
  const before = flatten(change.before_data ?? {});
  const after = flatten(change.after_data ?? {});
  const isDoc = change.entity_type === 'DOCUMENT';

  // Field yang ditampilkan = gabungan kunci before & after, supaya DELETE
  // (after kosong) dan ADD (before kosong) tetap terbaca.
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
    (k) => !k.startsWith('_') && k !== 'id',
  );

  const badge =
    change.operation === 'ADD'
      ? 'bg-emerald-100 text-emerald-700'
      : change.operation === 'DELETE'
        ? 'bg-red-100 text-red-700'
        : change.operation === 'REPLACE'
          ? 'bg-amber-100 text-amber-700'
          : 'bg-blue-100 text-blue-700';

  return (
    <div className="rounded-xl border p-4" data-change-id={change.id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-800">
            {entityTypeLabel(change.entity_type)}
          </span>
          <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badge}`}>
            {draftStateLabel(
              change.operation === 'ADD'
                ? 'ADDED'
                : change.operation === 'DELETE'
                  ? 'DELETED'
                  : change.operation === 'REPLACE'
                    ? 'REPLACED'
                    : 'UPDATED',
            )}
          </span>
        </div>
        {change.created_by_name && (
          <span className="text-xs text-slate-400">oleh {change.created_by_name}</span>
        )}
      </div>

      {/* Header kolom hanya di layar lebar; di mobile tiap nilai diberi label sendiri. */}
      <div className="mt-3 hidden grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)] gap-3 text-[10px] uppercase tracking-wide text-slate-400 sm:grid">
        <div>Field</div>
        <div>SEBELUM</div>
        <div>SESUDAH</div>
      </div>

      {keys.length === 0 ? (
        <p className="mt-2 text-sm text-slate-500">
          {change.operation === 'DELETE' ? 'Data ini diusulkan dihapus.' : 'Tidak ada rincian.'}
        </p>
      ) : (
        <div className="mt-1">
          {keys.map((k) => (
            <ValuePair
              key={k}
              label={fieldLabel(k)}
              before={(before as Record<string, unknown>)[k]}
              after={(after as Record<string, unknown>)[k]}
              isFile={isDoc && k === 'file_uri'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DataReviewDiff({ changes }: { changes: DataReviewChange[] }) {
  if (!changes || changes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-6 text-center text-sm text-slate-500">
        Belum ada usulan perubahan pada pengkinian data ini.
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="data-review-diff">
      {changes.map((c) => (
        <ChangeCard key={c.id} change={c} />
      ))}
    </div>
  );
}
