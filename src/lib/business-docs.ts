// src/lib/business-docs.ts
// KYB document types. These are the codes the backend checks at submit
// (applications.service validateBeforeSubmit → BUSINESS branch); the legacy
// AKTA_PENDIRIAN / NIB_SIUP / NPWP_BADAN aliases still satisfy the first three,
// but MANAGEMENT / SHAREHOLDER / BO exist only under the BUSINESS_* names.

export type BusinessDocType = { code: string; name: string };

/** Wajib untuk semua badan usaha. */
export const BUSINESS_ALWAYS_REQUIRED_DOCS: BusinessDocType[] = [
  { code: "BUSINESS_DEED_ESTABLISHMENT_AMENDMENT", name: "Akta Pendirian & Perubahan" },
  { code: "BUSINESS_LICENSE", name: "NIB / Izin Usaha" },
  { code: "BUSINESS_NPWP", name: "NPWP Badan Usaha" },
  { code: "BUSINESS_MANAGEMENT_IDENTITY", name: "Dokumen Identitas Pengurus" },
];

/** Wajib bila ada pemegang saham dengan kepemilikan ≥25%. */
export const BUSINESS_SHAREHOLDER_DOC: BusinessDocType = {
  code: "BUSINESS_SHAREHOLDER_IDENTITY_25",
  name: "Dokumen Identitas Pemegang Saham ≥25%",
};

/** Wajib bila ada pihak Beneficial Owner. */
export const BUSINESS_BO_DOC: BusinessDocType = {
  code: "BUSINESS_BO_DOCUMENT",
  name: "Dokumen BO",
};

export const BUSINESS_DOC_TYPES: BusinessDocType[] = [
  ...BUSINESS_ALWAYS_REQUIRED_DOCS,
  BUSINESS_SHAREHOLDER_DOC,
  BUSINESS_BO_DOC,
];

export function businessDocLabel(code: string): string {
  return BUSINESS_DOC_TYPES.find((d) => d.code === code)?.name ?? code;
}
