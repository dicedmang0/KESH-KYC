"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch, apiUpload } from "@/lib/api";
import { updateBusinessApplication } from "@/lib/applications";
import { toast } from "@/lib/toast";
import { formatCif, isLainnya } from "@/lib/utils";
import {
  BUSINESS_ALWAYS_REQUIRED_DOCS,
  BUSINESS_BO_DOC,
  BUSINESS_SHAREHOLDER_DOC,
  type BusinessDocType,
} from "@/lib/business-docs";
import LainnyaField from "@/components/lainnya-field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type AppStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "ESCALATED"
  | "APPROVED"
  | "REJECTED";

// Backend party role enum. AUTHORIZED_REP is surfaced in the UI as "PIC".
type PartyRole =
  | "DIRECTOR"
  | "COMMISSIONER"
  | "MANAGER"
  | "SHAREHOLDER"
  | "BO"
  | "AUTHORIZED_REP";

const PARTY_ROLE_LABELS: Record<PartyRole, string> = {
  DIRECTOR: "Direktur",
  COMMISSIONER: "Komisaris",
  MANAGER: "Manajer",
  SHAREHOLDER: "Pemegang Saham",
  BO: "Beneficial Owner",
  AUTHORIZED_REP: "PIC",
};

type PartyRow = {
  id: number;
  role: PartyRole;
  is_active: boolean;
  person_id: number;
  full_name: string;
  identity_type?: "KTP" | "SIM" | "PASPOR" | "LAINNYA" | null;
  identity_number?: string | null;
  dob?: string | null;
  nationality?: string | null;
  cif_no?: string | null;
  cif_relationship_type?: string | null;
  ownership_percentage?: number | string | null;
  address?: string | null;
  identity_document_type?: string | null;
  source_of_funds?: string | null;
  source_of_wealth?: string | null;
};

type BusinessDocument = {
  id: number | string;
  doc_type: string;
  file_uri?: string | null;
  file_url?: string | null;
  status?: string | null;
  extracted_json?: { original_name?: string } | null;
  original_name?: string | null;
};

/** A document counts as uploaded once it has a file, mirroring the detail page. */
function isUploaded(d?: BusinessDocument): boolean {
  const hasFile = !!(d?.file_uri ?? d?.file_url);
  return (
    d?.status === "UPLOADED" ||
    d?.status === "APPROVED" ||
    (d?.status === "PENDING" && hasFile) ||
    (!d?.status && hasFile)
  );
}

function docFilename(d?: BusinessDocument): string | null {
  return d?.extracted_json?.original_name ?? d?.original_name ?? null;
}

function getCifRelationshipLabel(value?: string | null): string {
  if (value === "OUR_CUSTOMER") return "Our Customer";
  if (value === "BO") return "Beneficial Owner";
  if (value === "WIC") return "WIC";
  return "—";
}

function toRefList<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  if (r && typeof r === "object" && "data" in r && Array.isArray((r as { data: unknown }).data)) {
    return (r as { data: T[] }).data;
  }
  return [];
}

// Always-required business documents (form terbaru).
const ALWAYS_REQUIRED_DOCS = BUSINESS_ALWAYS_REQUIRED_DOCS;
const SHAREHOLDER_DOC = BUSINESS_SHAREHOLDER_DOC;
const BO_DOC = BUSINESS_BO_DOC;

type Step = 1 | 2 | 3 | 4;

/**
 * One required-document slot on Step 3. Declared at module scope on purpose:
 * as a function nested in the wizard it got a new identity on every render, so
 * React remounted the <input type="file"> and the browser reset it to
 * "No file chosen" the instant a file was picked.
 */
function DocCard({
  code,
  name,
  required,
  doc,
  busy,
  onPick,
  onView,
  onDelete,
}: {
  code: string;
  name: string;
  required: boolean;
  doc?: BusinessDocument;
  busy: boolean;
  onPick: (code: string, file: File) => void;
  onView: (docId: number | string) => void;
  onDelete: (docId: number | string) => void;
}) {
  const uploaded = isUploaded(doc);
  const filename = docFilename(doc);
  return (
    <div className="rounded-md border border-dashed p-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{name}</span>
        {required ? (
          <span className="text-red-500">*</span>
        ) : (
          <span className="text-xs text-slate-400">(Opsional / tidak wajib untuk data saat ini)</span>
        )}
        <span
          className={`rounded px-1.5 py-0.5 text-xs font-medium ${
            uploaded ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
          }`}
        >
          {uploaded ? "Berhasil Terupload" : "Belum Terupload"}
        </span>
      </div>
      {uploaded && doc && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
          {filename && <span className="text-slate-500">{filename}</span>}
          <button
            type="button"
            onClick={() => onView(doc.id)}
            className="text-kesh-700 underline hover:text-kesh-600"
          >
            Lihat
          </button>
          <button
            type="button"
            onClick={() => onDelete(doc.id)}
            className="text-red-600 hover:underline"
          >
            Hapus
          </button>
        </div>
      )}
      <label className="grid gap-1 min-w-0">
        <span className="text-xs text-slate-500">
          {uploaded ? "Ganti File" : "Pilih File"}
        </span>
        <input
          type="file"
          data-doc-type={code}
          accept="image/png,image/jpeg,application/pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            // Reset the input so re-picking the same filename still fires onChange.
            e.target.value = "";
            if (file) onPick(code, file);
          }}
        />
      </label>
      {busy && <p className="mt-1 text-xs text-slate-500">Mengunggah…</p>}
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: "Identitas" },
    { n: 2, label: "Pengurus & Pemegang Saham" },
    { n: 3, label: "Dokumen" },
    { n: 4, label: "Tinjauan" },
  ];
  return (
    // Wraps instead of forcing 615px of document width on a 375px viewport.
    <div className="flex flex-wrap items-center gap-3">
      {items.map((it, i) => (
        <div key={it.n} className="flex items-center gap-3">
          <div
            className={`h-8 w-8 rounded-full text-xs flex items-center justify-center font-medium ${
              step >= it.n ? "bg-kesh-700 text-white" : "bg-slate-200 text-slate-600"
            }`}
          >
            {it.n}
          </div>
          <span className={`text-sm ${step >= it.n ? "text-slate-900" : "text-slate-500"}`}>
            {it.label}
          </span>
          {i < items.length - 1 && <div className="h-px w-10 bg-slate-200" />}
        </div>
      ))}
    </div>
  );
}

