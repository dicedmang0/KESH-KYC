"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUpload } from "@/lib/api";
import { toast } from "@/lib/toast";
import { formatCif } from "@/lib/utils";
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

type BusinessDocType = { code: string; name: string };

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
const ALWAYS_REQUIRED_DOCS: BusinessDocType[] = [
  { code: "BUSINESS_DEED_ESTABLISHMENT_AMENDMENT", name: "Akta Pendirian & Perubahan" },
  { code: "BUSINESS_LICENSE", name: "NIB / Izin Usaha" },
  { code: "BUSINESS_NPWP", name: "NPWP Badan Usaha" },
  { code: "BUSINESS_MANAGEMENT_IDENTITY", name: "Dokumen Identitas Pengurus" },
];
const SHAREHOLDER_DOC: BusinessDocType = {
  code: "BUSINESS_SHAREHOLDER_IDENTITY_25",
  name: "Dokumen Identitas Pemegang Saham ≥25%",
};
const BO_DOC: BusinessDocType = { code: "BUSINESS_BO_DOCUMENT", name: "Dokumen BO" };

type Step = 1 | 2 | 3 | 4;

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: "Identitas" },
    { n: 2, label: "Pengurus & Pemegang Saham" },
    { n: 3, label: "Dokumen" },
    { n: 4, label: "Tinjauan" },
  ];
  return (
    <div className="flex items-center gap-3">
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

  // ----- State umum -----
  const [step, setStep] = useState<Step>(1);
  const [saving, setSaving] = useState(false);

  // banner per step
  const [errCompany, setErrCompany] = useState<string | null>(null);
  const [errParties, setErrParties] = useState<string | null>(null);
  const [errDocs, setErrDocs] = useState<string | null>(null);
  const [submitOK, setSubmitOK] = useState<string | null>(null);

  // setelah Step 1 berhasil → pegang appId untuk step berikutnya
  const [appId, setAppId] = useState<number | string | null>(null);

  // ----- STEP 1: Identitas Badan Usaha + PIC -----
  const [legal_name, setLegalName] = useState("");
  const [legal_form, setLegalForm] = useState("PT");
  const [deed_number, setDeedNumber] = useState("");
  const [incorporation_place, setIncorpPlace] = useState("Indonesia");
  const [incorporation_date, setIncorpDate] = useState("");
  // Nomor Izin Usaha (NIB/OSS/SIUP/dll) — primary payload business_license_number.
  const [izin_usaha, setIzinUsaha] = useState("");
  const [npwp, setNpwp] = useState("");
  const [address_line, setAddr] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal_code, setPostal] = useState("");
  const [business_activity, setBizAct] = useState("");
  const [industry_code, setKbli] = useState("");
  const [phone, setPhone] = useState("");
  const [company_email, setCompanyEmail] = useState("");
  // PIC (Pengurus Utama)
  const [pic_name, setPicName] = useState("");
  const [pic_position, setPicPosition] = useState("");
  const [pic_identity_number, setPicIdNumber] = useState("");
  const [pic_identity_type, setPicIdType] = useState<"KTP" | "PASPOR">("KTP");

  // RBA CDD fields
  const [cdd_sof, setCddSof] = useState("");
  const [cdd_brp, setCddBrp] = useState("");
  const [cdd_dist, setCddDist] = useState("");

  // RBA reference lists
  const [rbaBusinessForms, setRbaBusinessForms] = useState<{ code: string; name: string }[]>([]);
  const [rbaIndustries, setRbaIndustries] = useState<{ code: string; name: string }[]>([]);
  const [rbaSofList, setRbaSofList] = useState<{ code: string; name: string }[]>([]);
  const [rbaBrpList, setRbaBrpList] = useState<{ code: string; name: string }[]>([]);
  const [rbaDistList, setRbaDistList] = useState<{ code: string; name: string }[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<unknown>("/references/rba/business-forms"),
      apiFetch<unknown>("/references/rba/industries"),
      apiFetch<unknown>("/references/rba/source-of-funds"),
      apiFetch<unknown>("/references/rba/business-purposes"),
      apiFetch<unknown>("/references/rba/distributions"),
    ]).then(([bf, ind, sof, bp, dist]) => {
      setRbaBusinessForms(toRefList(bf));
      setRbaIndustries(toRefList(ind));
      setRbaSofList(toRefList(sof));
      setRbaBrpList(toRefList(bp));
      setRbaDistList(toRefList(dist));
    }).catch(() => {});
  }, []);

  async function saveCompany() {
    setErrCompany(null);
    setSubmitOK(null);
    setSaving(true);
    try {
      const body = {
        legal_name,
        legal_form,
        deed_number: deed_number || null,
        incorporation_place,
        incorporation_date,
        // Satu input "Nomor Izin Usaha" → business_license_number (nib tidak diduplikasi).
        business_license_number: izin_usaha || null,
        npwp,
        address_line,
        city,
        province,
        postal_code,
        business_activity,
        industry_code: industry_code || null,
        phone,
        company_email: company_email || null,
        pic_name: pic_name || null,
        pic_position: pic_position || null,
        pic_identity_number: pic_identity_number || null,
        pic_identity_type: pic_identity_type || null,
        source_of_funds: cdd_sof || null,
        business_relationship_purpose: cdd_brp || null,
        distribution_channel: cdd_dist || null,
      };
      const res = await apiFetch<{ id: number; status: AppStatus }>(
        "/applications/business",
        { method: "POST", body: JSON.stringify(body) }
      );
      const id = res?.id;
      if (!id) throw new Error("Gagal membuat aplikasi (id kosong)");
      setAppId(id);
      setStep(2);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menyimpan informasi badan usaha";
      setErrCompany(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  // ----- STEP 2: Parties (Pengurus, Pemegang Saham, BO) -----
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
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

  function resetPartyForm() {
    setPName("");
    setPIdNumber("");
    setPDob("");
    setPPhone("");
    setPEmail("");
    setPOwnership("");
    setPAddress("");
    setPSourceFunds("");
    setPSourceWealth("");
  }

  async function addParty() {
    if (!appId) return;
    setErrParties(null);
    setSaving(true);
    try {
      await apiFetch(`/applications/${appId}/parties`, {
        method: "POST",
        body: JSON.stringify({
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
        }),
      });
      setAddOpen(false);
      resetPartyForm();
      await fetchParties();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Gagal menambahkan pihak";
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

  useEffect(() => {
    if (step === 2) fetchParties();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, appId]);

  // cegah enter jadi submit implisit
  function preventEnter(e: React.KeyboardEvent) {
    if (e.key === "Enter") e.preventDefault();
  }

  // ----- STEP 3: Documents -----
  // Optional override of the always-required labels from backend reference.
  const [docTypes, setDocTypes] = useState<BusinessDocType[]>(ALWAYS_REQUIRED_DOCS);
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({});

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
  const activeParties = parties.filter((p) => p.is_active !== false);
  const needsShareholderDoc = activeParties.some(
    (p) => p.role === "SHAREHOLDER" && Number(p.ownership_percentage ?? 0) >= 25
  );
  const needsBoDoc = activeParties.some((p) => p.role === "BO");

  async function uploadDoc(file: File, docType: string) {
    if (!appId || !file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);
    await apiUpload(`/applications/${appId}/documents/upload`, form, true);
  }

  async function saveDocumentsThenNext() {
    setErrDocs(null);

    const requiredCodes = [
      ...docTypes.map((d) => d.code),
      ...(needsShareholderDoc ? [SHAREHOLDER_DOC.code] : []),
      ...(needsBoDoc ? [BO_DOC.code] : []),
    ];
    const labelFor = (code: string) =>
      [...docTypes, SHAREHOLDER_DOC, BO_DOC].find((d) => d.code === code)?.name ?? code;

    const missing = requiredCodes.filter((code) => !docFiles[code]);
    if (missing.length > 0) {
      setErrDocs(`Dokumen wajib belum lengkap: ${missing.map(labelFor).join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      // Upload every selected file (required + any optional conditional docs).
      for (const [code, file] of Object.entries(docFiles)) {
        if (file) await uploadDoc(file, code);
      }
      setStep(4);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Upload dokumen gagal";
      setErrDocs(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  function DocCard({ code, name, required }: { code: string; name: string; required: boolean }) {
    return (
      <div className="rounded-md border border-dashed p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-medium">{name}</span>
          {required ? (
            <span className="text-red-500">*</span>
          ) : (
            <span className="text-xs text-slate-400">(Opsional / tidak wajib untuk data saat ini)</span>
          )}
        </div>
        <input
          type="file"
          accept="image/png,image/jpeg,application/pdf"
          onChange={(e) =>
            setDocFiles((s) => ({ ...s, [code]: e.target.files?.[0] || null }))
          }
        />
      </div>
    );
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
              <label className="grid gap-1">
                <span className="text-sm font-medium">Nama Badan Usaha *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={legal_name}
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Bentuk Badan Usaha *</span>
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={legal_form}
                  onChange={(e) => setLegalForm(e.target.value)}
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
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">
                  Nomor Akta Pendirian &amp; Perubahan Terakhir
                </span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={deed_number}
                  onChange={(e) => setDeedNumber(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Tanggal Pendirian *</span>
                <input
                  type="date"
                  className="rounded-md border px-3 py-2 text-sm"
                  value={incorporation_date}
                  onChange={(e) => setIncorpDate(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Tempat Pendirian *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={incorporation_place}
                  onChange={(e) => setIncorpPlace(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Nomor Izin Usaha (NIB/OSS/SIUP/dll) *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={izin_usaha}
                  onChange={(e) => setIzinUsaha(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">NPWP *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={npwp}
                  onChange={(e) => setNpwp(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">KBLI (opsional)</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={industry_code}
                  onChange={(e) => setKbli(e.target.value)}
                />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Bidang Usaha *</span>
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={business_activity}
                  onChange={(e) => setBizAct(e.target.value)}
                >
                  <option value="">— Pilih bidang usaha —</option>
                  {rbaIndustries.map((i) => (
                    <option key={i.code} value={i.name}>{i.name}</option>
                  ))}
                  {business_activity && !rbaIndustries.find((i) => i.name === business_activity) && (
                    <option value={business_activity}>{business_activity}</option>
                  )}
                </select>
              </label>
            </div>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Alamat Kedudukan *</span>
              <textarea
                className="rounded-md border px-3 py-2 text-sm"
                rows={2}
                value={address_line}
                onChange={(e) => setAddr(e.target.value)}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Kota *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Provinsi *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Kode Pos *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={postal_code}
                  onChange={(e) => setPostal(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Nomor Telepon Perusahaan *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Email Perusahaan</span>
                <input
                  type="email"
                  className="rounded-md border px-3 py-2 text-sm"
                  value={company_email}
                  onChange={(e) => setCompanyEmail(e.target.value)}
                />
              </label>
            </div>

            {/* PIC / Pengurus Utama */}
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-semibold text-slate-700">Pengurus Utama / PIC</p>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Nama Pengurus Utama / PIC</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={pic_name}
                    onChange={(e) => setPicName(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Jabatan</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={pic_position}
                    onChange={(e) => setPicPosition(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Nomor Identitas</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={pic_identity_number}
                    onChange={(e) => setPicIdNumber(e.target.value)}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Jenis Identitas</span>
                  <select
                    className="rounded-md border px-3 py-2 text-sm"
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
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Sumber Dana</span>
                  <select
                    className="rounded-md border px-3 py-2 text-sm"
                    value={cdd_sof}
                    onChange={(e) => setCddSof(e.target.value)}
                  >
                    <option value="">— Pilih —</option>
                    {rbaSofList.map((s) => (
                      <option key={s.code} value={s.code}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Tujuan Hubungan Bisnis</span>
                  <select
                    className="rounded-md border px-3 py-2 text-sm"
                    value={cdd_brp}
                    onChange={(e) => setCddBrp(e.target.value)}
                  >
                    <option value="">— Pilih —</option>
                    {rbaBrpList.map((p) => (
                      <option key={p.code} value={p.code}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Saluran Distribusi</span>
                  <select
                    className="rounded-md border px-3 py-2 text-sm"
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
              onClick={() => setAddOpen(true)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              + Tambah Pihak
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Modal sederhana Add Party */}
            {addOpen && (
              <div className="rounded-xl border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Peran</span>
                    <select
                      className="rounded-md border px-3 py-2 text-sm"
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
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Nama</span>
                    <input
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_full_name}
                      onChange={(e) => setPName(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Jenis Identitas</span>
                    <select
                      className="rounded-md border px-3 py-2 text-sm"
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
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Nomor Identitas</span>
                    <input
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_id_number}
                      onChange={(e) => setPIdNumber(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Tgl Lahir</span>
                    <input
                      type="date"
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_dob}
                      onChange={(e) => setPDob(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Kewarganegaraan</span>
                    <input
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_nationality}
                      onChange={(e) => setPNat(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Telepon</span>
                    <input
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_phone}
                      onChange={(e) => setPPhone(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Email</span>
                    <input
                      type="email"
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_email}
                      onChange={(e) => setPEmail(e.target.value)}
                    />
                  </label>

                  {/* Pemegang Saham / BO detail */}
                  {isOwnerRole && (
                    <>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">Persentase Kepemilikan (%)</span>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="rounded-md border px-3 py-2 text-sm"
                          value={p_ownership}
                          onChange={(e) => setPOwnership(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">Alamat</span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={p_address}
                          onChange={(e) => setPAddress(e.target.value)}
                        />
                      </label>
                    </>
                  )}
                  {p_role === "BO" && (
                    <>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">Sumber Dana BO</span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
                          value={p_source_funds}
                          onChange={(e) => setPSourceFunds(e.target.value)}
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-sm font-medium">Sumber Kekayaan BO</span>
                        <input
                          className="rounded-md border px-3 py-2 text-sm"
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
                    onClick={addParty}
                    disabled={saving}
                  >
                    {saving ? "Menyimpan..." : "Tambah"}
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nama</TableHead>
                    <TableHead>Peran</TableHead>
                    <TableHead>Identitas</TableHead>
                    <TableHead>Kepemilikan</TableHead>
                    <TableHead>CIF</TableHead>
                    <TableHead>Parameter CIF</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
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
                        <TableCell className="text-right">
                          <button
                            type="button"
                            className="rounded-md border px-2 py-1 text-sm hover:bg-slate-50"
                            onClick={() => removeParty(p.id)}
                          >
                            Hapus
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
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
              {docTypes.map((d) => (
                <DocCard key={d.code} code={d.code} name={d.name} required />
              ))}
              <DocCard
                code={SHAREHOLDER_DOC.code}
                name={SHAREHOLDER_DOC.name}
                required={needsShareholderDoc}
              />
              <DocCard code={BO_DOC.code} name={BO_DOC.name} required={needsBoDoc} />
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
                disabled={saving}
                onClick={saveDocumentsThenNext}
                className="rounded-md bg-kesh-700 px-3 py-1.5 text-sm text-white hover:bg-kesh-600 disabled:opacity-50 transition-colors"
              >
                {saving ? "Mengunggah..." : "Simpan & Lanjut"}
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
