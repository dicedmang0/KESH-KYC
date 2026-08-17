'use client';

// Field CDD Individual lengkap, dengan state & referensi sendiri, dan penyimpanan
// yang DISUNTIKKAN lewat prop `save`. Itu yang membuatnya bisa dipakai dua konteks:
//
//   NORMAL_CDD        → save = PATCH /applications/:id   (data live)
//   DATA_REVIEW_DRAFT → save = staging change-set        (usulan, belum berlaku)
//
// Komponen ini tidak tahu bedanya — konteks/route yang memilih adapter
// (lihat lib/data-review-drafts.ts: normalCddAdapter / dataReviewDraftAdapter).
//
// Payload = HANYA field yang benar-benar berubah dari `initial`, pola yang sama
// dengan business-identity-form.tsx. Cocok untuk endpoint patch maupun change-set.

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { isLainnya } from '@/lib/utils';
import LainnyaField from '@/components/lainnya-field';

type RefItem = { code?: string; name?: string; id?: string | number };

/** Response referensi kadang array polos, kadang {data:[…]}. */
function toList(r: unknown): RefItem[] {
  if (Array.isArray(r)) return r as RefItem[];
  if (r && typeof r === 'object' && 'data' in r && Array.isArray((r as { data: unknown }).data)) {
    return (r as { data: RefItem[] }).data;
  }
  return [];
}

/**
 * Kolom yang dirender komponen ini. Wajib berada di dalam allow-list backend
 * (PERSON_EDITABLE_COLUMNS) — backend tetap otoritatif dan menolak sisanya 400.
 */
export const PERSON_CDD_FIELD_KEYS = [
  'full_name', 'alias', 'ktp_number', 'sim_number', 'passport_number',
  'identity_type', 'identity_number', 'pob', 'dob', 'gender', 'nationality',
  'phone', 'email',
  'address_identity', 'address_residential',
  'province_code', 'province_name', 'city_code', 'city_name',
  'district_code', 'district_name', 'village_code', 'village_name',
  'street_address', 'house_number', 'rt_rw', 'apartment_block', 'address_landmark',
  'occupation', 'occupation_other', 'industry_category', 'industry_category_other',
  'company_name', 'company_address', 'monthly_income_range',
  'source_of_funds', 'source_of_funds_other',
  'business_relationship_purpose', 'business_relationship_purpose_other',
  'distribution_channel',
  'wic_transaction_purpose', 'wic_transaction_purpose_other',
  'wic_recipient_relationship', 'wic_recipient_relationship_other',
  'signature_uri',
  'pep_self_declared',
] as const;

type FieldKey = (typeof PERSON_CDD_FIELD_KEYS)[number];
type FormState = Record<string, string>;

type PersonFieldContextValue = {
  compareTo: Record<string, unknown> | null;
  form: FormState;
  initial: FormState;
};

const PersonFieldContext = createContext<PersonFieldContextValue | null>(null);

/**
 * This wrapper must stay at module scope. Defining it inside PersonCddFields
 * creates a new React component type after every local state update, which
 * remounts every wrapped input and drops focus after the first character.
 */
function F({ k, children }: { k: FieldKey; children: React.ReactNode }) {
  const context = useContext(PersonFieldContext);
  let hint: React.ReactNode = null;
  if (context?.compareTo) {
    const live = context.compareTo[k];
    const shown = live == null || live === '' ? '—' : String(live);
    const liveValue = live == null ? '' : String(live);
    const changed = (context.form[k] ?? '') !== (context.initial[k] ?? '')
      || (context.initial[k] ?? '') !== liveValue;
    if (changed) {
      hint = <p className="mt-0.5 break-words text-[11px] text-slate-400">Berlaku saat ini: {shown}</p>;
    }
  }
  return <div className="min-w-0">{children}{hint}</div>;
}

function toForm(person: Record<string, unknown> | null | undefined): FormState {
  const f: FormState = {};
  for (const k of PERSON_CDD_FIELD_KEYS) {
    const v = person?.[k];
    // dob datang sebagai ISO — <input type="date"> hanya menerima YYYY-MM-DD.
    if (k === 'dob' && typeof v === 'string' && v.length > 10) f[k] = v.slice(0, 10);
    else if (k === 'pep_self_declared') f[k] = v === true ? 'true' : v === false ? 'false' : '';
    else f[k] = v == null ? '' : String(v);
  }
  return f;
}

