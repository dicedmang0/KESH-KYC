"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { updateBusinessApplication, type BusinessIdentityPayload } from "@/lib/applications";
import { toast } from "@/lib/toast";
import { isLainnya } from "@/lib/utils";
import LainnyaField from "@/components/lainnya-field";

/**
 * Edit "Informasi Identitas Badan Usaha" of an existing application via
 * PATCH /applications/:id/business (DRAFT + REVISION_REQUIRED only).
 *
 * Deliberately not shared with the create wizard's Step 1: that step also owns
 * application creation and its own step flow. If the two field sets drift far
 * apart, extract the field grid from both into one component.
 */

type RefItem = { code: string; name: string };

/** Every field is held as a string so validation and change-diffing stay uniform. */
type FormState = Record<string, string>;

export type BusinessIdentity = {
  legal_name?: string | null;
  legal_form?: string | null;
  legal_form_other?: string | null;
  deed_number?: string | null;
  deed_establishment_number?: string | null;
  deed_latest_amendment_number?: string | null;
  incorporation_place?: string | null;
  incorporation_date?: string | null;
  business_license_number?: string | null;
  nib?: string | null;
  npwp?: string | null;
  address_line?: string | null;
  city?: string | null;
  province?: string | null;
  business_province_code?: string | null;
  business_city_code?: string | null;
  postal_code?: string | null;
  business_activity?: string | null;
  business_activity_other?: string | null;
  industry_code?: string | null;
  phone?: string | null;
  company_email?: string | null;
  pic_name?: string | null;
  pic_position?: string | null;
  pic_identity_number?: string | null;
  pic_identity_type?: string | null;
  source_of_funds?: string | null;
  source_of_funds_other?: string | null;
  business_relationship_purpose?: string | null;
  business_relationship_purpose_other?: string | null;
  distribution_channel?: string | null;
  director_share_percentage?: number | string | null;
  commissioner_share_percentage?: number | string | null;
};

const FALLBACK_LEGAL_FORMS = [
  "PT", "CV", "FIRMA", "KOPERASI", "YAYASAN", "PERKUMPULAN", "PERORANGAN", "BUMN_BUMD", "LAINNYA",
];

/** Fields the backend refuses to blank out (they are required at create). */
const REQUIRED_FIELDS: Array<[key: string, label: string]> = [
  ["legal_name", "Nama Badan Usaha"],
  ["legal_form", "Bentuk Badan Usaha"],
  ["incorporation_place", "Tempat Pendirian"],
  ["incorporation_date", "Tanggal Pendirian"],
  ["npwp", "NPWP Badan Usaha"],
  ["address_line", "Alamat Kedudukan"],
  ["city", "Kota / Kabupaten"],
  ["province", "Provinsi"],
  ["postal_code", "Kode Pos"],
  ["business_activity", "Bidang Usaha"],
  ["phone", "Nomor Telepon Perusahaan"],
];

function s(v: unknown): string {
  return v === null || v === undefined ? "" : String(v);
}

/**
 * incorporation_date is a DATE column serialised as a UTC instant, so it must
 * be read back in Asia/Jakarta or the <input type="date"> shows the day before.
 */
function toDateInput(v?: string | null): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v).slice(0, 10);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });
}

function toRefList(r: unknown): RefItem[] {
  if (Array.isArray(r)) return r as RefItem[];
  if (r && typeof r === "object" && "data" in r && Array.isArray((r as { data: unknown }).data)) {
    return (r as { data: RefItem[] }).data;
  }
  return [];
}

