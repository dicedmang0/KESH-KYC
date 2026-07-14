"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/providers";
import { apiFetch } from "@/lib/api";
import BusinessWizard from "@/components/business-wizard";
import LainnyaField from "@/components/lainnya-field";
import { isLainnya } from "@/lib/utils";
import { toast } from "@/lib/toast";

import { Card, CardContent } from "@/components/ui/card";

type Kind = "INDIVIDUAL" | "BUSINESS";
type RefItem = { code: string; name: string };

function toRefList<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (
    r &&
    typeof r === "object" &&
    "data" in r &&
    Array.isArray((r as { data: unknown }).data)
  ) {
    return (r as { data: T[] }).data;
  }
  return [];
}

function NewApplicationPageInner() {
  const router = useRouter();
  const { token } = useAuth();
  const sp = useSearchParams();

  const kind = (
    sp.get("type")?.toUpperCase() === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL"
  ) as Kind;

  const [loading, setLoading] = useState(false);
  const [i_cif_relationship_type, setICifRelationshipType] = useState<
    "OUR_CUSTOMER" | "WIC"
  >("OUR_CUSTOMER");
  const isWic = i_cif_relationship_type === "WIC";

  // ── WIC / Walk-In Customer minimum CDD fields ─────────────────────────────
  const [i_identity_type, setIIdentityType] = useState<
    "KTP" | "SIM" | "PASPOR"
  >("KTP");
  const [i_identity_number, setIIdentityNumber] = useState("");
  const [i_identity_err, setIIdentityErr] = useState("");
  const [i_address_identity, setIAddressIdentity] = useState("");
  const [i_wic_transaction_purpose, setIWicTransactionPurpose] = useState("");
  const [i_wic_recipient_relationship, setIWicRecipientRelationship] =
    useState("");

  // ── Data Pribadi ─────────────────────────────────────────────────────────
  const [i_full_name, setIName] = useState("");
  const [i_alias, setIAlias] = useState("");
  const [i_pob, setIPob] = useState("");
  const [i_dob, setIDob] = useState("");
  const [i_phone, setIPhone] = useState("");
  const [i_email, setIEmail] = useState("");
  const [i_gender, setIGender] = useState<"M" | "F" | "O">("M");

  // ── Identitas ─────────────────────────────────────────────────────────────
  const [i_ktp, setIKtp] = useState("");
  const [i_ktp_err, setIKtpErr] = useState("");
  const [i_sim, setISim] = useState("");
  const [i_sim_err, setISimErr] = useState("");
  const [i_passport, setIPassport] = useState("");
  const [i_passport_err, setIPassportErr] = useState("");
  const [i_nationality, setINationality] = useState("Indonesia");

  // ── Alamat ────────────────────────────────────────────────────────────────
  const [i_province_code, setIProvinceCode] = useState("");
  const [i_city_code, setICityCode] = useState("");
  const [i_district_code, setIDistrictCode] = useState("");
  const [i_village_code, setIVillageCode] = useState("");
  const [i_street, setIStreet] = useState("");
  const [i_house_no, setIHouseNo] = useState("");
  const [i_rt_rw, setIRtRw] = useState("");
  const [i_apartment, setIApartment] = useState("");
  const [i_landmark, setILandmark] = useState("");

  // ── Pekerjaan ─────────────────────────────────────────────────────────────
  const [i_occupation, setIOccupation] = useState("");
  const [i_occupation_other, setIOccupationOther] = useState("");
  const [i_industry, setIIndustry] = useState("");
  const [i_industry_other, setIIndustryOther] = useState("");
  const [i_company_name, setICompanyName] = useState("");
  const [i_company_address, setICompanyAddress] = useState("");
  const [i_income_range, setIIncomeRange] = useState("");

  // ── RBA CDD fields ────────────────────────────────────────────────────────
  const [i_source_of_funds, setISourceOfFunds] = useState("");
  const [i_source_of_funds_other, setISourceOfFundsOther] = useState("");
  const [i_business_rel_purpose, setIBusinessRelPurpose] = useState("");
  const [i_business_rel_purpose_other, setIBusinessRelPurposeOther] =
    useState("");
  const [i_distribution_channel, setIDistChannel] = useState("");

  // ── Reference data ────────────────────────────────────────────────────────
  const [provinces, setProvinces] = useState<RefItem[]>([]);
  const [regencies, setRegencies] = useState<RefItem[]>([]);
  const [districts, setDistricts] = useState<RefItem[]>([]);
  const [villages, setVillages] = useState<RefItem[]>([]);
  const [nationalities, setNationalities] = useState<RefItem[]>([]);
  const [industryCategories, setIndustryCategories] = useState<RefItem[]>([]);
  const [incomeRanges, setIncomeRanges] = useState<RefItem[]>([]);
  const [occupations, setOccupations] = useState<RefItem[]>([]);
  const [sofList, setSofList] = useState<RefItem[]>([]);
  const [brpList, setBrpList] = useState<RefItem[]>([]);
  const [distList, setDistList] = useState<RefItem[]>([]);
  const [regenciesLoading, setRegenciesLoading] = useState(false);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [villagesLoading, setVillagesLoading] = useState(false);

  // Load static reference lists on mount (only for INDIVIDUAL)
  useEffect(() => {
    if (kind !== "INDIVIDUAL") return;
    Promise.all([
      apiFetch<unknown>("/references/provinces"),
      apiFetch<unknown>("/references/nationalities"),
      apiFetch<unknown>("/references/rba/industries"),
      apiFetch<unknown>("/references/monthly-income-ranges"),
      apiFetch<unknown>("/references/rba/occupations"),
      apiFetch<unknown>("/references/rba/source-of-funds"),
      apiFetch<unknown>("/references/rba/business-purposes"),
      apiFetch<unknown>("/references/rba/distributions"),
    ])
      .then(([prov, nat, ind, inc, occ, sof, bp, dist]) => {
        setProvinces(toRefList<RefItem>(prov));
        setNationalities(toRefList<RefItem>(nat));
        setIndustryCategories(toRefList<RefItem>(ind));
        setIncomeRanges(toRefList<RefItem>(inc));
        setOccupations(toRefList<RefItem>(occ));
        setSofList(toRefList<RefItem>(sof));
        setBrpList(toRefList<RefItem>(bp));
        setDistList(toRefList<RefItem>(dist));
      })
      .catch(() => {});
  }, [kind]);

  // Cascade: regencies when province changes
  useEffect(() => {
    if (!i_province_code) {
      setRegencies([]);
      return;
    }
    setRegenciesLoading(true);
    apiFetch<unknown>(
      `/references/regencies?province_code=${encodeURIComponent(i_province_code)}`,
    )
      .then((r) => setRegencies(toRefList<RefItem>(r)))
      .catch(() => setRegencies([]))
      .finally(() => setRegenciesLoading(false));
  }, [i_province_code]);

  // Cascade: districts when city changes
  useEffect(() => {
    if (!i_city_code) {
      setDistricts([]);
      return;
    }
    setDistrictsLoading(true);
    apiFetch<unknown>(
      `/references/districts?regency_code=${encodeURIComponent(i_city_code)}`,
    )
      .then((r) => setDistricts(toRefList<RefItem>(r)))
      .catch(() => setDistricts([]))
      .finally(() => setDistrictsLoading(false));
  }, [i_city_code]);

  // Cascade: villages when district changes
  useEffect(() => {
    if (!i_district_code) {
      setVillages([]);
      return;
    }
    setVillagesLoading(true);
    apiFetch<unknown>(
      `/references/villages?district_code=${encodeURIComponent(i_district_code)}`,
    )
      .then((r) => setVillages(toRefList<RefItem>(r)))
      .catch(() => setVillages([]))
      .finally(() => setVillagesLoading(false));
  }, [i_district_code]);

  function validate(): boolean {
    let ok = true;

    if (isWic) {
      const ident = i_identity_number.trim();
      if (!ident) {
        setIIdentityErr("Nomor identitas wajib diisi.");
        ok = false;
      } else if (
        i_identity_type === "KTP" &&
        !/^\d{15,16}$/.test(ident.replace(/\D/g, ""))
      ) {
        setIIdentityErr("Nomor KTP wajib 15–16 digit angka.");
        ok = false;
      } else if (
        (i_identity_type === "SIM" || i_identity_type === "PASPOR") &&
        ident.length > 20
      ) {
        setIIdentityErr("Nomor identitas maksimal 20 karakter.");
        ok = false;
      } else {
        setIIdentityErr("");
      }

      if (
        !i_full_name.trim() ||
        !i_pob.trim() ||
        !i_dob ||
        !i_address_identity.trim() ||
        !i_wic_transaction_purpose.trim() ||
        !i_wic_recipient_relationship.trim()
      ) {
        toast.error("Lengkapi identitas minimum dan tujuan transaksi WIC.");
        ok = false;
      }
      return ok;
    }

    if (!i_ktp.trim() || !/^\d{15,16}$/.test(i_ktp)) {
      setIKtpErr("Nomor KTP wajib diisi 15–16 digit angka.");
      ok = false;
    } else {
      setIKtpErr("");
    }
    if (i_sim.length > 20) {
      setISimErr("Nomor SIM maksimal 20 karakter.");
      ok = false;
    } else {
      setISimErr("");
    }
    if (i_passport.length > 20) {
      setIPassportErr("Nomor Paspor maksimal 20 karakter.");
      ok = false;
    } else {
      setIPassportErr("");
    }

    // "Lainnya" companions — required when the related dropdown is "Lainnya".
    const lainnyaChecks: Array<[boolean, string]> = [
      [
        isLainnya(i_occupation) && !i_occupation_other.trim(),
        "Keterangan Pekerjaan Lainnya wajib diisi.",
      ],
      [
        isLainnya(i_industry) && !i_industry_other.trim(),
        "Keterangan Industri Lainnya wajib diisi.",
      ],
      [
        isLainnya(i_source_of_funds) && !i_source_of_funds_other.trim(),
        "Keterangan Sumber Dana Lainnya wajib diisi.",
      ],
      [
        isLainnya(i_business_rel_purpose) && !i_business_rel_purpose_other.trim(),
        "Keterangan Tujuan Hubungan Bisnis Lainnya wajib diisi.",
      ],
    ];
    for (const [invalid, message] of lainnyaChecks) {
      if (invalid) {
        toast.error(message);
        ok = false;
      }
    }
    return ok;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    if (!validate()) return;

    setLoading(true);
    try {
      const normalizedWicIdentity =
        i_identity_type === "KTP"
          ? i_identity_number.replace(/\D/g, "")
          : i_identity_number.trim();

      const dto = isWic
        ? {
            full_name: i_full_name,
            alias: i_alias || null,
            identity_type: i_identity_type,
            identity_number: normalizedWicIdentity,
            ktp_number:
              i_identity_type === "KTP" ? normalizedWicIdentity : null,
            sim_number:
              i_identity_type === "SIM" ? normalizedWicIdentity : null,
            passport_number:
              i_identity_type === "PASPOR" ? normalizedWicIdentity : null,
            address_identity: i_address_identity,
            pob: i_pob,
            dob: i_dob || null,
            nationality: null,
            phone: null,
            email: null,
            gender: null,
            occupation: null,
            industry_category: null,
            company_name: null,
            company_address: null,
            monthly_income_range: null,
            source_of_funds: null,
            business_relationship_purpose: null,
            distribution_channel: null,
            wic_transaction_purpose: i_wic_transaction_purpose,
            wic_recipient_relationship: i_wic_recipient_relationship,
            signature_uri: null,
            cif_relationship_type: "WIC" as const,
          }
        : {
            full_name: i_full_name,
            alias: i_alias || null,
            ktp_number: i_ktp,
            identity_number: i_ktp, // backward compat — primary is ktp_number
            identity_type: "KTP",
            sim_number: i_sim || null,
            passport_number: i_passport || null,
            pob: i_pob,
            dob: i_dob || null,
            nationality: i_nationality || null,
            phone: i_phone,
            email: i_email || null,
            gender: i_gender,
            occupation: i_occupation || null,
            occupation_other: isLainnya(i_occupation)
              ? i_occupation_other || null
              : null,
            province_code: i_province_code || null,
            city_code: i_city_code || null,
            district_code: i_district_code || null,
            village_code: i_village_code || null,
            street_address: i_street || null,
            house_number: i_house_no || null,
            rt_rw: i_rt_rw || null,
            apartment_block: i_apartment || null,
            address_landmark: i_landmark || null,
            industry_category: i_industry || null,
            industry_category_other: isLainnya(i_industry)
              ? i_industry_other || null
              : null,
            company_name: i_company_name || null,
            company_address: i_company_address || null,
            monthly_income_range: i_income_range || null,
            source_of_funds: i_source_of_funds || null,
            source_of_funds_other: isLainnya(i_source_of_funds)
              ? i_source_of_funds_other || null
              : null,
            business_relationship_purpose: i_business_rel_purpose || null,
            business_relationship_purpose_other: isLainnya(i_business_rel_purpose)
              ? i_business_rel_purpose_other || null
              : null,
            distribution_channel: i_distribution_channel || null,
            signature_uri: null,
            cif_relationship_type: i_cif_relationship_type,
          };

      const created = await apiFetch<{
        id?: number | string;
        application_id?: number | string;
      }>("/applications/individual", {
        method: "POST",
        body: JSON.stringify(dto),
      });

      const appId = created?.id ?? created?.application_id;
      if (!appId) throw new Error("ID aplikasi tidak ditemukan dalam respons");

      toast.success("Aplikasi berhasil dibuat.");
      router.push(`/users/${String(appId)}`);
    } catch (e: unknown) {
      toast.error(
        e instanceof Error
          ? e.message
          : "Gagal membuat aplikasi. Silakan coba lagi.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {kind === "INDIVIDUAL" ? "Input Data KYC" : "Input Data KYB"}
        </h1>
        <p className="text-xs text-slate-500">
          Entri manual untuk verifikasi nasabah
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6">
        {kind === "INDIVIDUAL" ? (
          <Card>
            <CardContent className="space-y-6 p-6">
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">
                      Parameter CIF / Jenis Pengguna
                    </span>
                    <select
                      className="rounded-md border bg-white px-3 py-2 text-sm"
                      value={i_cif_relationship_type}
                      onChange={(e) =>
                        setICifRelationshipType(
                          e.target.value as "OUR_CUSTOMER" | "WIC",
                        )
                      }
                    >
                      <option value="OUR_CUSTOMER">Our Customer</option>
                      <option value="WIC">Walk-In Customer (WIC)</option>
                    </select>
                  </label>
                  <div className="rounded-lg bg-white/70 p-3 text-xs text-slate-600">
                    {isWic ? (
                      <>
                        <p className="font-semibold text-emerald-800">
                          CDD Walk-In Customer (&lt; Rp100 juta)
                        </p>
                        <p className="mt-1">
                          WIC tidak diterbitkan CIF dan transaksi dibatasi
                          maksimal Rp100.000.000.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-emerald-800">
                          CDD Customer
                        </p>
                        <p className="mt-1">
                          Our Customer akan diterbitkan CIF setelah data
                          disimpan.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {isWic && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <p className="font-semibold">
                    Format CDD Walk-In Customer (&lt; Rp100 juta)
                  </p>
                  <p className="mt-1 text-xs leading-relaxed">
                    Form WIC menggunakan identitas minimum, tidak menerbitkan
                    CIF, dan transaksi dibatasi maksimal Rp100.000.000. Bagian
                    pekerjaan dan Hubungan Bisnis/RBA lengkap hanya digunakan
                    untuk Our Customer.
                  </p>
                </div>
              )}

              {isWic ? (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600 border-b pb-1">
                      A. Identitas Minimum
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Nama Lengkap <span className="text-red-500">*</span>
                        </span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_full_name}
                          onChange={(e) => setIName(e.target.value)}
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Nomor Identitas{" "}
                          <span className="text-red-500">*</span>
                        </span>
                        <div className="grid gap-2 md:grid-cols-[140px_1fr]">
                          <select
                            className="rounded-md border bg-white px-3 py-2 text-sm"
                            value={i_identity_type}
                            onChange={(e) => {
                              setIIdentityType(
                                e.target.value as "KTP" | "SIM" | "PASPOR",
                              );
                              setIIdentityErr("");
                            }}
                          >
                            <option value="KTP">KTP</option>
                            <option value="SIM">SIM</option>
                            <option value="PASPOR">Paspor</option>
                          </select>
                          <input
                            className={`rounded-md border px-3 py-2 text-sm${i_identity_err ? " border-red-400" : ""}`}
                            value={i_identity_number}
                            onChange={(e) => {
                              const next =
                                i_identity_type === "KTP"
                                  ? e.target.value.replace(/\D/g, "")
                                  : e.target.value;
                              setIIdentityNumber(next);
                              setIIdentityErr("");
                            }}
                            maxLength={i_identity_type === "KTP" ? 16 : 20}
                            placeholder={
                              i_identity_type === "KTP"
                                ? "15–16 digit angka"
                                : "Nomor identitas"
                            }
                            required
                          />
                        </div>
                        {i_identity_err && (
                          <p className="text-xs text-red-600">
                            {i_identity_err}
                          </p>
                        )}
                      </label>
                      <label className="grid gap-1 md:col-span-2">
                        <span className="text-sm font-medium">
                          Alamat minimal sesuai identitas{" "}
                          <span className="text-red-500">*</span>
                        </span>
                        <textarea
                          className="min-h-24 rounded-md border px-3 py-2 text-sm"
                          value={i_address_identity}
                          onChange={(e) => setIAddressIdentity(e.target.value)}
                          placeholder="Tulis alamat sesuai identitas"
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Tempat Lahir <span className="text-red-500">*</span>
                        </span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_pob}
                          onChange={(e) => setIPob(e.target.value)}
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Tanggal Lahir <span className="text-red-500">*</span>
                        </span>
                        <input
                          type="date"
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_dob}
                          onChange={(e) => setIDob(e.target.value)}
                          required
                        />
                      </label>
                      <div className="rounded-md border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 md:col-span-2">
                        <span className="font-medium text-slate-700">
                          Tanda Tangan / Biometrik:
                        </span>{" "}
                        dicatat pada tahap dokumen/verifikasi setelah data WIC
                        disimpan.
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600 border-b pb-1">
                      B. Tujuan Transaksi
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Tujuan <span className="text-red-500">*</span>
                        </span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_wic_transaction_purpose}
                          onChange={(e) =>
                            setIWicTransactionPurpose(e.target.value)
                          }
                          placeholder="Contoh: transfer keluarga, pembayaran, dll."
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Hubungan dengan Penerima{" "}
                          <span className="text-red-500">*</span>
                        </span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_wic_recipient_relationship}
                          onChange={(e) =>
                            setIWicRecipientRelationship(e.target.value)
                          }
                          placeholder="Contoh: keluarga, rekan usaha, dll."
                          required
                        />
                      </label>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">
                        C. Screening DTTOT & PPPSPM
                      </p>
                      <p className="mt-1">
                        Hasil screening muncul setelah
                        pra-pemeriksaan/submission.
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">
                        D. Penilaian Risiko
                      </p>
                      <p className="mt-1">
                        Kategori risiko dihitung oleh sistem setelah screening.
                      </p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                      <p className="font-semibold text-slate-800">
                        E. Keputusan
                      </p>
                      <p className="mt-1">
                        Keputusan dilakukan oleh role approval sesuai matrix.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* ── 1. Data Pribadi ───────────────────────────────────────── */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600 border-b pb-1">
                      Data Pribadi
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Nama Lengkap <span className="text-red-500">*</span>
                        </span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_full_name}
                          onChange={(e) => setIName(e.target.value)}
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">Alias</span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_alias}
                          onChange={(e) => setIAlias(e.target.value)}
                          placeholder="Nama alias (opsional)"
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Tempat Lahir <span className="text-red-500">*</span>
                        </span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_pob}
                          onChange={(e) => setIPob(e.target.value)}
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Tanggal Lahir <span className="text-red-500">*</span>
                        </span>
                        <input
                          type="date"
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_dob}
                          onChange={(e) => setIDob(e.target.value)}
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Nomor Telepon <span className="text-red-500">*</span>
                        </span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          placeholder="+62"
                          value={i_phone}
                          onChange={(e) => setIPhone(e.target.value)}
                          required
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">Email</span>
                        <input
                          type="email"
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_email}
                          onChange={(e) => setIEmail(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">
                          Jenis Kelamin <span className="text-red-500">*</span>
                        </span>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_gender}
                          onChange={(e) =>
                            setIGender(e.target.value as "M" | "F" | "O")
                          }
                          required
                        >
                          <option value="M">Laki-laki</option>
                          <option value="F">Perempuan</option>
                          <option value="O">Lainnya</option>
                        </select>
                      </label>
                    </div>
                  </div>

                  {/* ── 2. Identitas ─────────────────────────────────────────── */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600 border-b pb-1">
                      Identitas
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Nomor KTP <span className="text-red-500">*</span>
                        </label>
                        <input
                          className={`rounded-md border px-3 py-2 text-sm${i_ktp_err ? " border-red-400" : ""}`}
                          value={i_ktp}
                          onChange={(e) => {
                            setIKtp(e.target.value.replace(/\D/g, ""));
                            setIKtpErr("");
                          }}
                          maxLength={16}
                          placeholder="15–16 digit angka"
                        />
                        {i_ktp_err && (
                          <p className="text-xs text-red-600">{i_ktp_err}</p>
                        )}
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">Nomor SIM</label>
                        <input
                          className={`rounded-md border px-3 py-2 text-sm${i_sim_err ? " border-red-400" : ""}`}
                          value={i_sim}
                          onChange={(e) => {
                            setISim(e.target.value);
                            setISimErr("");
                          }}
                          maxLength={20}
                          placeholder="Opsional, maks. 20 karakter"
                        />
                        {i_sim_err && (
                          <p className="text-xs text-red-600">{i_sim_err}</p>
                        )}
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Nomor Paspor
                        </label>
                        <input
                          className={`rounded-md border px-3 py-2 text-sm${i_passport_err ? " border-red-400" : ""}`}
                          value={i_passport}
                          onChange={(e) => {
                            setIPassport(e.target.value);
                            setIPassportErr("");
                          }}
                          maxLength={20}
                          placeholder="Opsional, maks. 20 karakter"
                        />
                        {i_passport_err && (
                          <p className="text-xs text-red-600">
                            {i_passport_err}
                          </p>
                        )}
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Kewarganegaraan{" "}
                          <span className="text-red-500">*</span>
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_nationality}
                          onChange={(e) => setINationality(e.target.value)}
                          required
                        >
                          <option value="">— Pilih —</option>
                          {nationalities.map((n) => (
                            <option key={n.code} value={n.code}>
                              {n.name}
                            </option>
                          ))}
                          {i_nationality &&
                            !nationalities.find(
                              (n) => n.code === i_nationality,
                            ) && (
                              <option value={i_nationality}>
                                {i_nationality}
                              </option>
                            )}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* ── 3. Alamat ────────────────────────────────────────────── */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600 border-b pb-1">
                      Alamat
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">Provinsi</label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_province_code}
                          onChange={(e) => {
                            setIProvinceCode(e.target.value);
                            setICityCode("");
                            setIDistrictCode("");
                            setIVillageCode("");
                          }}
                        >
                          <option value="">— Pilih Provinsi —</option>
                          {provinces.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Kota / Kabupaten
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                          value={i_city_code}
                          disabled={!i_province_code || regenciesLoading}
                          onChange={(e) => {
                            setICityCode(e.target.value);
                            setIDistrictCode("");
                            setIVillageCode("");
                          }}
                        >
                          {regenciesLoading ? (
                            <option disabled>Memuat...</option>
                          ) : i_province_code && regencies.length === 0 ? (
                            <option disabled>
                              Data kota/kabupaten belum tersedia untuk provinsi
                              ini.
                            </option>
                          ) : (
                            <>
                              <option value="">— Pilih Kota/Kabupaten —</option>
                              {regencies.map((r) => (
                                <option key={r.code} value={r.code}>
                                  {r.name}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">Kecamatan</label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                          value={i_district_code}
                          disabled={!i_city_code || districtsLoading}
                          onChange={(e) => {
                            setIDistrictCode(e.target.value);
                            setIVillageCode("");
                          }}
                        >
                          {districtsLoading ? (
                            <option disabled>Memuat...</option>
                          ) : i_city_code && districts.length === 0 ? (
                            <option disabled>
                              Data kecamatan belum tersedia untuk kota/kabupaten
                              ini.
                            </option>
                          ) : (
                            <>
                              <option value="">— Pilih Kecamatan —</option>
                              {districts.map((d) => (
                                <option key={d.code} value={d.code}>
                                  {d.name}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Kelurahan / Desa
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                          value={i_village_code}
                          disabled={!i_district_code || villagesLoading}
                          onChange={(e) => setIVillageCode(e.target.value)}
                        >
                          {villagesLoading ? (
                            <option disabled>Memuat...</option>
                          ) : i_district_code && villages.length === 0 ? (
                            <option disabled>
                              Data kelurahan/desa belum tersedia untuk kecamatan
                              ini.
                            </option>
                          ) : (
                            <>
                              <option value="">— Pilih Kelurahan/Desa —</option>
                              {villages.map((v) => (
                                <option key={v.code} value={v.code}>
                                  {v.name}
                                </option>
                              ))}
                            </>
                          )}
                        </select>
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Nama Jalan
                        </label>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_street}
                          onChange={(e) => setIStreet(e.target.value)}
                          placeholder="Nama jalan"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Nomor Rumah
                        </label>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_house_no}
                          onChange={(e) => setIHouseNo(e.target.value)}
                          placeholder="Nomor rumah"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">RT / RW</label>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_rt_rw}
                          onChange={(e) => setIRtRw(e.target.value)}
                          placeholder="Contoh: 001/002"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Apartemen / Blok
                        </label>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_apartment}
                          onChange={(e) => setIApartment(e.target.value)}
                          placeholder="Opsional"
                        />
                      </div>
                      <div className="grid gap-1 md:col-span-2">
                        <label className="text-sm font-medium">Patokan</label>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_landmark}
                          onChange={(e) => setILandmark(e.target.value)}
                          placeholder="Patokan alamat (opsional)"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {!isWic && (
                <>
                  {/* ── 4. Pekerjaan ─────────────────────────────────────────── */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600 border-b pb-1">
                      Pekerjaan
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">Pekerjaan</label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_occupation}
                          onChange={(e) => {
                            const v = e.target.value;
                            setIOccupation(v);
                            if (!isLainnya(v)) setIOccupationOther("");
                          }}
                        >
                          <option value="">— Pilih pekerjaan —</option>
                          {occupations.map((o) => (
                            <option key={o.code} value={o.name}>
                              {o.name}
                            </option>
                          ))}
                          {i_occupation &&
                            !occupations.find(
                              (o) => o.name === i_occupation,
                            ) && (
                              <option value={i_occupation}>
                                {i_occupation}
                              </option>
                            )}
                        </select>
                        <LainnyaField
                          when={i_occupation}
                          value={i_occupation_other}
                          onChange={setIOccupationOther}
                          label="Keterangan Pekerjaan Lainnya"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Industri / Kegiatan Usaha
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_industry}
                          onChange={(e) => {
                            const v = e.target.value;
                            setIIndustry(v);
                            if (!isLainnya(v)) setIIndustryOther("");
                          }}
                        >
                          <option value="">— Pilih industri —</option>
                          {industryCategories.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.name}
                            </option>
                          ))}
                        </select>
                        <LainnyaField
                          when={i_industry}
                          value={i_industry_other}
                          onChange={setIIndustryOther}
                          label="Keterangan Industri Lainnya"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Nama Perusahaan
                        </label>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_company_name}
                          onChange={(e) => setICompanyName(e.target.value)}
                          placeholder="Diisi jika pengguna bekerja"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Penghasilan / Bulan
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_income_range}
                          onChange={(e) => setIIncomeRange(e.target.value)}
                        >
                          <option value="">— Pilih rentang —</option>
                          {incomeRanges.length === 0 ? (
                            <option value="" disabled>
                              Rentang penghasilan belum tersedia.
                            </option>
                          ) : (
                            incomeRanges.map((r) => (
                              <option key={r.code} value={r.code}>
                                {r.name}
                              </option>
                            ))
                          )}
                        </select>
                      </div>
                      <div className="grid gap-1 md:col-span-2">
                        <label className="text-sm font-medium">
                          Alamat Tempat Bekerja
                        </label>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={i_company_address}
                          onChange={(e) => setICompanyAddress(e.target.value)}
                          placeholder="Opsional"
                        />
                      </div>
                    </div>
                  </div>

                  {/* ── 5. Hubungan Bisnis (RBA) ─────────────────────────────── */}
                  <div className="space-y-3">
                    <p className="text-xs font-semibold text-slate-600 border-b pb-1">
                      Hubungan Bisnis (RBA)
                    </p>
                    <p className="text-xs text-slate-500">
                      Pilihan ini digunakan untuk perhitungan Risk Based
                      Approach sesuai SOP.
                    </p>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Sumber Dana
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_source_of_funds}
                          onChange={(e) => {
                            const v = e.target.value;
                            setISourceOfFunds(v);
                            if (!isLainnya(v)) setISourceOfFundsOther("");
                          }}
                        >
                          <option value="">— Pilih —</option>
                          {sofList.map((s) => (
                            <option key={s.code} value={s.code}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                        <LainnyaField
                          when={i_source_of_funds}
                          value={i_source_of_funds_other}
                          onChange={setISourceOfFundsOther}
                          label="Keterangan Sumber Dana Lainnya"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Tujuan Hubungan Bisnis
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_business_rel_purpose}
                          onChange={(e) => {
                            const v = e.target.value;
                            setIBusinessRelPurpose(v);
                            if (!isLainnya(v)) setIBusinessRelPurposeOther("");
                          }}
                        >
                          <option value="">— Pilih —</option>
                          {brpList.map((p) => (
                            <option key={p.code} value={p.code}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                        <LainnyaField
                          when={i_business_rel_purpose}
                          value={i_business_rel_purpose_other}
                          onChange={setIBusinessRelPurposeOther}
                          label="Keterangan Tujuan Hubungan Bisnis Lainnya"
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-sm font-medium">
                          Saluran Distribusi
                        </label>
                        <select
                          className="rounded-md border bg-white px-3 py-2 text-sm"
                          value={i_distribution_channel}
                          onChange={(e) => setIDistChannel(e.target.value)}
                        >
                          <option value="">— Pilih —</option>
                          {distList.map((d) => (
                            <option key={d.code} value={d.code}>
                              {d.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* ── Info dokumen ─────────────────────────────────────────── */}
              <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
                {isWic
                  ? "Dokumen identitas dan biometrik/tanda tangan WIC dilengkapi setelah data disimpan."
                  : "Dokumen foto KTP, foto wajah pengguna, dan foto wajah dengan KTP diunggah setelah data pengguna disimpan."}
              </div>
            </CardContent>
          </Card>
        ) : (
          <BusinessWizard />
        )}

        {kind === "INDIVIDUAL" && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center rounded-md bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
            >
              {loading ? "Menyimpan..." : "Simpan Data KYC"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}

export default function NewApplicationPage() {
  return (
    <Suspense fallback={<p className="p-6 text-sm text-slate-500">Memuat…</p>}>
      <NewApplicationPageInner />
    </Suspense>
  );
}
