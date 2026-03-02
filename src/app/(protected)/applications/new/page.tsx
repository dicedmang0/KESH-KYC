"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/app/providers";
import { apiFetch } from "@/lib/api";
import BusinessWizard from "@/components/business-wizard";
import { apiUpload } from "@/lib/api";

import { Card, CardContent } from "@/components/ui/card";

type Kind = "INDIVIDUAL" | "BUSINESS";

export default function NewApplicationPage() {
  const router = useRouter();
  const { token } = useAuth();
  const sp = useSearchParams();

  // 👇 ambil tipe dari query (?type=individual|business), default INDIVIDUAL
  const kind = (
    sp.get("type")?.toUpperCase() === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL"
  ) as Kind;

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  // ==== INDIVIDUAL form state ====
  const [i_full_name, setIName] = useState("");
  const [i_nik, setINik] = useState("");
  const [i_identity_type, setIIdentityType] = useState<
    "KTP" | "SIM" | "PASPOR" | "LAINNYA"
  >("KTP");
  const [i_address, setIAddress] = useState("");
  const [i_address2, setIAddress2] = useState("");
  const [i_city, setICity] = useState("");
  const [i_province, setIProv] = useState("");
  const [i_postal, setIPostal] = useState("");
  const [i_pob, setIPob] = useState("");
  const [i_dob, setIDob] = useState("");
  const [i_nationality, setINation] = useState("");
  const [i_phone, setIPhone] = useState("");
  const [i_email, setIEmail] = useState("");
  const [i_gender, setIGender] = useState<"M" | "F" | "O">("M");
  const [i_occupation, setIOccupation] = useState(""); // <-- tambah ini
  const [i_pep, setIPep] = useState(false);

  // files
  const [i_signature, setISignature] = useState<File | null>(null);
  const [i_iddoc, setIIddoc] = useState<File | null>(null);

  // ==== BUSINESS form state ====
  const [b_legal_name, setBLegal] = useState("");
  const [b_trade_name, setBTrade] = useState("");
  const [b_nib, setBNib] = useState("");
  const [b_npwp, setBNpwp] = useState("");
  const [b_industry, setBIndustry] = useState("");
  const [b_incorp, setBIncorp] = useState("");
  const [b_country, setBCountry] = useState("Indonesia");
  const [b_address, setBAddress] = useState("");
  const [b_city, setBCity] = useState("");
  const [b_province, setBProv] = useState("");
  const [b_postal, setBPostal] = useState("");
  const [b_sig, setBSig] = useState<File | null>(null);
  const [b_iddoc, setBIddoc] = useState<File | null>(null);

  // helper upload multipart → /applications/:id/documents/upload
  async function uploadDoc(appId: number, file: File, docType: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("doc_type", docType);

    await apiUpload(`/applications/${appId}/documents/upload`, form, true);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    setErr(null);
    setOkMsg(null);
    setLoading(true);
    try {
      let created: any;

      if (kind === "INDIVIDUAL") {
        // DTO: POST /applications/individual
        const dto = {
          full_name: i_full_name,
          identity_type: i_identity_type,
          identity_number: i_nik,
          address_identity: i_address,
          address_residential: i_address2 || null,
          pob: i_pob,
          dob: i_dob || null,
          nationality: i_nationality,
          phone: i_phone,
          email: i_email || null,
          gender: i_gender,
          occupation: i_occupation,
          signature_uri: null,
        };
        created = await apiFetch("/applications/individual", {
          method: "POST",
          body: JSON.stringify(dto),
        });
      } else {
        // DTO: POST /applications/business
        const dto = {
          legal_name: b_legal_name,
          trade_name: b_trade_name || null,
          nib: b_nib || null,
          npwp: b_npwp || null,
          industry_code: b_industry || null,
          incorporation_date: b_incorp || null,
          country: b_country || null,
          address_line: b_address,
          city: b_city,
          province: b_province,
          postal_code: b_postal,
        };
        created = await apiFetch("/applications/business", {
          method: "POST",
          body: JSON.stringify(dto),
        });
      }

      const appId = created?.id || created?.application_id || created?.app_id;
      if (!appId) throw new Error("Application ID not returned");

      // upload files jika ada
      if (kind === "INDIVIDUAL") {
        if (i_signature) await uploadDoc(appId, i_signature, "SIGNATURE");
        if (i_iddoc) await uploadDoc(appId, i_iddoc, i_identity_type);
      } else {
        if (b_sig) await uploadDoc(appId, b_sig, "SIGNATURE");
        if (b_iddoc) await uploadDoc(appId, b_iddoc, "REGISTRY_DOC");
      }

      setOkMsg("Data berhasil disimpan.");
      router.push("/users");
    } catch (e: any) {
      setErr(e.message || "Gagal menyimpan data");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          {kind === "INDIVIDUAL" ? "KYC Data Input" : "KYB Data Input"}
        </h1>
        <p className="text-xs text-slate-500">
          Manual entry for customer verification
        </p>
      </div>

      {err && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      )}
      {okMsg && (
        <div className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
          {okMsg}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-6">
        {kind === "INDIVIDUAL" ? (
          <Card>
            <CardContent className="space-y-4 p-6">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Full Name *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_full_name}
                    onChange={(e) => setIName(e.target.value)}
                    required
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm font-medium">Identity Type *</span>
                  <select
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_identity_type}
                    onChange={(e) => setIIdentityType(e.target.value as any)}
                    required
                  >
                    <option value="KTP">KTP</option>
                    <option value="SIM">SIM</option>
                    <option value="PASPOR">PASPOR</option>
                    <option value="LAINNYA">LAINNYA</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Identity Number *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    placeholder="KTP / SIM / Passport number"
                    value={i_nik}
                    onChange={(e) => setINik(e.target.value)}
                    required
                  />
                </label>

                <div />
              </div>

              <label className="grid gap-1">
                <span className="text-sm font-medium">
                  Address (as per ID document) *
                </span>
                <textarea
                  className="rounded-md border px-3 py-2 text-sm"
                  rows={3}
                  value={i_address}
                  onChange={(e) => setIAddress(e.target.value)}
                  required
                />
              </label>

              <label className="grid gap-1">
                <span className="text-sm font-medium">
                  Additional Address (optional)
                </span>
                <input
                  className="rounded-md border px-3 py-2 text-sm"
                  value={i_address2}
                  onChange={(e) => setIAddress2(e.target.value)}
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Place of Birth *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_pob}
                    onChange={(e) => setIPob(e.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Date of Birth *</span>
                  <input
                    type="date"
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_dob}
                    onChange={(e) => setIDob(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Nationality *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_nationality}
                    onChange={(e) => setINation(e.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Phone Number *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    placeholder="+62"
                    value={i_phone}
                    onChange={(e) => setIPhone(e.target.value)}
                    required
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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
                  <span className="text-sm font-medium">Occupation *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_occupation}
                    onChange={(e) => setIOccupation(e.target.value)}
                    required
                    placeholder="e.g. Software Engineer"
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Gender *</span>
                  <select
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_gender}
                    onChange={(e) => setIGender(e.target.value as any)}
                    required
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">City *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_city}
                    onChange={(e) => setICity(e.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Province *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_province}
                    onChange={(e) => setIProv(e.target.value)}
                    required
                  />
                </label>
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Postal Code *</span>
                  <input
                    className="rounded-md border px-3 py-2 text-sm"
                    value={i_postal}
                    onChange={(e) => setIPostal(e.target.value)}
                    required
                  />
                </label>
              </div>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={i_pep}
                  onChange={(e) => setIPep(e.target.checked)}
                />
                PEP Self-declared
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-dashed p-4">
                  <div className="text-sm font-medium mb-2">
                    Signature Upload (Optional)
                  </div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={(e) => setISignature(e.target.files?.[0] || null)}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    PNG, JPG, PDF up to 2 MB
                  </p>
                </div>
                <div className="rounded-md border border-dashed p-4">
                  <div className="text-sm font-medium mb-2">
                    Upload Identity Document *
                  </div>
                  <input
                    required
                    type="file"
                    accept="image/png,image/jpeg,application/pdf"
                    onChange={(e) => setIIddoc(e.target.files?.[0] || null)}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    KTP / SIM / Passport — PDF, JPG, PNG up to 5 MB
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <BusinessWizard />
        )}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center rounded-md bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading
              ? "Saving..."
              : kind === "INDIVIDUAL"
              ? "Save KYC Data"
              : "Save KYB Data"}
          </button>
        </div>
      </form>
    </div>
  );
}
