// Frontend mirror of the backend CDD/KYC/KYB capability policy.
// Transfer/finance capabilities intentionally live in lib/transfers.ts.

const KYC_CREATE_ROLES = [
  'BranchAdmin',
  'FrontDesk',
  'ComplianceLead',
  'SystemAdmin',
  'Director',
];

const KYC_EDIT_ROLES = [
  'FrontDesk',
  'ComplianceLead',
  'SystemAdmin',
  'Director',
];

export function canReadKyc(role?: string | null): boolean {
  return Boolean(role);
}

export function canCreateKyc(role?: string | null): boolean {
  return Boolean(role && KYC_CREATE_ROLES.includes(role));
}

export function canEditKyc(role?: string | null): boolean {
  return Boolean(role && KYC_EDIT_ROLES.includes(role));
}

export function canViewKycRisk(role?: string | null): boolean {
  return Boolean(role && [
    'SystemAdmin',
    'Director',
    'ComplianceLead',
    'OperationSupervisor',
    'FrontDesk',
    'Auditor',
    'FinanceStaff',
    'FinanceManager',
  ].includes(role));
}

export function canViewKycEdd(role?: string | null): boolean {
  return Boolean(role && [
    'SystemAdmin',
    'Director',
    'FrontDesk',
    'ComplianceLead',
    'Auditor',
    'FinanceStaff',
    'FinanceManager',
  ].includes(role));
}