function initialState(b: BusinessIdentity): FormState {
  return {
    legal_name: s(b.legal_name),
    legal_form: s(b.legal_form),
    legal_form_other: s(b.legal_form_other),
    // Data lama hanya punya deed_number — pakai sebagai No. Akta Pendirian.
    deed_establishment_number: s(b.deed_establishment_number || b.deed_number),
    deed_latest_amendment_number: s(b.deed_latest_amendment_number),
    incorporation_place: s(b.incorporation_place),
    incorporation_date: toDateInput(b.incorporation_date),
    business_license_number: s(b.business_license_number || b.nib),
    npwp: s(b.npwp),
    address_line: s(b.address_line),
    city: s(b.city),
    province: s(b.province),
    business_province_code: s(b.business_province_code),
    business_city_code: s(b.business_city_code),
    postal_code: s(b.postal_code),
    business_activity: s(b.business_activity),
    business_activity_other: s(b.business_activity_other),
    industry_code: s(b.industry_code),
    phone: s(b.phone),
    company_email: s(b.company_email),
    pic_name: s(b.pic_name),
    pic_position: s(b.pic_position),
    pic_identity_number: s(b.pic_identity_number),
    pic_identity_type: s(b.pic_identity_type),
    source_of_funds: s(b.source_of_funds),
    source_of_funds_other: s(b.source_of_funds_other),
    business_relationship_purpose: s(b.business_relationship_purpose),
    business_relationship_purpose_other: s(b.business_relationship_purpose_other),
    distribution_channel: s(b.distribution_channel),
    director_share_percentage: s(b.director_share_percentage),
    commissioner_share_percentage: s(b.commissioner_share_percentage),
  };
}

const NUMERIC_FIELDS = new Set(["director_share_percentage", "commissioner_share_percentage"]);

const INPUT_CLASS = "w-full min-w-0 rounded-md border px-3 py-2 text-sm";

/**
 * Module scope on purpose — nested inside the form it would get a fresh
 * identity on every keystroke, remounting the input and dropping focus.
 */
function Text({
  label,
  field,
  value,
  onChange,
  required,
  type = "text",
  ...rest
}: {
  label: string;
  field: string;
  value: string;
  onChange: (field: string, value: string) => void;
  required?: boolean;
  type?: string;
  maxLength?: number;
  inputMode?: "numeric";
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1 min-w-0">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        id={`biz-${field}`}
        type={type}
        className={INPUT_CLASS}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        {...rest}
      />
    </label>
  );
}

