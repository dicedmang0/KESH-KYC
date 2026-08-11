'use client';

// Full customer detail for a complaint, in a modal.
//
// ComplaintHandling has no /users menu and is 403 on /transfers/:id, but
// GET /applications/:id carries no @Roles on the backend — so the data behind a
// complaint's customer is readable by every role that can open the ticket. This
// modal is how they read it, without sending them to a route their menu hides.

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { formatCif } from '@/lib/utils';
import { formatDateTime } from '@/lib/monitoring';

type Application = {
  id: number | string;
  public_id?: string | null;
  type?: 'INDIVIDUAL' | 'BUSINESS' | null;
  status?: string | null;
  created_at?: string | null;
  submitted_at?: string | null;
};

type Person = {
  full_name?: string | null;
  identity_type?: string | null;
  identity_number?: string | null;
  pob?: string | null;
  dob?: string | null;
  gender?: string | null;
  nationality?: string | null;
  phone?: string | null;
  email?: string | null;
  occupation?: string | null;
  company_name?: string | null;
  monthly_income_range?: string | null;
  source_of_funds?: string | null;
  address_identity?: string | null;
  address_residential?: string | null;
  province_name?: string | null;
  city_name?: string | null;
  district_name?: string | null;
  village_name?: string | null;
  cif_no?: string | null;
  cif_relationship_type?: string | null;
};

type Business = {
  legal_name?: string | null;
  business_type?: string | null;
  npwp?: string | null;
  business_license_no?: string | null;
  establishment_date?: string | null;
  phone?: string | null;
  email?: string | null;
  address_line?: string | null;
  business_province_name?: string | null;
  business_city_name?: string | null;
  business_district_name?: string | null;
  business_village_name?: string | null;
  postal_code?: string | null;
  cif_no?: string | null;
};

type RiskRecord = { risk_level?: string | null; total_score?: number | string | null };

type DetailResponse = {
  application: Application;
  person?: Person | null;
  business?: Business | null;
  risk?: RiskRecord | null;
};

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <div>
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-sm font-medium text-slate-800 break-words">
        {empty ? <span className="font-normal text-slate-400">—</span> : value}
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function ComplaintCustomerModal({
  applicationId,
  onClose,
}: {
  applicationId: number | string;
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailResponse | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    apiFetch<DetailResponse>(`/applications/${applicationId}`)
      .then((d) => { if (alive) setData(d); })
      .catch((e: unknown) => {
        if (alive) setErr(e instanceof Error ? e.message : 'Gagal memuat data pengguna jasa.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [applicationId]);

  // Esc closes, same as clicking the backdrop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const app = data?.application;
  const person = data?.person;
  const business = data?.business;
  const isBusiness = app?.type === 'BUSINESS' || (!person && !!business);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Data Pengguna Jasa"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-3xl space-y-5 rounded-xl bg-white p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Data Pengguna Jasa</h2>
            <p className="text-xs text-slate-500">
              Data lengkap dari pengajuan KYC/KYB yang tertaut ke pengaduan ini.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            Tutup
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Memuat data pengguna jasa…</p>
        ) : err ? (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{err}</div>
        ) : (
          <div className="space-y-5">
            <Group title="Identitas Pengajuan">
              <Field label="Jenis" value={isBusiness ? 'Badan Usaha (KYB)' : 'Perorangan (KYC)'} />
              <Field label="Status Pengajuan" value={app?.status} />
              <Field
                label="CIF"
                value={<span className="font-mono">{formatCif(person?.cif_no ?? business?.cif_no)}</span>}
              />
              <Field label="Tingkat Risiko" value={data?.risk?.risk_level} />
              {/* Identitas teknis sekunder — ID numerik internal tidak ditampilkan. */}
              <Field
                label="Public ID"
                value={app?.public_id ? <span className="font-mono text-xs break-all">{app.public_id}</span> : undefined}
              />
              <Field label="Tanggal Pengajuan" value={app?.created_at ? formatDateTime(app.created_at) : undefined} />
            </Group>

            {isBusiness ? (
              <>
                <Group title="Identitas Badan Usaha">
                  <Field label="Nama Badan Usaha" value={business?.legal_name} />
                  <Field label="Bentuk Badan Usaha" value={business?.business_type} />
                  <Field label="NPWP" value={business?.npwp} />
                  <Field label="Nomor Izin Usaha" value={business?.business_license_no} />
                  <Field label="Tanggal Pendirian" value={business?.establishment_date} />
                  <Field label="Telepon" value={business?.phone} />
                  <Field label="Email" value={business?.email} />
                </Group>
                <Group title="Alamat">
                  <Field label="Alamat" value={business?.address_line} />
                  <Field label="Provinsi" value={business?.business_province_name} />
                  <Field label="Kota / Kabupaten" value={business?.business_city_name} />
                  <Field label="Kecamatan" value={business?.business_district_name} />
                  <Field label="Kelurahan / Desa" value={business?.business_village_name} />
                  <Field label="Kode Pos" value={business?.postal_code} />
                </Group>
              </>
            ) : (
              <>
                <Group title="Identitas Perorangan">
                  <Field label="Nama Lengkap" value={person?.full_name} />
                  <Field label="Jenis Identitas" value={person?.identity_type} />
                  <Field label="Nomor Identitas" value={person?.identity_number} />
                  <Field label="Tempat / Tanggal Lahir" value={[person?.pob, person?.dob].filter(Boolean).join(', ') || undefined} />
                  <Field label="Jenis Kelamin" value={person?.gender} />
                  <Field label="Kewarganegaraan" value={person?.nationality} />
                  <Field label="Telepon" value={person?.phone} />
                  <Field label="Email" value={person?.email} />
                  <Field label="Hubungan CIF" value={person?.cif_relationship_type} />
                </Group>
                <Group title="Pekerjaan & Profil Keuangan">
                  <Field label="Pekerjaan" value={person?.occupation} />
                  <Field label="Nama Perusahaan" value={person?.company_name} />
                  <Field label="Rentang Penghasilan" value={person?.monthly_income_range} />
                  <Field label="Sumber Dana" value={person?.source_of_funds} />
                </Group>
                <Group title="Alamat">
                  <Field label="Alamat Identitas" value={person?.address_identity} />
                  <Field label="Alamat Domisili" value={person?.address_residential} />
                  <Field label="Provinsi" value={person?.province_name} />
                  <Field label="Kota / Kabupaten" value={person?.city_name} />
                  <Field label="Kecamatan" value={person?.district_name} />
                  <Field label="Kelurahan / Desa" value={person?.village_name} />
                </Group>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
