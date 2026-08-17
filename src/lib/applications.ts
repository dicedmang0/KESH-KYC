// src/lib/applications.ts
// API client for KYC/KYB application endpoints that more than one screen needs.

import { apiFetch } from "@/lib/api";

/**
 * Identity fields PATCH /applications/:id/business accepts. Every key is
 * optional — the backend patches only what the payload actually carries, so
 * send changed fields only and never a whole snapshot.
 */
export type BusinessIdentityPayload = Partial<{
  legal_name: string;
  trade_name: string | null;
  legal_form: string;
  legal_form_other: string | null;
  // Nomor akta dipecah dua (migrasi 0061). deed_number legacy tetap diterima
  // backend dan di-mirror dari deed_establishment_number.
  deed_establishment_number: string | null;
  deed_latest_amendment_number: string | null;
  incorporation_date: string;
  country: string | null;
  business_license_number: string | null;
  nib: string | null;
  npwp: string;
  address_line: string;
  city: string;
  province: string;
  business_province_code: string | null;
  business_province_name: string | null;
  business_city_code: string | null;
  business_city_name: string | null;
  business_district_code: string | null;
  business_district_name: string | null;
  business_village_code: string | null;
  business_village_name: string | null;
  postal_code: string;
  business_activity: string;
  business_activity_other: string | null;
  phone: string;
  company_email: string | null;
  pic_name: string | null;
  pic_position: string | null;
  pic_identity_number: string | null;
  pic_identity_type: "KTP" | "PASPOR" | null;
  representative_signature_name: string | null;
  verification_officer: string | null;
  supervisor: string | null;
  source_of_funds: string | null;
  source_of_funds_other: string | null;
  business_relationship_purpose: string | null;
  business_relationship_purpose_other: string | null;
  distribution_channel: string | null;
  director_share_percentage: number | null;
  commissioner_share_percentage: number | null;
}>;

/**
 * Update the business identity of an existing application. Backend allows it
 * for DRAFT and REVISION_REQUIRED only, and for FrontDesk/ComplianceLead
 * (SystemAdmin/Director pass through the RolesGuard bypass).
 *
 * Never use POST /applications/business for an application that already
 * exists — that creates a second one.
 */
export function updateBusinessApplication(
  appId: number | string,
  payload: BusinessIdentityPayload,
) {
  return apiFetch(`/applications/${appId}/business`, {
    method: "PATCH",
    body: payload as Record<string, unknown>,
  });
}