export default function BusinessIdentityForm({
  appId,
  business,
  onSaved,
  onCancel,
}: {
  appId: number | string;
  business: BusinessIdentity;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const initial = useMemo(() => initialState(business), [business]);
  const [form, setForm] = useState<FormState>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const [legalForms, setLegalForms] = useState<RefItem[]>([]);
  const [industries, setIndustries] = useState<RefItem[]>([]);
  const [sofList, setSofList] = useState<RefItem[]>([]);
  const [purposeList, setPurposeList] = useState<RefItem[]>([]);
  const [distList, setDistList] = useState<RefItem[]>([]);
  const [provinces, setProvinces] = useState<RefItem[]>([]);
  const [regencies, setRegencies] = useState<RefItem[]>([]);

  const set = (key: string, value: string) => setForm((f) => ({ ...f, [key]: value }));

  useEffect(() => {
    Promise.all([
      apiFetch<unknown>("/references/rba/business-forms"),
      apiFetch<unknown>("/references/industry-categories"),
      apiFetch<unknown>("/references/rba/source-of-funds"),
      apiFetch<unknown>("/references/rba/business-purposes"),
      apiFetch<unknown>("/references/rba/distributions"),
      apiFetch<unknown>("/references/provinces"),
    ])
      .then(([bf, ind, sof, bp, dist, prov]) => {
        setLegalForms(toRefList(bf));
        setIndustries(toRefList(ind));
        setSofList(toRefList(sof));
        setPurposeList(toRefList(bp));
        setDistList(toRefList(dist));
        setProvinces(toRefList(prov));
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.business_province_code) {
      setRegencies([]);
      return;
    }
    apiFetch<unknown>(
      `/references/regencies?province_code=${encodeURIComponent(form.business_province_code)}`,
    )
      .then((r) => setRegencies(toRefList(r)))
      .catch(() => setRegencies([]));
  }, [form.business_province_code]);

  const isPT = form.legal_form.trim().replace(/\.$/, "").toUpperCase() === "PT";

  /** Client-side mirror of the backend's rules — the API stays the authority. */
  function validate(): string {
    for (const [key, label] of REQUIRED_FIELDS) {
      if (!form[key].trim()) return `${label} wajib diisi.`;
    }
    if (!/^\d{15}$/.test(form.npwp.trim())) return "NPWP Badan Usaha wajib 15 digit angka.";
    if (isPT && !form.deed_establishment_number.trim()) {
      return "Nomor Akta Pendirian wajib diisi untuk badan usaha PT.";
    }
    if (form.pic_identity_number.trim().length > 16) return "Nomor Identitas maksimal 16 karakter.";
    if (form.pic_identity_type && !["KTP", "PASPOR"].includes(form.pic_identity_type)) {
      return "Jenis Identitas PIC hanya KTP atau Paspor.";
    }
    for (const [key, label] of [
      ["director_share_percentage", "Porsi Saham Direktur Utama"],
      ["commissioner_share_percentage", "Porsi Saham Komisaris"],
    ] as const) {
      const raw = form[key].trim();
      if (raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > 100) return `${label} harus angka antara 0 dan 100.`;
    }
    for (const [main, other, label] of [
      ["legal_form", "legal_form_other", "Bentuk Badan Usaha"],
      ["business_activity", "business_activity_other", "Bidang Usaha"],
      ["source_of_funds", "source_of_funds_other", "Sumber Dana"],
      ["business_relationship_purpose", "business_relationship_purpose_other", "Tujuan Hubungan Bisnis"],
    ] as const) {
      if (isLainnya(form[main]) && !form[other].trim()) {
        return `Keterangan ${label} Lainnya wajib diisi.`;
      }
    }
    return "";
  }

  /** Only fields the user actually touched — the endpoint is a partial patch. */
  function buildPayload(): BusinessIdentityPayload {
    const payload: Record<string, unknown> = {};
    for (const key of Object.keys(form)) {
      const value = form[key].trim();
      if (value === initial[key].trim()) continue;
      if (NUMERIC_FIELDS.has(key)) payload[key] = value === "" ? null : Number(value);
      else payload[key] = value === "" ? null : value;
    }
    return payload as BusinessIdentityPayload;
  }

  async function save() {
    const message = validate();
    if (message) {
      setErr(message);
      toast.error(message);
      return;
    }
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) {
      toast.error("Tidak ada perubahan untuk disimpan.");
      return;
    }
    setErr("");
    setSaving(true);
    try {
      await updateBusinessApplication(appId, payload);
      toast.success("Identitas badan usaha tersimpan.");
      await onSaved();
    } catch (e: unknown) {
      // Surface the backend's own validation message verbatim.
      const message = e instanceof Error ? e.message : "Gagal menyimpan identitas badan usaha";
      setErr(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  const input = INPUT_CLASS;

  return (
    <div className="space-y-4">
      {err && <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{err}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        <Text label="Nama Badan Usaha" field="legal_name" value={form.legal_name} onChange={set} required />
        <div className="grid gap-1 min-w-0">
          <span className="text-sm font-medium">Bentuk Badan Usaha <span className="text-red-500">*</span></span>
          <select
            id="biz-legal_form"
            className={input}
            value={form.legal_form}
            onChange={(e) => set("legal_form", e.target.value)}
          >
            <option value="">— Pilih —</option>
            {(legalForms.length
              ? legalForms
              : FALLBACK_LEGAL_FORMS.map((f) => ({ code: f, name: f }))
            ).map((f) => (
              <option key={f.code} value={f.code}>{f.name}</option>
            ))}
            {form.legal_form &&
              !legalForms.some((f) => f.code === form.legal_form) &&
              !FALLBACK_LEGAL_FORMS.includes(form.legal_form) && (
                <option value={form.legal_form}>{form.legal_form}</option>
              )}
          </select>
          <LainnyaField
            when={form.legal_form}
            value={form.legal_form_other}
            onChange={(v) => set("legal_form_other", v)}
            label="Keterangan Bentuk Badan Usaha Lainnya"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Text label="No. Akta Pendirian" field="deed_establishment_number" value={form.deed_establishment_number} onChange={set} required={isPT} />
        <Text label="No. Akta Perubahan Terakhir" field="deed_latest_amendment_number" value={form.deed_latest_amendment_number} onChange={set} />
        <Text label="Tanggal Pendirian" field="incorporation_date" value={form.incorporation_date} onChange={set} type="date" required />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Text label="Tempat Pendirian" field="incorporation_place" value={form.incorporation_place} onChange={set} required />
        <Text label="Nomor Izin Usaha (NIB/OSS/SIUP/dll)" field="business_license_number" value={form.business_license_number} onChange={set} />
        <Text
          label="NPWP Badan Usaha"
          field="npwp" value={form.npwp} onChange={set}
          required
          maxLength={15}
          inputMode="numeric"
          placeholder="15 digit angka"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Text label="KBLI (opsional)" field="industry_code" value={form.industry_code} onChange={set} />
        <div className="grid gap-1 min-w-0 md:col-span-2">
          <span className="text-sm font-medium">Bidang Usaha <span className="text-red-500">*</span></span>
          <select
            id="biz-business_activity"
            className={input}
            value={form.business_activity}
            onChange={(e) => set("business_activity", e.target.value)}
          >
            <option value="">— Pilih bidang usaha —</option>
            {industries.map((i) => (
              <option key={i.code} value={i.name}>{i.name}</option>
            ))}
            {form.business_activity && !industries.some((i) => i.name === form.business_activity) && (
              <option value={form.business_activity}>{form.business_activity}</option>
            )}
          </select>
          <LainnyaField
            when={form.business_activity}
            value={form.business_activity_other}
            onChange={(v) => set("business_activity_other", v)}
            label="Keterangan Bidang Usaha Lainnya"
          />
        </div>
      </div>

      <label className="grid gap-1 min-w-0">
        <span className="text-sm font-medium">Alamat Kedudukan <span className="text-red-500">*</span></span>
        <textarea
          id="biz-address_line"
          className={input}
          rows={2}
          value={form.address_line}
          onChange={(e) => set("address_line", e.target.value)}
        />
      </label>

      <div className="grid gap-4 md:grid-cols-3">
        <label className="grid gap-1 min-w-0">
          <span className="text-sm font-medium">Provinsi <span className="text-red-500">*</span></span>
          <select
            id="biz-province"
            className={`${input} bg-white`}
            value={form.business_province_code}
            onChange={(e) => {
              const code = e.target.value;
              // The plain `province`/`city` text columns are required by the
              // backend, so keep them in step with the dropdown codes.
              setForm((f) => ({
                ...f,
                business_province_code: code,
                province: provinces.find((p) => p.code === code)?.name || "",
                business_city_code: "",
                city: "",
              }));
            }}
          >
            <option value="">— Pilih Provinsi —</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
          {!form.business_province_code && form.province && (
            <span className="text-xs text-slate-500">Tersimpan: {form.province}</span>
          )}
        </label>
        <label className="grid gap-1 min-w-0">
          <span className="text-sm font-medium">Kota / Kabupaten <span className="text-red-500">*</span></span>
          <select
            id="biz-city"
            className={`${input} bg-white disabled:bg-slate-50`}
            value={form.business_city_code}
            disabled={!form.business_province_code}
            onChange={(e) => {
              const code = e.target.value;
              setForm((f) => ({
                ...f,
                business_city_code: code,
                city: regencies.find((r) => r.code === code)?.name || "",
              }));
            }}
          >
            <option value="">— Pilih Kota/Kabupaten —</option>
            {regencies.map((r) => (
              <option key={r.code} value={r.code}>{r.name}</option>
            ))}
          </select>
          {!form.business_city_code && form.city && (
            <span className="text-xs text-slate-500">Tersimpan: {form.city}</span>
          )}
        </label>
        <Text label="Kode Pos" field="postal_code" value={form.postal_code} onChange={set} required />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Text label="Nomor Telepon Perusahaan" field="phone" value={form.phone} onChange={set} required />
        <Text label="Email Perusahaan" field="company_email" value={form.company_email} onChange={set} type="email" />
      </div>

      <div className="border-t pt-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Pengurus Utama / PIC</p>
        <div className="grid gap-4 md:grid-cols-2">
          <Text label="Nama Pengurus Utama / PIC" field="pic_name" value={form.pic_name} onChange={set} />
          <Text label="Jabatan" field="pic_position" value={form.pic_position} onChange={set} />
          <Text label="Nomor Identitas PIC" field="pic_identity_number" value={form.pic_identity_number} onChange={set} maxLength={16} />
          <label className="grid gap-1 min-w-0">
            <span className="text-sm font-medium">Jenis Identitas PIC</span>
            <select
              id="biz-pic_identity_type"
              className={input}
              value={form.pic_identity_type}
              onChange={(e) => set("pic_identity_type", e.target.value)}
            >
              <option value="">— Pilih —</option>
              <option value="KTP">KTP</option>
              <option value="PASPOR">Paspor</option>
            </select>
          </label>
        </div>
      </div>

      <div className="border-t pt-4">
        <p className="mb-3 text-sm font-semibold text-slate-700">Informasi Hubungan Bisnis (RBA)</p>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-1 min-w-0">
            <span className="text-sm font-medium">Sumber Dana</span>
            <select
              id="biz-source_of_funds"
              className={input}
              value={form.source_of_funds}
              onChange={(e) => set("source_of_funds", e.target.value)}
            >
              <option value="">— Pilih —</option>
              {sofList.map((o) => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
              {form.source_of_funds && !sofList.some((o) => o.code === form.source_of_funds) && (
                <option value={form.source_of_funds}>{form.source_of_funds}</option>
              )}
            </select>
            <LainnyaField
              when={form.source_of_funds}
              value={form.source_of_funds_other}
              onChange={(v) => set("source_of_funds_other", v)}
              label="Keterangan Sumber Dana Lainnya"
            />
          </div>
          <div className="grid gap-1 min-w-0">
            <span className="text-sm font-medium">Tujuan Hubungan Bisnis</span>
            <select
              id="biz-business_relationship_purpose"
              className={input}
              value={form.business_relationship_purpose}
              onChange={(e) => set("business_relationship_purpose", e.target.value)}
            >
              <option value="">— Pilih —</option>
              {purposeList.map((o) => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
              {form.business_relationship_purpose &&
                !purposeList.some((o) => o.code === form.business_relationship_purpose) && (
                  <option value={form.business_relationship_purpose}>
                    {form.business_relationship_purpose}
                  </option>
                )}
            </select>
            <LainnyaField
              when={form.business_relationship_purpose}
              value={form.business_relationship_purpose_other}
              onChange={(v) => set("business_relationship_purpose_other", v)}
              label="Keterangan Tujuan Hubungan Bisnis Lainnya"
            />
          </div>
          <label className="grid gap-1 min-w-0">
            <span className="text-sm font-medium">Saluran Distribusi</span>
            <select
              id="biz-distribution_channel"
              className={input}
              value={form.distribution_channel}
              onChange={(e) => set("distribution_channel", e.target.value)}
            >
              <option value="">— Pilih —</option>
              {distList.map((o) => (
                <option key={o.code} value={o.code}>{o.name}</option>
              ))}
              {form.distribution_channel &&
                !distList.some((o) => o.code === form.distribution_channel) && (
                  <option value={form.distribution_channel}>{form.distribution_channel}</option>
                )}
            </select>
          </label>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 border-t pt-4">
        <Text
          label="Porsi Saham Direktur Utama (%)"
          field="director_share_percentage" value={form.director_share_percentage} onChange={set}
          type="number"
          placeholder="0 - 100"
        />
        <Text
          label="Porsi Saham Komisaris (%)"
          field="commissioner_share_percentage" value={form.commissioner_share_percentage} onChange={set}
          type="number"
          placeholder="0 - 100"
        />
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Batal
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-50"
        >
          {saving ? "Menyimpan…" : "Simpan Identitas"}
        </button>
      </div>
    </div>
  );
}
