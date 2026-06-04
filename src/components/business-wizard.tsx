"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiUpload } from "@/lib/api";

type AppStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "IN_REVIEW"
  | "ESCALATED"
  | "APPROVED"
  | "REJECTED";
type PartyRole =
  | "DIRECTOR"
  | "COMMISSIONER"
  | "MANAGER"
  | "BO"
  | "AUTHORIZED_REP";

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
};

type Step = 1 | 2 | 3 | 4;

function Stepper({ step }: { step: Step }) {
  const items = [
    { n: 1, label: "Company" },
    { n: 2, label: "Parties" },
    { n: 3, label: "Documents" },
    { n: 4, label: "Review" },
  ];
  return (
    <div className="flex items-center gap-3">
      {items.map((it, i) => (
        <div key={it.n} className="flex items-center gap-3">
          <div
            className={`h-8 w-8 rounded-full text-xs flex items-center justify-center font-medium ${
              step >= it.n
                ? "bg-black text-white"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            {it.n}
          </div>
          <span
            className={`text-sm ${
              step >= it.n ? "text-slate-900" : "text-slate-500"
            }`}
          >
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

  // ----- STEP 1: Company info -----
  const [legal_name, setLegalName] = useState("");
  const [legal_form, setLegalForm] = useState("PT");
  const [incorporation_place, setIncorpPlace] = useState("Indonesia");
  const [incorporation_date, setIncorpDate] = useState("");
  const [business_license_number, setBizLic] = useState("");
  const [nib, setNib] = useState("");
  const [npwp, setNpwp] = useState("");
  const [address_line, setAddr] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postal_code, setPostal] = useState("");
  const [business_activity, setBizAct] = useState("");
  const [industry_code, setKbli] = useState("");
  const [phone, setPhone] = useState("");

  async function saveCompany() {
    setErrCompany(null);
    setSubmitOK(null);
    setSaving(true);
    try {
      const body = {
        legal_name,
        legal_form,
        incorporation_place,
        incorporation_date,
        business_license_number,
        nib,
        npwp,
        address_line,
        city,
        province,
        postal_code,
        business_activity,
        industry_code: industry_code || null,
        phone,
      };
      const res = await apiFetch<{ id: number; status: AppStatus }>(
        "/applications/business",
        {
          method: "POST",
          body: JSON.stringify(body),
        }
      );
      const id = (res as any)?.id;
      if (!id) throw new Error("Gagal membuat aplikasi (id kosong)");
      setAppId(id);
      setStep(2);
    } catch (e: any) {
      setErrCompany(e?.message || "Gagal menyimpan company info");
    } finally {
      setSaving(false);
    }
  }

  // ----- STEP 2: Parties -----
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [p_role, setPRole] = useState<PartyRole>("DIRECTOR");
  const [p_full_name, setPName] = useState("");
  const [p_id_type, setPIdType] = useState<
    "KTP" | "SIM" | "PASPOR" | "LAINNYA"
  >("KTP");
  const [p_id_number, setPIdNumber] = useState("");
  const [p_dob, setPDob] = useState("");
  const [p_nationality, setPNat] = useState("Indonesia");
  const [p_phone, setPPhone] = useState("");
  const [p_email, setPEmail] = useState("");

  const [missing, setMissing] = useState<string[]>([]);
  const [canContinue, setCanContinue] = useState(false);

  function recomputeParties(rows: PartyRow[]) {
    const roles = new Set(rows.map((r) => r.role));
    const hasPengurus = roles.has("DIRECTOR") || roles.has("COMMISSIONER");
    const hasBO = roles.has("BO");
    const hasAuthRep = roles.has("AUTHORIZED_REP");

    const m: string[] = [];
    if (!hasPengurus) m.push("Minimal 1 PENGURUS (DIRECTOR/COMMISSIONER)");
    if (!hasBO) m.push("Minimal 1 BENEFICIAL OWNER (BO)");
    if (!hasAuthRep) m.push("Minimal 1 AUTHORIZED REPRESENTATIVE");

    setMissing(m);
    setCanContinue(m.length === 0);
  }

  async function fetchParties() {
    if (!appId) return;
    const rows = await apiFetch<PartyRow[]>(`/applications/${appId}/parties`);
    setParties(rows);
    recomputeParties(rows);
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
        }),
      });
      setAddOpen(false);
      setPName("");
      setPIdNumber("");
      setPDob("");
      setPPhone("");
      setPEmail("");
      await fetchParties();
    } catch (e: any) {
      setErrParties(e?.message || "Gagal menambahkan party");
    } finally {
      setSaving(false);
    }
  }

  async function removeParty(partyId: number) {
    if (!appId) return;
    setErrParties(null);
    try {
      await apiFetch(`/applications/${appId}/parties/${partyId}`, {
        method: "DELETE",
      });
      await fetchParties();
    } catch (e: any) {
      setErrParties(e?.message || "Gagal menghapus party");
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
  const [aktaFile, setAkta] = useState<File | null>(null);
  const [nibFile, setNibFile] = useState<File | null>(null);
  const [npwpFile, setNpwpFile] = useState<File | null>(null);
  const [arIdFile, setArIdFile] = useState<File | null>(null); // KTP/Paspor kuasa

  async function uploadDoc(file: File, docType: string) {
    if (!appId || !file) return;

    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);

    // baseURL + auth sudah di-handle apiUpload
    await apiUpload(`/applications/${appId}/documents/upload`, form, true);
  }

  async function saveDocumentsThenNext() {
    setErrDocs(null);

    const missingDocs: string[] = [];
    if (!aktaFile) missingDocs.push("Akta Pendirian");
    if (!nibFile) missingDocs.push("NIB / SIUP");
    if (!npwpFile) missingDocs.push("NPWP Badan");

    if (missingDocs.length > 0) {
      setErrDocs(`Dokumen wajib belum dipilih: ${missingDocs.join(", ")}`);
      return;
    }

    setSaving(true);
    try {
      await uploadDoc(aktaFile!, "AKTA_PENDIRIAN");
      await uploadDoc(nibFile!, "NIB_SIUP");
      await uploadDoc(npwpFile!, "NPWP_BADAN");
      if (arIdFile) await uploadDoc(arIdFile, "KTP_KUASA");
      setStep(4);
    } catch (e: unknown) {
      setErrDocs(e instanceof Error ? e.message : "Upload dokumen gagal");
    } finally {
      setSaving(false);
    }
  }

  // ----- STEP 4: Review & Submit -----
  const [submitting, setSubmitting] = useState(false);

  async function submitApplication() {
    if (!appId) return;
    setErrDocs(null);
    setSubmitting(true);
    try {
      // pre-validate: minimal 1 pengurus (DIRECTOR/COMMISSIONER), 1 BO, 1 AUTHORIZED_REP
      const roles = new Set(parties.map((p) => p.role));
      const hasAny =
        roles.has("DIRECTOR") ||
        roles.has("COMMISSIONER") ||
        roles.has("BO") ||
        roles.has("AUTHORIZED_REP");
      if (!hasAny)
        throw new Error(
          "Minimal 1 party harus ada: Pengurus/BO/Authorized Rep."
        );

      await apiFetch(`/applications/${appId}/submit`, { method: "PATCH" });
      setSubmitOK("Submitted. Screening & risk otomatis dijalankan.");
      router.push(`/users/${String(appId)}`);
    } catch (e: any) {
      // tampilkan di banner step-4 (pakai errDocs biar hanya muncul di sini)
      setErrDocs(e?.message || "Submit gagal");
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
            Application ID: <b>{appId}</b>
          </div>
        )}
      </div>

      {/* Banner error/ok spesifik step */}
      {step === 1 && errCompany && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errCompany}
        </div>
      )}
      {step === 2 && errParties && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errParties}
        </div>
      )}
      {step === 3 && errDocs && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errDocs}
        </div>
      )}
      {step === 4 && errDocs && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {errDocs}
        </div>
      )}
      {submitOK && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          {submitOK}
        </div>
      )}

      {/* STEP 1: Company */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-1">
                <span className="text-sm font-medium">Legal Name *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={legal_name}
                  onChange={(e) => setLegalName(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Legal Form *</span>
                <select
                  className="rounded-md border px-3 py-2 text-sm"
                  value={legal_form}
                  onChange={(e) => setLegalForm(e.target.value)}
                >
                  <option>PT</option>
                  <option>CV</option>
                  <option>FIRMA</option>
                  <option>KOPERASI</option>
                  <option>YAYASAN</option>
                  <option>PERKUMPULAN</option>
                  <option>PERORANGAN</option>
                  <option>BUMN_BUMD</option>
                  <option>LAINNYA</option>
                </select>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">
                  Incorporation Place *
                </span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={incorporation_place}
                  onChange={(e) => setIncorpPlace(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">
                  Incorporation Date *
                </span>
                <input
                  type="date"
                  className="rounded-md border px-3 py-2 text-sm"
                  value={incorporation_date}
                  onChange={(e) => setIncorpDate(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">License Number *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={business_license_number}
                  onChange={(e) => setBizLic(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">NIB *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={nib}
                  onChange={(e) => setNib(e.target.value)}
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
              <label className="grid gap-1">
                <span className="text-sm font-medium">Phone *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">KBLI (optional)</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={industry_code}
                  onChange={(e) => setKbli(e.target.value)}
                />
              </label>
              <label className="grid gap-1 md:col-span-2">
                <span className="text-sm font-medium">Business Activity *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={business_activity}
                  onChange={(e) => setBizAct(e.target.value)}
                />
              </label>
            </div>

            <label className="grid gap-1">
              <span className="text-sm font-medium">Registered Address *</span>
              <textarea
                className="rounded-md border px-3 py-2 text-sm"
                rows={2}
                value={address_line}
                onChange={(e) => setAddr(e.target.value)}
              />
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="grid gap-1">
                <span className="text-sm font-medium">City *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Province *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={province}
                  onChange={(e) => setProvince(e.target.value)}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-sm font-medium">Postal Code *</span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={postal_code}
                  onChange={(e) => setPostal(e.target.value)}
                />
              </label>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={saveCompany}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save & Continue"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Parties */}
      {step === 2 && (
        <Card onKeyDown={preventEnter}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              Parties (Directors, BO, Authorized Rep)
            </CardTitle>
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-slate-50"
            >
              + Add Party
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Modal sederhana Add Party */}
            {addOpen && (
              <div className="rounded-xl border p-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Role</span>
                    <select
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_role}
                      onChange={(e) => setPRole(e.target.value as PartyRole)}
                    >
                      <option>DIRECTOR</option>
                      <option>COMMISSIONER</option>
                      <option>MANAGER</option>
                      <option>BO</option>
                      <option>AUTHORIZED_REP</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Full Name</span>
                    <input
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_full_name}
                      onChange={(e) => setPName(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Identity Type</span>
                    <select
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_id_type}
                      onChange={(e) => setPIdType(e.target.value as any)}
                    >
                      <option>KTP</option>
                      <option>SIM</option>
                      <option>PASPOR</option>
                      <option>LAINNYA</option>
                    </select>
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Identity Number</span>
                    <input
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_id_number}
                      onChange={(e) => setPIdNumber(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">DOB</span>
                    <input
                      type="date"
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_dob}
                      onChange={(e) => setPDob(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Nationality</span>
                    <input
                      className="rounded-md border px-3 py-2 text-sm"
                      value={p_nationality}
                      onChange={(e) => setPNat(e.target.value)}
                    />
                  </label>
                  <label className="grid gap-1">
                    <span className="text-sm font-medium">Phone</span>
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
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-md border px-3 py-1.5 text-sm"
                    onClick={() => setAddOpen(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
                    onClick={addParty}
                    disabled={saving}
                  >
                    {saving ? "Saving..." : "Add"}
                  </button>
                </div>
              </div>
            )}

            {/* Banner missing roles */}
            {missing.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <div className="mb-1 font-medium">Belum lengkap:</div>
                <ul className="list-disc space-y-1 pl-5">
                  {missing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Tabel parties */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Full Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>ID</TableHead>
                    <TableHead>DOB</TableHead>
                    <TableHead>Nationality</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parties.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="py-6 text-center text-sm text-slate-500"
                      >
                        No parties yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    parties.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">
                          {p.full_name}
                        </TableCell>
                        <TableCell>{p.role}</TableCell>
                        <TableCell>
                          {p.identity_type || "—"} • {p.identity_number || "—"}
                        </TableCell>
                        <TableCell>
                          {p.dob
                            ? new Date(p.dob).toLocaleDateString("en-US")
                            : "—"}
                        </TableCell>
                        <TableCell>{p.nationality || "—"}</TableCell>
                        <TableCell className="text-right">
                          <button
                            type="button"
                            className="rounded-md border px-2 py-1 text-sm hover:bg-slate-50"
                            onClick={() => removeParty(p.id)}
                          >
                            Remove
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
                Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                disabled={!canContinue}
                title={
                  !canContinue
                    ? "Lengkapi minimal 1 Pengurus, 1 BO, 1 Authorized Rep"
                    : ""
                }
                className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Documents */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Upload Required Documents
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border border-dashed p-4">
                <div className="mb-2 text-sm font-medium">AKTA_PENDIRIAN *</div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => setAkta(e.target.files?.[0] || null)}
                />
              </div>
              <div className="rounded-md border border-dashed p-4">
                <div className="mb-2 text-sm font-medium">NIB / SIUP *</div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => setNibFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="rounded-md border border-dashed p-4">
                <div className="mb-2 text-sm font-medium">NPWP BADAN *</div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => setNpwpFile(e.target.files?.[0] || null)}
                />
              </div>
              <div className="rounded-md border border-dashed p-4">
                <div className="mb-2 text-sm font-medium">
                  ID Authorized Rep (KTP/Paspor) *
                </div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,application/pdf"
                  onChange={(e) => setArIdFile(e.target.files?.[0] || null)}
                />
              </div>
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={saveDocumentsThenNext}
                className="rounded-md bg-black px-3 py-1.5 text-sm text-white disabled:opacity-50"
              >
                {saving ? "Uploading..." : "Save & Continue"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: Review & Submit */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review & Submit</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              <li>
                Company info lengkap (Legal name, NIB, NPWP, Address, Phone,
                dll).
              </li>
              <li>
                Parties minimal: 1 Pengurus (Director/Commissioner), 1 BO, 1
                Authorized Rep.
              </li>
              <li>
                Dokumen wajib: Akta, NIB/SIUP, NPWP Badan, ID Kuasa
                (KTP/Paspor).
              </li>
              <li>
                Submit akan menjalankan screening (PEP/DTTOT/PPPSPM) & hitung
                risk otomatis.
              </li>
            </ul>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitApplication}
                disabled={submitting}
                className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
