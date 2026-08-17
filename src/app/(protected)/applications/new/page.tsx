"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { toast } from "@/lib/toast";
import BusinessWizard from "@/components/business-wizard";
import PersonCddFields from "@/components/person-cdd-fields";
import { Card, CardContent } from "@/components/ui/card";

type Kind = "INDIVIDUAL" | "BUSINESS";
type CustomerType = "OUR_CUSTOMER" | "WIC";

const EMPTY_INDIVIDUAL: Record<string, unknown> = {
  identity_type: "KTP",
  nationality: "Indonesia",
  gender: "M",
};

function NewApplicationPageInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const kind = (
    sp.get("type")?.toUpperCase() === "BUSINESS" ? "BUSINESS" : "INDIVIDUAL"
  ) as Kind;
  const [customerType, setCustomerType] =
    useState<CustomerType>("OUR_CUSTOMER");

  async function createIndividual(patch: Record<string, unknown>) {
    const identityType = String(patch.identity_type ?? "KTP");
    const selectedIdentity =
      patch.identity_number ??
      (identityType === "SIM"
        ? patch.sim_number
        : identityType === "PASPOR"
          ? patch.passport_number
          : patch.ktp_number);

    const dto: Record<string, unknown> = {
      ...patch,
      identity_type: identityType,
      identity_number: selectedIdentity,
      nationality: patch.nationality ?? "Indonesia",
      gender: patch.gender ?? "M",
      cif_relationship_type: customerType,
    };
    // Nama wilayah diturunkan ulang secara otoritatif dari kode oleh backend.
    for (const key of [
      "province_name",
      "city_name",
      "district_name",
      "village_name",
    ]) {
      delete dto[key];
    }

    // Kolom identitas khusus dan kolom identitas utama tetap konsisten.
    if (customerType === "WIC") {
      if (identityType === "KTP" && !dto.ktp_number)
        dto.ktp_number = selectedIdentity;
      if (identityType === "SIM" && !dto.sim_number)
        dto.sim_number = selectedIdentity;
      if (identityType === "PASPOR" && !dto.passport_number)
        dto.passport_number = selectedIdentity;
    }

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
    return created;
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

      {kind === "INDIVIDUAL" ? (
        <Card>
          <CardContent className="space-y-6 p-6">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm font-medium">Jenis Customer</span>
                  <select
                    aria-label="Jenis Customer"
                    className="rounded-md border bg-white px-3 py-2 text-sm"
                    value={customerType}
                    onChange={(event) =>
                      setCustomerType(event.target.value as CustomerType)
                    }
                  >
                    <option value="WIC">WIC</option>
                    <option value="OUR_CUSTOMER">Our Customer</option>
                  </select>
                </label>
                <div className="rounded-lg bg-white/70 p-3 text-xs text-slate-600">
                  <p className="font-semibold text-emerald-800">
                    {customerType === "WIC"
                      ? "Walk-In Customer (WIC)"
                      : "Our Customer"}
                  </p>
                  <p className="mt-1">
                    {customerType === "WIC"
                      ? "Menggunakan form CDD lengkap yang sama. Klasifikasi WIC, tanpa CIF, dan batas transaksi tetap berlaku."
                      : "CIF diterbitkan sesuai alur Our Customer yang berlaku."}
                  </p>
                </div>
              </div>
            </div>

            <PersonCddFields
              person={EMPTY_INDIVIDUAL}
              customerType={customerType}
              showOperationalFields={false}
              save={createIndividual}
              submitLabel="Simpan Aplikasi"
            />

            <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700">
              {customerType === "WIC"
                ? "Dokumen identitas dan biometrik/tanda tangan WIC dilengkapi setelah data disimpan."
                : "Dokumen foto KTP, foto wajah pengguna, dan foto wajah dengan KTP diunggah setelah data pengguna disimpan."}
            </div>
          </CardContent>
        </Card>
      ) : (
        <BusinessWizard />
      )}
    </div>
  );
}

export default function NewApplicationPage() {
  return (
    <Suspense fallback={<div className="text-sm text-slate-500">Memuat...</div>}>
      <NewApplicationPageInner />
    </Suspense>
  );
}