export default function BusinessWizard() {
  const router = useRouter();
  // ?app_id= is written into the URL after Step 1 so a browser refresh resumes
  // the same application (and its already-uploaded documents) instead of
  // silently starting a second one.
  const resumeAppId = useSearchParams().get("app_id");

  // ----- State umum -----
  const [step, setStep] = useState<Step>(resumeAppId ? 2 : 1);
  const [saving, setSaving] = useState(false);

  // banner per step
  const [errCompany, setErrCompany] = useState<string | null>(null);
  const [errParties, setErrParties] = useState<string | null>(null);
  const [errDocs, setErrDocs] = useState<string | null>(null);
  const [submitOK, setSubmitOK] = useState<string | null>(null);

  // setelah Step 1 berhasil → pegang appId untuk step berikutnya
  const [appId, setAppId] = useState<number | string | null>(resumeAppId);

  // ----- STEP 1: Identitas Badan Usaha + PIC -----
  const [legal_name, setLegalName] = useState("");
  const [legal_form, setLegalForm] = useState("PT");
  const [legal_form_other, setLegalFormOther] = useState("");
  // Akta dipecah dua (migrasi 0061): pendirian wajib untuk PT, perubahan terakhir opsional.
  const [deed_establishment_number, setDeedEstablishmentNumber] = useState("");
  const [deed_latest_amendment_number, setDeedLatestAmendmentNumber] = useState("");
  const [incorporation_date, setIncorpDate] = useState("");
  // Nomor Izin Usaha (NIB/OSS/SIUP/dll) — primary payload business_license_number.
  const [izin_usaha, setIzinUsaha] = useState("");
  const [npwp, setNpwp] = useState("");
  const [address_line, setAddr] = useState("");
  // Alamat Kedudukan — dropdown provinsi/kota (mirror Individual CDD). city/province
  // menyimpan nama terpilih untuk kolom teks wajib di backend.
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [business_province_code, setBizProvinceCode] = useState("");
  const [business_city_code, setBizCityCode] = useState("");
  const [business_district_code, setBizDistrictCode] = useState("");
  const [business_district_name, setBizDistrictName] = useState("");
  const [business_village_code, setBizVillageCode] = useState("");
  const [business_village_name, setBizVillageName] = useState("");
  const [postal_code, setPostal] = useState("");
  const [business_activity, setBizAct] = useState("");
  const [business_activity_other, setBizActOther] = useState("");
  const [phone, setPhone] = useState("");
  const [company_email, setCompanyEmail] = useState("");
  // PIC (Pengurus Utama)
  const [pic_name, setPicName] = useState("");
  const [pic_position, setPicPosition] = useState("");
  const [pic_identity_number, setPicIdNumber] = useState("");
  const [pic_identity_type, setPicIdType] = useState<"KTP" | "PASPOR">("KTP");

  // Field-level validation messages (Step 1)
  const [npwpErr, setNpwpErr] = useState("");
  const [deedErr, setDeedErr] = useState("");
  const [picIdErr, setPicIdErr] = useState("");

  const isPT = legal_form === "PT";

  // RBA CDD fields
  const [cdd_sof, setCddSof] = useState("");
  const [cdd_sof_other, setCddSofOther] = useState("");
  const [cdd_brp, setCddBrp] = useState("");
  const [cdd_brp_other, setCddBrpOther] = useState("");
  const [cdd_dist, setCddDist] = useState("");

  // RBA reference lists
  const [rbaBusinessForms, setRbaBusinessForms] = useState<{ code: string; name: string }[]>([]);
  const [industryCategories, setIndustryCategories] = useState<{ code: string; name: string }[]>([]);
  const [rbaSofList, setRbaSofList] = useState<{ code: string; name: string }[]>([]);
  const [rbaBrpList, setRbaBrpList] = useState<{ code: string; name: string }[]>([]);
  const [rbaDistList, setRbaDistList] = useState<{ code: string; name: string }[]>([]);

  // Alamat Kedudukan reference lists (province/city dropdown, mirror Individual CDD)
  const [provinces, setProvinces] = useState<{ code: string; name: string }[]>([]);
  const [regencies, setRegencies] = useState<{ code: string; name: string }[]>([]);
  const [districts, setDistricts] = useState<{ code: string; name: string }[]>([]);
  const [villages, setVillages] = useState<{ code: string; name: string }[]>([]);
  const [regenciesLoading, setRegenciesLoading] = useState(false);
  const [districtsLoading, setDistrictsLoading] = useState(false);
  const [villagesLoading, setVillagesLoading] = useState(false);

  useEffect(() => {
    Promise.all([
      apiFetch<unknown>("/references/rba/business-forms"),
      apiFetch<unknown>("/references/industry-categories"),
      apiFetch<unknown>("/references/rba/source-of-funds"),
      apiFetch<unknown>("/references/rba/business-purposes"),
      apiFetch<unknown>("/references/rba/distributions"),
      apiFetch<unknown>("/references/provinces"),
    ]).then(([bf, ind, sof, bp, dist, prov]) => {
      setRbaBusinessForms(toRefList(bf));
      setIndustryCategories(toRefList(ind));
      setRbaSofList(toRefList(sof));
      setRbaBrpList(toRefList(bp));
      setRbaDistList(toRefList(dist));
      setProvinces(toRefList(prov));
    }).catch(() => {});
  }, []);

  // Cascade: load regencies when province changes
  useEffect(() => {
    if (!business_province_code) {
      setRegencies([]);
      return;
    }
    setRegenciesLoading(true);
    apiFetch<unknown>(
      `/references/regencies?province_code=${encodeURIComponent(business_province_code)}`,
    )
      .then((r) => setRegencies(toRefList(r)))
      .catch(() => setRegencies([]))
      .finally(() => setRegenciesLoading(false));
  }, [business_province_code]);

  // Cascade: load districts (kecamatan) when city changes
  useEffect(() => {
    if (!business_city_code) {
      setDistricts([]);
      return;
    }
    setDistrictsLoading(true);
    apiFetch<unknown>(
      `/references/districts?regency_code=${encodeURIComponent(business_city_code)}`,
    )
      .then((r) => setDistricts(toRefList(r)))
      .catch(() => setDistricts([]))
      .finally(() => setDistrictsLoading(false));
  }, [business_city_code]);

  // Cascade: load villages (kelurahan/desa) when district changes
  useEffect(() => {
    if (!business_district_code) {
      setVillages([]);
      return;
    }
    setVillagesLoading(true);
    apiFetch<unknown>(
      `/references/villages?district_code=${encodeURIComponent(business_district_code)}`,
    )
      .then((r) => setVillages(toRefList(r)))
      .catch(() => setVillages([]))
      .finally(() => setVillagesLoading(false));
  }, [business_district_code]);

  function validateCompany(): boolean {
    let ok = true;
    // B.5 NPWP Badan Usaha — wajib 15 digit angka.
    if (!/^\d{15}$/.test(npwp)) {
      setNpwpErr("NPWP Badan Usaha wajib 15 digit angka.");
      ok = false;
    } else {
      setNpwpErr("");
    }
    // B.1 Nomor Akta Pendirian — wajib hanya untuk badan usaha PT.
    if (isPT && !deed_establishment_number.trim()) {
      setDeedErr("Nomor Akta Pendirian wajib diisi untuk badan usaha PT.");
      ok = false;
    } else {
      setDeedErr("");
    }
    // B.2 Nomor Identitas PIC — maksimal 16 karakter.
    if (pic_identity_number.length > 16) {
      setPicIdErr("Maksimal 16 karakter.");
      ok = false;
    } else {
      setPicIdErr("");
    }
    // A. "Lainnya" companions — wajib diisi saat dropdown bernilai "Lainnya".
    const lainnyaChecks: Array<[boolean, string]> = [
      [isLainnya(legal_form) && !legal_form_other.trim(), "Keterangan Bentuk Badan Usaha Lainnya wajib diisi."],
      [isLainnya(business_activity) && !business_activity_other.trim(), "Keterangan Bidang Usaha Lainnya wajib diisi."],
      [isLainnya(cdd_sof) && !cdd_sof_other.trim(), "Keterangan Sumber Dana Lainnya wajib diisi."],
      [isLainnya(cdd_brp) && !cdd_brp_other.trim(), "Keterangan Tujuan Hubungan Bisnis Lainnya wajib diisi."],
    ];
    for (const [invalid, message] of lainnyaChecks) {
      if (invalid) {
        toast.error(message);
        ok = false;
      }
    }
    // Porsi saham pengurus utama (opsional 0–100) — bagian dari profil badan usaha.
    if (!validateShares()) ok = false;
    return ok;
  }

  // Pesan ramah untuk kasus salah panggil endpoint CDD Individual (bug historis
  // saveSharesThenNext yang memanggil PATCH /applications/:id). Endpoint itu sudah
  // tidak dipanggil dari form ini, tapi terjemahan pesan dipertahankan sebagai jaring pengaman.
  function friendlyBusinessError(e: unknown, fallback: string): string {
    const msg = e instanceof Error ? e.message : fallback;
    if (msg.includes("Update CDD hanya berlaku untuk aplikasi Individual")) {
      return "Form KYB tidak boleh menggunakan endpoint CDD Individual. Silakan coba lagi setelah perbaikan.";
    }
    return msg;
  }

  async function saveCompany() {
    setErrCompany(null);
    setSubmitOK(null);
    // Aplikasi sudah dibuat: POST lagi hanya akan membuat duplikat, dan backend
    // belum punya endpoint PATCH untuk identitas badan usaha.
    if (appId) {
      toast.error("Aplikasi sudah dibuat — identitas badan usaha tidak dapat diubah lagi.");
      setStep(2);
      return;
    }
    if (!validateCompany()) return;
    setSaving(true);
    try {
      const body = {
        legal_name,
        legal_form,
        legal_form_other: isLainnya(legal_form) ? legal_form_other || null : null,
        deed_establishment_number: deed_establishment_number.trim() || null,
        deed_latest_amendment_number: deed_latest_amendment_number.trim() || null,
        incorporation_date,
        // Satu input "Nomor Izin Usaha" → business_license_number (nib tidak diduplikasi).
        business_license_number: izin_usaha || null,
        npwp,
        address_line,
        // Kolom teks wajib backend diisi dari nama dropdown terpilih.
        city,
        province,
        // Alamat Kedudukan — dropdown provinsi/kota (mirror Individual CDD).
        business_province_code: business_province_code || null,
        business_province_name: province || null,
        business_city_code: business_city_code || null,
        business_city_name: city || null,
        business_district_code: business_district_code || null,
        business_district_name: business_district_name || null,
        business_village_code: business_village_code || null,
        business_village_name: business_village_name || null,
        postal_code,
        business_activity,
        business_activity_other: isLainnya(business_activity) ? business_activity_other || null : null,
        phone,
        company_email: company_email || null,
        pic_name: pic_name || null,
        pic_position: pic_position || null,
        pic_identity_number: pic_identity_number || null,
        pic_identity_type: pic_identity_type || null,
        source_of_funds: cdd_sof || null,
        source_of_funds_other: isLainnya(cdd_sof) ? cdd_sof_other || null : null,
        business_relationship_purpose: cdd_brp || null,
        business_relationship_purpose_other: isLainnya(cdd_brp) ? cdd_brp_other || null : null,
        distribution_channel: cdd_dist || null,
        // Porsi saham diisi lewat Step 2 sekarang, jadi selalu null di sini
        // saat aplikasi baru dibuat; state tetap dikirim agar payload konsisten.
        director_share_percentage: directorSharePct.trim() === "" ? null : Number(directorSharePct),
        commissioner_share_percentage: commissionerSharePct.trim() === "" ? null : Number(commissionerSharePct),
      };
      const res = await apiFetch<{ id: number; status: AppStatus }>(
        "/applications/business",
        { method: "POST", body: JSON.stringify(body) }
      );
      const id = res?.id;
      if (!id) throw new Error("Gagal membuat aplikasi (id kosong)");
      setAppId(id);
      router.replace(`/applications/new?type=business&app_id=${id}`);
      setStep(2);
    } catch (e: unknown) {
      const msg = friendlyBusinessError(e, "Gagal menyimpan informasi badan usaha");
      setErrCompany(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // ----- STEP 2: Parties (Pengurus, Pemegang Saham, BO) -----
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  // id party yang sedang diedit; null = form dipakai untuk tambah pihak baru.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [p_role, setPRole] = useState<PartyRole>("DIRECTOR");
  const [p_full_name, setPName] = useState("");
  const [p_id_type, setPIdType] = useState<"KTP" | "SIM" | "PASPOR" | "LAINNYA">("KTP");
  const [p_id_number, setPIdNumber] = useState("");
  const [p_dob, setPDob] = useState("");
  const [p_nationality, setPNat] = useState("Indonesia");
  const [p_phone, setPPhone] = useState("");
  const [p_email, setPEmail] = useState("");
  // Detail pemegang saham & BO
  const [p_ownership, setPOwnership] = useState("");
  const [p_address, setPAddress] = useState("");
  const [p_source_funds, setPSourceFunds] = useState("");
  const [p_source_wealth, setPSourceWealth] = useState("");

  const isOwnerRole = p_role === "SHAREHOLDER" || p_role === "BO";

  // Peran yang benar-benar ada menentukan field porsi saham mana yang tampil.
  const activeParties = parties.filter((p) => p.is_active !== false);
  const hasDirector = activeParties.some((p) => p.role === "DIRECTOR");
  const hasCommissioner = activeParties.some((p) => p.role === "COMMISSIONER");

  // Porsi saham pengurus utama (entity-level, opsional 0–100).
  const [directorSharePct, setDirectorSharePct] = useState("");
  const [commissionerSharePct, setCommissionerSharePct] = useState("");
  const [shareErr, setShareErr] = useState("");

  const [canContinue, setCanContinue] = useState(false);

  function recomputeParties(rows: PartyRow[]) {
    const active = rows.filter((r) => r.is_active !== false);
    // Backend minimum: minimal satu party pengurus/BO/PIC.
    const hasCore = active.some((r) =>
      ["DIRECTOR", "COMMISSIONER", "BO", "AUTHORIZED_REP"].includes(r.role)
    );
    setCanContinue(hasCore);
  }

  async function fetchParties() {
    if (!appId) return;
    const rows = await apiFetch<PartyRow[]>(`/applications/${appId}/parties`);
    setParties(rows);
    recomputeParties(rows);
  }

  // Pre-fill porsi saham when resuming an existing application on Step 2
  // (values are only ever set here now — Step 1 no longer collects them).
  async function fetchShares() {
    if (!appId) return;
    try {
      const resp = await apiFetch<{
        business?: {
          director_share_percentage?: number | string | null;
          commissioner_share_percentage?: number | string | null;
        };
      }>(`/applications/${appId}`);
      const b = resp?.business;
      if (b) {
        setDirectorSharePct(b.director_share_percentage != null ? String(b.director_share_percentage) : "");
        setCommissionerSharePct(b.commissioner_share_percentage != null ? String(b.commissioner_share_percentage) : "");
      }
    } catch {
      /* biarkan form kosong — user masih bisa mengisi ulang */
    }
  }

  const [savingShares, setSavingShares] = useState(false);

  async function saveShares() {
    if (!appId) return;
    if (!validateShares()) return;
    setSavingShares(true);
    try {
      // Field yang tersembunyi (perannya tidak ada lagi) dikirim null supaya
      // nilai lama tidak tertinggal di data badan usaha.
      await updateBusinessApplication(appId, {
        director_share_percentage:
          hasDirector && directorSharePct.trim() !== "" ? Number(directorSharePct) : null,
        commissioner_share_percentage:
          hasCommissioner && commissionerSharePct.trim() !== "" ? Number(commissionerSharePct) : null,
      });
      toast.success("Porsi saham tersimpan.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menyimpan porsi saham";
      setShareErr(msg);
      toast.error(msg);
    } finally {
      setSavingShares(false);
    }
  }

  function resetPartyForm() {
    setEditingId(null);
    setPRole("DIRECTOR");
    setPName("");
    setPIdType("KTP");
    setPIdNumber("");
    setPDob("");
    setPNat("Indonesia");
    setPPhone("");
    setPEmail("");
    setPOwnership("");
    setPAddress("");
    setPSourceFunds("");
    setPSourceWealth("");
  }

  /** Buka form yang sama dengan Tambah Pihak, terisi data baris terpilih. */
  function openEditParty(p: PartyRow) {
    setEditingId(p.id);
    setPRole(p.role);
    setPName(p.full_name ?? "");
    setPIdType((p.identity_type as "KTP" | "SIM" | "PASPOR" | "LAINNYA") || "KTP");
    setPIdNumber(p.identity_number ?? "");
    setPDob(p.dob ? String(p.dob).slice(0, 10) : "");
    setPNat(p.nationality ?? "");
    setPPhone("");
    setPEmail("");
    setPOwnership(p.ownership_percentage != null ? String(p.ownership_percentage) : "");
    setPAddress(p.address ?? "");
    setPSourceFunds(p.source_of_funds ?? "");
    setPSourceWealth(p.source_of_wealth ?? "");
    setErrParties(null);
    setAddOpen(true);
  }

  /**
   * Tambah (POST) atau ubah (PATCH /applications/:id/parties/:partyId) satu
   * pihak. Edit memakai baris yang sama — bukan hapus+buat ulang — supaya CIF
   * dan audit trail party tidak hilang.
   */
  async function saveParty() {
    if (!appId) return;
    if (p_id_number.length > 16) {
      setErrParties("Nomor Identitas maksimal 16 karakter.");
      toast.error("Nomor Identitas maksimal 16 karakter.");
      return;
    }
    setErrParties(null);
    setSaving(true);
    try {
      const body = {
        role: p_role,
        full_name: p_full_name,
        identity_type: p_id_type,
        identity_number: p_id_number,
        dob: p_dob || null,
        nationality: p_nationality || null,
        phone: p_phone || null,
        email: p_email || null,
        ownership_percentage: isOwnerRole && p_ownership !== "" ? Number(p_ownership) : undefined,
        address: isOwnerRole ? p_address || undefined : undefined,
        identity_document_type: p_id_type,
        source_of_funds: p_role === "BO" ? p_source_funds || undefined : undefined,
        source_of_wealth: p_role === "BO" ? p_source_wealth || undefined : undefined,
      };
      await apiFetch(
        editingId
          ? `/applications/${appId}/parties/${editingId}`
          : `/applications/${appId}/parties`,
        { method: editingId ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      setAddOpen(false);
      resetPartyForm();
      await fetchParties();
    } catch (e: unknown) {
      const msg =
        e instanceof Error
          ? e.message
          : editingId
            ? "Gagal menyimpan perubahan pihak"
            : "Gagal menambahkan pihak";
      setErrParties(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function removeParty(partyId: number) {
    if (!appId) return;
    setErrParties(null);
    try {
      await apiFetch(`/applications/${appId}/parties/${partyId}`, { method: "DELETE" });
      await fetchParties();
    } catch (e: unknown) {
      setErrParties(e instanceof Error ? e.message : "Gagal menghapus pihak");
    }
  }

  // Validate optional share portions: empty allowed, otherwise numeric 0–100.
  function validateShares(): boolean {
    const check = (v: string) => {
      if (v.trim() === "") return true;
      const n = Number(v);
      return !Number.isNaN(n) && n >= 0 && n <= 100;
    };
    if (!check(directorSharePct) || !check(commissionerSharePct)) {
      setShareErr("Porsi saham harus berupa angka antara 0 dan 100.");
      return false;
    }
    setShareErr("");
    return true;
  }

  useEffect(() => {
    if (step === 2) {
      fetchParties();
      fetchShares();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, appId]);

  // cegah enter jadi submit implisit
  function preventEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") e.preventDefault();
  }

  // ----- STEP 3: Documents -----
  // Optional override of the always-required labels from backend reference.
  const [docTypes, setDocTypes] = useState<BusinessDocType[]>(ALWAYS_REQUIRED_DOCS);
  // Dokumen yang sudah tersimpan di backend, dipetakan per doc_type.
  const [existingDocs, setExistingDocs] = useState<Record<string, BusinessDocument>>({});
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null);

  const loadDocs = useCallback(async () => {
    if (!appId) return;
    try {
      const rows = await apiFetch<BusinessDocument[]>(`/applications/${appId}/documents`);
      const byType: Record<string, BusinessDocument> = {};
      for (const d of Array.isArray(rows) ? rows : []) {
        // Backend keeps every upload; the newest row for a type wins.
        byType[d.doc_type] = d;
      }
      setExistingDocs(byType);
    } catch {
      /* biarkan kartu kosong — user masih bisa upload ulang */
    }
  }, [appId]);

  useEffect(() => {
    if (step === 3) loadDocs();
  }, [step, loadDocs]);

  useEffect(() => {
    if (step !== 3) return;
    apiFetch<unknown>("/references/business-document-types")
      .then((r) => {
        const list = toRefList<BusinessDocType>(r);
        if (list.length) {
          const always = list.filter((d) =>
            ALWAYS_REQUIRED_DOCS.some((a) => a.code === d.code)
          );
          if (always.length) setDocTypes(always);
        }
      })
      .catch(() => {
        /* keep built-in ALWAYS_REQUIRED_DOCS */
      });
  }, [step]);

  // Conditional document requirements derived from party composition.
  const needsShareholderDoc = activeParties.some(
    (p) => p.role === "SHAREHOLDER" && Number(p.ownership_percentage ?? 0) >= 25
  );
  const needsBoDoc = activeParties.some((p) => p.role === "BO");

  /** Upload langsung saat file dipilih, lalu segarkan status kartu. */
  async function uploadDoc(docType: string, file: File) {
    if (!appId) return;
    setErrDocs(null);
    setUploadingDoc(docType);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("doc_type", docType);
      await apiUpload(`/applications/${appId}/documents/upload`, form, true);
      await loadDocs();
      toast.success("Dokumen berhasil diunggah.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload dokumen gagal";
      setErrDocs(msg);
      toast.error(msg);
    } finally {
      setUploadingDoc(null);
    }
  }

  async function viewDoc(docId: number | string) {
    if (!appId) return;
    // Pre-open without noopener so the window reference stays navigable.
    const newTab = window.open("about:blank", "_blank");
    try {
      const resp = await apiFetch<{ signed_url?: string }>(
        `/applications/${appId}/documents/${docId}/url`,
      );
      if (resp?.signed_url) newTab?.location.replace(resp.signed_url);
      else throw new Error("no url");
    } catch {
      newTab?.close();
      toast.error("Gagal membuka dokumen. Silakan coba lagi.");
    }
  }

  async function deleteDoc(docId: number | string) {
    if (!appId) return;
    try {
      await apiFetch(`/applications/${appId}/documents/${docId}`, { method: "DELETE" });
      await loadDocs();
      toast.success("Dokumen berhasil dihapus.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Gagal menghapus dokumen");
    }
  }

  function saveDocumentsThenNext() {
    setErrDocs(null);

    const requiredCodes = [
      ...docTypes.map((d) => d.code),
      ...(needsShareholderDoc ? [SHAREHOLDER_DOC.code] : []),
      ...(needsBoDoc ? [BO_DOC.code] : []),
    ];
    const labelFor = (code: string) =>
      [...docTypes, SHAREHOLDER_DOC, BO_DOC].find((d) => d.code === code)?.name ?? code;

    // Dokumen yang sudah tersimpan di backend sudah memenuhi syarat — user tidak
    // perlu memilih ulang file yang sudah diunggah.
    const missing = requiredCodes.filter((code) => !isUploaded(existingDocs[code]));
    if (missing.length > 0) {
      setErrDocs(`Dokumen wajib belum lengkap: ${missing.map(labelFor).join(", ")}`);
      return;
    }
    setStep(4);
  }

  // ----- STEP 4: Review & Submit -----
  const [submitting, setSubmitting] = useState(false);

  async function submitApplication() {
    if (!appId) return;
    setErrDocs(null);
    setSubmitting(true);
    try {
      await apiFetch(`/applications/${appId}/submit`, { method: "PATCH" });
      setSubmitOK("Diajukan. Screening DTTOT/PPPSPM otomatis dijalankan.");
      router.push(`/users/${String(appId)}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Pengajuan gagal";
      // Surfaces backend "Dokumen wajib belum lengkap: ..." both inline and as toast.
      setErrDocs(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Stepper step={step} />
        {appId && (
          <div className="text-xs text-slate-500">
            ID Aplikasi: <b>{appId}</b>
          </div>
        )}
      </div>

      {/* Banner error/ok spesifik step */}
      {step === 1 && errCompany && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errCompany}</div>
      )}
      {step === 2 && errParties && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errParties}</div>
      )}
      {(step === 3 || step === 4) && errDocs && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errDocs}</div>
      )}
      {submitOK && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">{submitOK}</div>
      )}

      {/* STEP 1: Identitas Badan Usaha */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informasi Identitas Badan Usaha</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Nama Badan Usaha *</span>
                <input
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={legal_name}
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </label>
              <div className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Bentuk Badan Usaha *</span>
                <select
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={legal_form}
                  onChange={(e) => {
                    const v = e.target.value;
                    setLegalForm(v);
                    if (!isLainnya(v)) setLegalFormOther("");
                  }}
                >
                  <option value="">— Pilih —</option>
                  {rbaBusinessForms.length > 0
                    ? rbaBusinessForms.map((f) => (
                        <option key={f.code} value={f.code}>{f.name}</option>
                      ))
                    : ['PT','CV','FIRMA','KOPERASI','YAYASAN','PERKUMPULAN','PERORANGAN','BUMN_BUMD','LAINNYA'].map((f) => (
                        <option key={f} value={f}>{f}</option>
                      ))
                  }
                </select>
                <LainnyaField
                  when={legal_form}
                  value={legal_form_other}
                  onChange={setLegalFormOther}
                  label="Keterangan Bentuk Badan Usaha Lainnya"
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">
                  No. Akta Pendirian
                  {isPT && <span className="text-red-500"> *</span>}
                </span>
                <input
                  className={`w-full min-w-0 rounded-md border px-3 py-2 text-sm${deedErr ? " border-red-400" : ""}`}
                  value={deed_establishment_number}
                  onChange={(e) => {
                    setDeedEstablishmentNumber(e.target.value);
                    setDeedErr("");
                  }}
                />
                {deedErr && <p className="text-xs text-red-600">{deedErr}</p>}
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">No. Akta Perubahan Terakhir</span>
                <input
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={deed_latest_amendment_number}
                  onChange={(e) => setDeedLatestAmendmentNumber(e.target.value)}
                />
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Tanggal Pendirian *</span>
                <input
                  type="date"
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={incorporation_date}
                  onChange={(e) => setIncorpDate(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Nomor Izin Usaha (NIB/OSS/SIUP/dll) *</span>
                <input
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={izin_usaha}
                  onChange={(e) => setIzinUsaha(e.target.value)}
                />
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">NPWP Badan Usaha *</span>
                <input
                  className={`w-full min-w-0 rounded-md border px-3 py-2 text-sm${npwpErr ? " border-red-400" : ""}`}
                  value={npwp}
                  onChange={(e) => {
                    setNpwp(e.target.value.replace(/\D/g, ""));
                    setNpwpErr("");
                  }}
                  maxLength={15}
                  inputMode="numeric"
                  placeholder="15 digit angka"
                />
                {npwpErr && <p className="text-xs text-red-600">{npwpErr}</p>}
              </label>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-1 min-w-0">
                <label className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Bidang Usaha *</span>
                  <select
                    className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                    value={business_activity}
                    onChange={(e) => {
                      const v = e.target.value;
                      setBizAct(v);
                      if (!isLainnya(v)) setBizActOther("");
                    }}
                  >
                    <option value="">— Pilih bidang usaha —</option>
                    {industryCategories.map((i) => (
                      <option key={i.code} value={i.name}>{i.name}</option>
                    ))}
                    {business_activity && !industryCategories.find((i) => i.name === business_activity) && (
                      <option value={business_activity}>{business_activity}</option>
                    )}
                  </select>
                </label>
                <LainnyaField
                  when={business_activity}
                  value={business_activity_other}
                  onChange={setBizActOther}
                  label="Keterangan Bidang Usaha Lainnya"
                  placeholder="Tuliskan bidang usaha lainnya"
                />
              </div>
            </div>

            <label className="grid gap-1 min-w-0">
              <span className="text-sm font-medium">Alamat Kedudukan *</span>
              <textarea
                className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                rows={2}
                value={address_line}
                onChange={(e) => setAddr(e.target.value)}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Provinsi *</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-white px-3 py-2 text-sm"
                  value={business_province_code}
                  onChange={(e) => {
                    const code = e.target.value;
                    setBizProvinceCode(code);
                    setProvince(provinces.find((p) => p.code === code)?.name || "");
                    setBizCityCode("");
                    setCity("");
                    setBizDistrictCode("");
                    setBizDistrictName("");
                    setBizVillageCode("");
                    setBizVillageName("");
                  }}
                >
                  <option value="">— Pilih Provinsi —</option>
                  {provinces.map((p) => (
                    <option key={p.code} value={p.code}>{p.name}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Kota / Kabupaten *</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  value={business_city_code}
                  disabled={!business_province_code || regenciesLoading}
                  onChange={(e) => {
                    const code = e.target.value;
                    setBizCityCode(code);
                    setCity(regencies.find((r) => r.code === code)?.name || "");
                    setBizDistrictCode("");
                    setBizDistrictName("");
                    setBizVillageCode("");
                    setBizVillageName("");
                  }}
                >
                  {regenciesLoading ? (
                    <option disabled>Memuat...</option>
                  ) : business_province_code && regencies.length === 0 ? (
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
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Kecamatan</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  value={business_district_code}
                  disabled={!business_city_code || districtsLoading}
                  onChange={(e) => {
                    const code = e.target.value;
                    setBizDistrictCode(code);
                    setBizDistrictName(districts.find((d) => d.code === code)?.name || "");
                    setBizVillageCode("");
                    setBizVillageName("");
                  }}
                >
                  {districtsLoading ? (
                    <option disabled>Memuat...</option>
                  ) : business_city_code && districts.length === 0 ? (
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
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Kelurahan / Desa</span>
                <select
                  className="w-full min-w-0 rounded-md border bg-white px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                  value={business_village_code}
                  disabled={!business_district_code || villagesLoading}
                  onChange={(e) => {
                    const code = e.target.value;
                    setBizVillageCode(code);
                    setBizVillageName(villages.find((v) => v.code === code)?.name || "");
                  }}
                >
                  {villagesLoading ? (
                    <option disabled>Memuat...</option>
                  ) : business_district_code && villages.length === 0 ? (
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
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Kode Pos *</span>
                <input
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={postal_code}
                  onChange={(e) => setPostal(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Nomor Telepon Perusahaan *</span>
                <input
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="grid gap-1 min-w-0">
                <span className="text-sm font-medium">Email Perusahaan</span>
                <input
                  type="email"
                  className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                  value={company_email}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                />
              </label>
            </div>

            {/* PIC / Pengurus Utama */}
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">Pengurus Utama / PIC</p>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Nama Pengurus Utama / PIC</span>
                  <input
                    className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                    value={pic_name}
                    onChange={(e) => setPicName(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Jabatan</span>
                  <input
                    className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                    value={pic_position}
                    onChange={(e) => setPicPosition(e.target.value)}
                  />
                </label>
                <label className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Nomor Identitas</span>
                  <input
                    className={`w-full min-w-0 rounded-md border px-3 py-2 text-sm${picIdErr ? " border-red-400" : ""}`}
                    value={pic_identity_number}
                    onChange={(e) => {
                      setPicIdNumber(e.target.value);
                      setPicIdErr("");
                    }}
                    maxLength={16}
                  />
                  {picIdErr ? (
                    <p className="text-xs text-red-600">{picIdErr}</p>
                  ) : (
                    <p className="text-xs text-slate-400">Maksimal 16 karakter.</p>
                  )}
                </label>
                <label className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Jenis Identitas</span>
                  <select
                    className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                    value={pic_identity_type}
                    onChange={(e) => setPicIdType(e.target.value as "KTP" | "PASPOR")}
                  >
                    <option value="KTP">KTP</option>
                    <option value="PASPOR">Paspor</option>
                  </select>
                </label>
              </div>
            </div>

            {/* RBA */}
            <div className="border-t pt-4">
              <p className="mb-1 text-sm font-semibold text-slate-700">Informasi Hubungan Bisnis (RBA)</p>
              <p className="mb-3 text-xs text-slate-500">Pilihan ini digunakan untuk perhitungan Risk Based Approach sesuai SOP.</p>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Sumber Dana</span>
                  <select
                    className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                    value={cdd_sof}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCddSof(v);
                      if (!isLainnya(v)) setCddSofOther("");
                    }}
                  >
                    <option value="">— Pilih —</option>
                    {rbaSofList.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                  <LainnyaField
                    when={cdd_sof}
                    value={cdd_sof_other}
                    onChange={setCddSofOther}
                    label="Keterangan Sumber Dana Lainnya"
                  />
                </div>
                <div className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Tujuan Hubungan Bisnis</span>
                  <select
                    className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                    value={cdd_brp}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCddBrp(v);
                      if (!isLainnya(v)) setCddBrpOther("");
                    }}
                  >
                    <option value="">— Pilih —</option>
                    {rbaBrpList.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                  <LainnyaField
                    when={cdd_brp}
                    value={cdd_brp_other}
                    onChange={setCddBrpOther}
                    label="Keterangan Tujuan Hubungan Bisnis Lainnya"
                  />
                </div>
                <label className="grid gap-1 min-w-0">
                  <span className="text-sm font-medium">Saluran Distribusi</span>
                  <select
                    className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                    value={cdd_dist}
                    onChange={(e) => setCddDist(e.target.value)}
                  >
                    <option value="">— Pilih —</option>
                    {rbaDistList.map((d) => (
                      <option key={d.code} value={d.code}>{d.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={saveCompany}
                className="rounded-md bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Menyimpan..." : "Simpan & Lanjut"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Pengurus & Pemegang Saham */}
      {step === 2 && (
        <Card onKeyDown={preventEnter}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Informasi Pengurus &amp; Pemegang Saham</CardTitle>
            <button
              type="button"
              onClick={() => {
                resetPartyForm();
                setAddOpen(true);
              }}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              + Tambah Pihak
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Modal sederhana Tambah / Edit Party */}
            {addOpen && (
              <div className="rounded-xl border p-4">
                <p className="mb-3 text-sm font-semibold text-slate-700">
                  {editingId ? "Edit Pihak" : "Tambah Pihak"}
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Peran</span>
                    <select
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_role}
                      onChange={(e) => setPRole(e.target.value as PartyRole)}
                    >
                      {(Object.keys(PARTY_ROLE_LABELS) as PartyRole[]).map((r) => (
                        <option key={r} value={r}>
                          {PARTY_ROLE_LABELS[r]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Nama</span>
                    <input
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_full_name}
                      onChange={(e) => setPName(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Jenis Identitas</span>
                    <select
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_id_type}
                      onChange={(e) =>
                        setPIdType(e.target.value as "KTP" | "SIM" | "PASPOR" | "LAINNYA")
                      }
                    >
                      <option>KTP</option>
                      <option>SIM</option>
                      <option>PASPOR</option>
                      <option>LAINNYA</option>
                    </select>
                  </label>
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Nomor Identitas</span>
                    <input
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_id_number}
                      onChange={(e) => setPIdNumber(e.target.value)}
                      maxLength={16}
                    />
                    <span className="text-xs text-slate-400">Maksimal 16 karakter.</span>
                  </label>
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Tgl Lahir</span>
                    <input
                      type="date"
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_dob}
                      onChange={(e) => setPDob(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Kewarganegaraan</span>
                    <input
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_nationality}
                      onChange={(e) => setPNat(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Telepon</span>
                    <input
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_phone}
                      onChange={(e) => setPPhone(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1 min-w-0">
                    <span className="text-sm font-medium">Email</span>
                    <input
                      type="email"
                      className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                      value={p_email}
                      onChange={(e) => setPEmail(e.target.value)}
                    />
                  </label>

                  {/* Pemegang Saham / BO detail */}
                  {isOwnerRole && (
                    <>
                      <label className="grid gap-1 min-w-0">
                        <span className="text-sm font-medium">Persentase Kepemilikan (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                          value={p_ownership}
                          onChange={(e) => setPOwnership(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1 min-w-0">
                        <span className="text-sm font-medium">Alamat</span>
                        <input
                          className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                          value={p_address}
                          onChange={(e) => setPAddress(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {p_role === "BO" && (
                    <>
                      <label className="grid gap-1 min-w-0">
                        <span className="text-sm font-medium">Sumber Dana BO</span>
                        <input
                          className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                          value={p_source_funds}
                          onChange={(e) => setPSourceFunds(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1 min-w-0">
                        <span className="text-sm font-medium">Sumber Kekayaan BO</span>
                        <input
                          className="w-full min-w-0 rounded-md border px-3 py-2 text-sm"
                          value={p_source_wealth}
                          onChange={(e) => setPSourceWealth(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-sm"
                    onClick={() => {
                      setAddOpen(false);
                      resetPartyForm();
                    }}
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 transition-colors"
                    onClick={saveParty}
                    disabled={saving}
                  >
                    {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Tambah"}
                  </button>
                </div>
              </div>
            )}

            {!canContinue && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                Tambahkan minimal satu Pengurus (Direktur/Komisaris), Beneficial Owner, atau PIC.
              </div>
            )}

            {/* Tabel parties */}
            <div className="overflow-x-auto">
              <Table className="min-w-[860px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead>Identitas</TableHead>
                    <TableHead>Kepemilikan</TableHead>
                    <TableHead>CIF</TableHead>
                    <TableHead>Parameter CIF</TableHead>
                    <TableHead className="whitespace-nowrap text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-6 text-center text-sm text-slate-500">
                        Belum ada pihak.
                      </TableCell>
                    </TableRow>
                  ) : (
                    parties.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.full_name}
                          {(p.address || p.source_of_funds || p.source_of_wealth) && (
                            <div className="text-xs font-normal text-slate-400 mt-0.5 space-y-0.5">
                              {p.address && <div>Alamat: {p.address}</div>}
                              {p.source_of_funds && <div>Sumber Dana: {p.source_of_funds}</div>}
                              {p.source_of_wealth && <div>Sumber Kekayaan: {p.source_of_wealth}</div>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>{PARTY_ROLE_LABELS[p.role] ?? p.role}</TableCell>
                        <TableCell>
                          {(p.identity_document_type || p.identity_type) || "—"} •{" "}
                          {p.identity_number || "—"}
                        </TableCell>
                        <TableCell>
                          {p.ownership_percentage != null && p.ownership_percentage !== ""
                            ? `${p.ownership_percentage}%`
                            : "—"}
                        </TableCell>
                        <TableCell>{formatCif(p.cif_no)}</TableCell>
                        <TableCell>{getCifRelationshipLabel(p.cif_relationship_type)}</TableCell>
                        <TableCell className="whitespace-nowrap text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 text-sm hover:bg-slate-50"
                              onClick={() => openEditParty(p)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="rounded-md border px-2 py-1 text-sm hover:bg-slate-50"
                              onClick={() => removeParty(p.id)}
                            >
                              Hapus
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Porsi saham pengurus utama (opsional) — disetel via PATCH
                /applications/:id/business, terpisah dari alur tambah/hapus pihak. */}
            <div className="rounded-xl border p-4 space-y-3">
              <p className="text-sm font-semibold text-slate-700">Porsi Saham Pengurus Utama</p>
              <p className="text-xs text-slate-500">
                Opsional, isi jika direktur/komisaris memiliki porsi saham.
              </p>
              {!hasDirector && !hasCommissioner ? (
                <p className="text-sm text-slate-500">
                  Tambahkan Direktur/Komisaris untuk mengisi porsi saham.
                </p>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {hasDirector && (
                      <label className="grid gap-1 min-w-0">
                        <span className="text-sm font-medium">Porsi Saham Direktur Utama (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className={`w-full min-w-0 rounded-md border px-3 py-2 text-sm${shareErr ? " border-red-400" : ""}`}
                          value={directorSharePct}
                          onChange={(e) => {
                            setDirectorSharePct(e.target.value);
                            setShareErr("");
                          }}
                          placeholder="0 - 100"
                        />
                      </label>
                    )}
                    {hasCommissioner && (
                      <label className="grid gap-1 min-w-0">
                        <span className="text-sm font-medium">Porsi Saham Komisaris (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="0.01"
                          className={`w-full min-w-0 rounded-md border px-3 py-2 text-sm${shareErr ? " border-red-400" : ""}`}
                          value={commissionerSharePct}
                          onChange={(e) => {
                            setCommissionerSharePct(e.target.value);
                            setShareErr("");
                          }}
                          placeholder="0 - 100"
                        />
                      </label>
                    )}
                  </div>
                  {shareErr && <p className="text-xs text-red-600">{shareErr}</p>}
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={saveShares}
                      disabled={savingShares}
                      className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50"
                    >
                      {savingShares ? "Menyimpan..." : "Simpan Porsi Saham"}
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canContinue}
                title={!canContinue ? "Tambahkan minimal 1 Pengurus/BO/PIC" : ""}
                className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
              >
                Lanjut
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Documents */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dokumen Wajib</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {[
                ...docTypes.map((d) => ({ ...d, required: true })),
                { ...SHAREHOLDER_DOC, required: needsShareholderDoc },
                { ...BO_DOC, required: needsBoDoc },
              ].map((d) => (
                <DocCard
                  key={d.code}
                  code={d.code}
                  name={d.name}
                  required={d.required}
                  doc={existingDocs[d.code]}
                  busy={uploadingDoc === d.code}
                  onPick={uploadDoc}
                  onView={viewDoc}
                  onDelete={deleteDoc}
                />
              ))}
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Kembali
              </button>
              <button
                type="button"
                disabled={!!uploadingDoc}
                onClick={saveDocumentsThenNext}
                className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {uploadingDoc ? "Mengunggah..." : "Simpan & Lanjut"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Review & Submit */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tinjauan & Ajukan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>Informasi identitas badan usaha lengkap (Nama, Akta, Izin Usaha, NPWP, Alamat, Telepon).</li>
              <li>Pengurus, Pemegang Saham, dan Beneficial Owner sudah dicatat.</li>
              <li>Dokumen wajib: Akta, NIB/Izin Usaha, NPWP Badan, Dokumen Identitas Pengurus (serta dokumen pemegang saham ≥25% / BO bila relevan).</li>
              <li>Submit akan menjalankan screening DTTOT/PPPSPM otomatis.</li>
            </ul>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={submitApplication}
                disabled={submitting}
                className="rounded-md bg-kesh-700 px-4 py-2 text-sm font-medium text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {submitting ? "Mengajukan..." : "Ajukan Aplikasi"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
