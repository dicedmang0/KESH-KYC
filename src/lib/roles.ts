// src/lib/roles.ts
// Shared display labels for backend role codes.

export const ROLE_LABELS: Record<string, string> = {
  SystemAdmin:         'Admin Sistem',
  Director:            'Direktur',
  ComplianceLead:      'Lead Compliance',
  OperationSupervisor: 'Operation Supervisor',
  FrontDesk:           'Frontline',
  FinanceStaff:        'Finance Staff',
  FinanceManager:      'Finance Manager',
  Auditor:             'Auditor',
  ComplianceStaff:     'Deprecated - Compliance Staff',
};

/** Human-readable label for a role code (falls back to the raw code). */
export function roleLabel(role: string | null | undefined): string {
  if (!role) return 'Pengguna';
  return ROLE_LABELS[role] ?? role;
}
