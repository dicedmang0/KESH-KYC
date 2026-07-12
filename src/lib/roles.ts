// src/lib/roles.ts
// Shared display labels for backend role codes.

export const ROLE_LABELS: Record<string, string> = {
  SystemAdmin:     'Admin Sistem',
  Director:        'Direktur',
  BranchAdmin:     'Admin Cabang',
  FrontDesk:       'Frontliner',
  ComplianceStaff: 'Compliance Staff',
  ComplianceLead:  'Compliance Manager',
  Auditor:         'Auditor',
  FinanceStaff:    'Staff Finance',
  FinanceManager:  'Manager Finance',
};

/** Human-readable label for a role code (falls back to the raw code). */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Pengguna';
  return ROLE_LABELS[role] ?? role;
}