function Text({
  id, label, value, onChange, disabled, required, placeholder, type = 'text',
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  disabled?: boolean; required?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-slate-500">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-md border px-2 py-1.5 text-sm disabled:bg-slate-50"
      />
    </div>
  );
}

function Select({
  id, label, value, onChange, options, disabled, placeholder = '— Pilih —',
}: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[]; disabled?: boolean; placeholder?: string;
}) {
  const hasCurrent = !value || options.some((o) => o.value === value);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs text-slate-500">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-md border px-2 py-1.5 text-sm bg-white disabled:bg-slate-50"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        {/* Nilai lama yang tidak ada di daftar referensi tetap terlihat, tidak hilang diam-diam. */}
        {!hasCurrent && <option value={value}>{value}</option>}
      </select>
    </div>
  );
}

export type PersonCddFieldsProps = {
  person: Record<string, unknown> | null;
  /** Adapter penyimpanan — menentukan tulisan masuk ke data live atau ke draft. */
  save: (patch: Record<string, unknown>) => Promise<unknown>;
  onSaved?: () => void | Promise<void>;
  disabled?: boolean;
  /** Nilai live untuk ditampilkan sebagai pembanding (dipakai di konteks draft). */
  compareTo?: Record<string, unknown> | null;
  submitLabel?: string;
};

export default function PersonCddFields({
  person,
  save,
  onSaved,
  disabled = false,
  compareTo = null,
  submitLabel = 'Simpan Data',
}: PersonCddFieldsProps) {
  const initial = useMemo(() => toForm(person), [person]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const [provinces, setProvinces] = useState<RefItem[]>([]);
  const [regencies, setRegencies] = useState<RefItem[]>([]);
  const [districts, setDistricts] = useState<RefItem[]>([]);
  const [villages, setVillages] = useState<RefItem[]>([]);
  const [nationalities, setNationalities] = useState<RefItem[]>([]);
  const [industryCategories, setIndustryCategories] = useState<RefItem[]>([]);
  const [incomeRanges, setIncomeRanges] = useState<RefItem[]>([]);
  const [occupations, setOccupations] = useState<RefItem[]>([]);
  const [sourceOfFunds, setSourceOfFunds] = useState<RefItem[]>([]);
  const [businessPurposes, setBusinessPurposes] = useState<RefItem[]>([]);
  const [distributions, setDistributions] = useState<RefItem[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<unknown>('/references/provinces'),
      apiFetch<unknown>('/references/nationalities'),
      apiFetch<unknown>('/references/industry-categories'),
      apiFetch<unknown>('/references/monthly-income-ranges'),
      apiFetch<unknown>('/references/rba/occupations'),
      apiFetch<unknown>('/references/rba/source-of-funds'),
      apiFetch<unknown>('/references/rba/business-purposes'),
      apiFetch<unknown>('/references/rba/distributions'),
    ])
      .then(([prov, nat, ind, inc, occ, sof, purpose, dist]) => {
        setProvinces(toList(prov));
        setNationalities(toList(nat));
        setIndustryCategories(toList(ind));
        setIncomeRanges(toList(inc));
        setOccupations(toList(occ));
        setSourceOfFunds(toList(sof));
        setBusinessPurposes(toList(purpose));
        setDistributions(toList(dist));
      })
      .catch(() => {});
  }, []);

  // ── Cascade wilayah: provinsi → kota → kecamatan → kelurahan ──────────────
  useEffect(() => {
    if (!form.province_code) { setRegencies([]); return; }
    apiFetch<unknown>(`/references/regencies?province_code=${encodeURIComponent(form.province_code)}`)
      .then((r) => setRegencies(toList(r)))
      .catch(() => setRegencies([]));
  }, [form.province_code]);

  useEffect(() => {
    if (!form.city_code) { setDistricts([]); return; }
    apiFetch<unknown>(`/references/districts?regency_code=${encodeURIComponent(form.city_code)}`)
      .then((r) => setDistricts(toList(r)))
      .catch(() => setDistricts([]));
  }, [form.city_code]);

  useEffect(() => {
    if (!form.district_code) { setVillages([]); return; }
    apiFetch<unknown>(`/references/villages?district_code=${encodeURIComponent(form.district_code)}`)
      .then((r) => setVillages(toList(r)))
      .catch(() => setVillages([]));
  }, [form.district_code]);

  function set(k: FieldKey, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  /** Memilih wilayah menulis code DAN name sekaligus; level di bawahnya direset. */
  function setRegion(
    level: 'province' | 'city' | 'district' | 'village',
    code: string,
    list: RefItem[],
  ) {
    const name = list.find((x) => String(x.code) === code)?.name ?? '';
    setForm((s) => {
      const next = { ...s, [`${level}_code`]: code, [`${level}_name`]: name };
      if (level === 'province') Object.assign(next, { city_code: '', city_name: '', district_code: '', district_name: '', village_code: '', village_name: '' });
      if (level === 'city') Object.assign(next, { district_code: '', district_name: '', village_code: '', village_name: '' });
      if (level === 'district') Object.assign(next, { village_code: '', village_name: '' });
      return next;
    });
  }

  const opts = (list: RefItem[], useName = false) =>
    list.map((o) => ({
      value: String(useName ? (o.name ?? '') : (o.code ?? o.name ?? o.id ?? '')),
      label: String(o.name ?? o.code ?? ''),
    }));

  function validate(): string {
    for (const [main, other, label] of [
      ['occupation', 'occupation_other', 'Pekerjaan'],
      ['industry_category', 'industry_category_other', 'Bidang Industri'],
      ['source_of_funds', 'source_of_funds_other', 'Sumber Dana'],
      ['business_relationship_purpose', 'business_relationship_purpose_other', 'Tujuan Hubungan Usaha'],
    ] as const) {
      if (isLainnya(form[main]) && !form[other]?.trim()) {
        return `Keterangan ${label} "Lainnya" wajib diisi.`;
      }
    }
    if (form.ktp_number && !/^\d{15,16}$/.test(form.ktp_number)) {
      return 'Nomor KTP harus 15–16 digit angka.';
    }
    return '';
  }

  /** Hanya field yang benar-benar berubah — sisanya bukan perubahan. */
  function buildPatch(): Record<string, unknown> {
    const patch: Record<string, unknown> = {};
    for (const k of PERSON_CDD_FIELD_KEYS) {
      const now = (form[k] ?? '').trim();
      const was = (initial[k] ?? '').trim();
      if (now === was) continue;
      if (k === 'pep_self_declared') patch[k] = now === '' ? null : now === 'true';
      else patch[k] = now === '' ? null : now;
    }
    return patch;
  }

  async function handleSave() {
    const message = validate();
    if (message) { setErr(message); return; }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      setErr('Tidak ada perubahan untuk disimpan.');
      return;
    }
    setErr('');
    setSaving(true);
    try {
      await save(patch);
      await onSaved?.();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : 'Gagal menyimpan data.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <PersonFieldContext.Provider value={{ compareTo, form, initial }}>
    <div className="space-y-5" data-testid="person-cdd-fields">
      {err && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <section className="space-y-3">
        <p className="border-b pb-1 text-xs font-semibold text-slate-600">Data Pribadi</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <F k="full_name"><Text id="draft-full_name" label="Nama Lengkap" value={form.full_name} onChange={(v) => set('full_name', v)} disabled={disabled} /></F>
          <F k="alias"><Text id="draft-alias" label="Alias" value={form.alias} onChange={(v) => set('alias', v)} disabled={disabled} placeholder="Nama alias (opsional)" /></F>
          <F k="pob"><Text id="draft-pob" label="Tempat Lahir" value={form.pob} onChange={(v) => set('pob', v)} disabled={disabled} /></F>
          <F k="dob"><Text id="draft-dob" label="Tanggal Lahir" type="date" value={form.dob} onChange={(v) => set('dob', v)} disabled={disabled} /></F>
          <F k="gender">
            <Select id="draft-gender" label="Jenis Kelamin" value={form.gender} disabled={disabled}
              onChange={(v) => set('gender', v)}
              options={[{ value: 'M', label: 'Laki-laki' }, { value: 'F', label: 'Perempuan' }, { value: 'O', label: 'Lainnya' }]} />
          </F>
          <F k="nationality">
            <Select id="draft-nationality" label="Kewarganegaraan" value={form.nationality} disabled={disabled}
              onChange={(v) => set('nationality', v)} options={opts(nationalities, true)} />
          </F>
          <F k="phone"><Text id="draft-phone" label="Telepon" value={form.phone} onChange={(v) => set('phone', v)} disabled={disabled} /></F>
          <F k="email"><Text id="draft-email" label="Email" value={form.email} onChange={(v) => set('email', v)} disabled={disabled} /></F>
        </div>
      </section>

      <section className="space-y-3">
        <p className="border-b pb-1 text-xs font-semibold text-slate-600">Identitas</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <F k="ktp_number"><Text id="draft-ktp_number" label="Nomor KTP" value={form.ktp_number} onChange={(v) => set('ktp_number', v.replace(/\D/g, ''))} disabled={disabled} /></F>
          <F k="sim_number"><Text id="draft-sim_number" label="Nomor SIM" value={form.sim_number} onChange={(v) => set('sim_number', v)} disabled={disabled} /></F>
          <F k="passport_number"><Text id="draft-passport_number" label="Nomor Paspor" value={form.passport_number} onChange={(v) => set('passport_number', v)} disabled={disabled} /></F>
          <F k="identity_type">
            <Select id="draft-identity_type" label="Jenis Identitas" value={form.identity_type} disabled={disabled}
              onChange={(v) => set('identity_type', v)}
              options={[{ value: 'KTP', label: 'KTP' }, { value: 'SIM', label: 'SIM' }, { value: 'PASPOR', label: 'Paspor' }, { value: 'LAINNYA', label: 'Lainnya' }]} />
          </F>
          <F k="identity_number"><Text id="draft-identity_number" label="Nomor Identitas" value={form.identity_number} onChange={(v) => set('identity_number', v)} disabled={disabled} /></F>
        </div>
      </section>

      <section className="space-y-3">
        <p className="border-b pb-1 text-xs font-semibold text-slate-600">Alamat</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <F k="address_identity"><Text id="draft-address_identity" label="Alamat Identitas" value={form.address_identity} onChange={(v) => set('address_identity', v)} disabled={disabled} /></F>
          <F k="address_residential"><Text id="draft-address_residential" label="Alamat Domisili" value={form.address_residential} onChange={(v) => set('address_residential', v)} disabled={disabled} /></F>
          <F k="province_code">
            <Select id="draft-province_code" label="Provinsi" value={form.province_code} disabled={disabled}
              onChange={(v) => setRegion('province', v, provinces)} options={opts(provinces)} />
          </F>
          <F k="city_code">
            <Select id="draft-city_code" label="Kota/Kabupaten" value={form.city_code} disabled={disabled || !form.province_code}
              onChange={(v) => setRegion('city', v, regencies)} options={opts(regencies)} />
          </F>
          <F k="district_code">
            <Select id="draft-district_code" label="Kecamatan" value={form.district_code} disabled={disabled || !form.city_code}
              onChange={(v) => setRegion('district', v, districts)} options={opts(districts)} />
          </F>
          <F k="village_code">
            <Select id="draft-village_code" label="Kelurahan/Desa" value={form.village_code} disabled={disabled || !form.district_code}
              onChange={(v) => setRegion('village', v, villages)} options={opts(villages)} />
          </F>
          <F k="street_address"><Text id="draft-street_address" label="Alamat Jalan" value={form.street_address} onChange={(v) => set('street_address', v)} disabled={disabled} /></F>
          <F k="house_number"><Text id="draft-house_number" label="Nomor Rumah" value={form.house_number} onChange={(v) => set('house_number', v)} disabled={disabled} /></F>
          <F k="rt_rw"><Text id="draft-rt_rw" label="RT/RW" value={form.rt_rw} onChange={(v) => set('rt_rw', v)} disabled={disabled} /></F>
          <F k="apartment_block"><Text id="draft-apartment_block" label="Blok/Apartemen" value={form.apartment_block} onChange={(v) => set('apartment_block', v)} disabled={disabled} /></F>
          <F k="address_landmark"><Text id="draft-address_landmark" label="Patokan Alamat" value={form.address_landmark} onChange={(v) => set('address_landmark', v)} disabled={disabled} /></F>
        </div>
      </section>

      <section className="space-y-3">
        <p className="border-b pb-1 text-xs font-semibold text-slate-600">Pekerjaan &amp; Profil Keuangan</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <F k="occupation">
            <Select id="draft-occupation" label="Pekerjaan" value={form.occupation} disabled={disabled}
              onChange={(v) => set('occupation', v)} options={opts(occupations, true)} />
            <LainnyaField when={form.occupation} value={form.occupation_other ?? ''} disabled={disabled}
              onChange={(v) => set('occupation_other', v)} label="Keterangan Pekerjaan Lainnya" />
          </F>
          <F k="industry_category">
            <Select id="draft-industry_category" label="Bidang Industri" value={form.industry_category} disabled={disabled}
              onChange={(v) => set('industry_category', v)} options={opts(industryCategories)} />
            <LainnyaField when={form.industry_category} value={form.industry_category_other ?? ''} disabled={disabled}
              onChange={(v) => set('industry_category_other', v)} label="Keterangan Bidang Industri Lainnya" />
          </F>
          <F k="company_name"><Text id="draft-company_name" label="Nama Perusahaan" value={form.company_name} onChange={(v) => set('company_name', v)} disabled={disabled} /></F>
          <F k="company_address"><Text id="draft-company_address" label="Alamat Perusahaan" value={form.company_address} onChange={(v) => set('company_address', v)} disabled={disabled} /></F>
          <F k="monthly_income_range">
            <Select id="draft-monthly_income_range" label="Rentang Penghasilan" value={form.monthly_income_range} disabled={disabled}
              onChange={(v) => set('monthly_income_range', v)} options={opts(incomeRanges, true)} />
          </F>
          <F k="source_of_funds">
            <Select id="draft-source_of_funds" label="Sumber Dana" value={form.source_of_funds} disabled={disabled}
              onChange={(v) => set('source_of_funds', v)} options={opts(sourceOfFunds, true)} />
            <LainnyaField when={form.source_of_funds} value={form.source_of_funds_other ?? ''} disabled={disabled}
              onChange={(v) => set('source_of_funds_other', v)} label="Keterangan Sumber Dana Lainnya" />
          </F>
          <F k="business_relationship_purpose">
            <Select id="draft-business_relationship_purpose" label="Tujuan Hubungan Usaha" value={form.business_relationship_purpose} disabled={disabled}
              onChange={(v) => set('business_relationship_purpose', v)} options={opts(businessPurposes, true)} />
            <LainnyaField when={form.business_relationship_purpose} value={form.business_relationship_purpose_other ?? ''} disabled={disabled}
              onChange={(v) => set('business_relationship_purpose_other', v)} label="Keterangan Tujuan Lainnya" />
          </F>
          <F k="distribution_channel">
            <Select id="draft-distribution_channel" label="Saluran Distribusi" value={form.distribution_channel} disabled={disabled}
              onChange={(v) => set('distribution_channel', v)} options={opts(distributions)} />
          </F>
          <F k="pep_self_declared">
            <Select id="draft-pep_self_declared" label="PEP (deklarasi mandiri)" value={form.pep_self_declared} disabled={disabled}
              onChange={(v) => set('pep_self_declared', v)}
              options={[{ value: 'true', label: 'Ya' }, { value: 'false', label: 'Tidak' }]} />
          </F>
          <F k="signature_uri"><Text id="draft-signature_uri" label="URI Tanda Tangan" value={form.signature_uri} onChange={(v) => set('signature_uri', v)} disabled={disabled} /></F>
        </div>
      </section>

      {/* Field WIC hanya relevan untuk pengguna jasa Walk-In Customer. */}
      {(
        <section className="space-y-3">
          <p className="border-b pb-1 text-xs font-semibold text-slate-600">Walk-In Customer</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <F k="wic_transaction_purpose">
              <Text id="draft-wic_transaction_purpose" label="Tujuan Transaksi" value={form.wic_transaction_purpose} onChange={(v) => set('wic_transaction_purpose', v)} disabled={disabled} />
              <LainnyaField when={form.wic_transaction_purpose} value={form.wic_transaction_purpose_other ?? ''} disabled={disabled}
                onChange={(v) => set('wic_transaction_purpose_other', v)} label="Keterangan Tujuan Transaksi Lainnya" />
            </F>
            <F k="wic_recipient_relationship">
              <Text id="draft-wic_recipient_relationship" label="Hubungan dengan Penerima" value={form.wic_recipient_relationship} onChange={(v) => set('wic_recipient_relationship', v)} disabled={disabled} />
              <LainnyaField when={form.wic_recipient_relationship} value={form.wic_recipient_relationship_other ?? ''} disabled={disabled}
                onChange={(v) => set('wic_recipient_relationship_other', v)} label="Keterangan Hubungan Lainnya" />
            </F>
          </div>
        </section>
      )}

      {!disabled && (
        <div className="flex items-center gap-3 border-t pt-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-kesh-700 px-4 py-1.5 text-sm text-white transition-colors hover:bg-kesh-600 disabled:opacity-50"
          >
            {saving ? 'Menyimpan…' : submitLabel}
          </button>
        </div>
      )}
    </div>
    </PersonFieldContext.Provider>
  );
}
