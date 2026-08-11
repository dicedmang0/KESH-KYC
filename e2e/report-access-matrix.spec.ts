import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: Report Center is split by division.
 *
 * The backend enforces the matrix (see report-access.ts there); this spec checks
 * the UI does not offer what the backend would refuse — each role's "Jenis
 * Report" dropdown carries exactly its own report types, and Auditor gets the
 * list and downloads but no Generate action at all.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const ROLE_PASSWORD = 'Test@12345';

type RoleName =
  | 'ComplaintHandling'
  | 'OperationSupervisor'
  | 'FinanceStaff'
  | 'FinanceManager'
  | 'ComplianceLead'
  | 'Auditor';

/** Labels rendered by REPORT_TYPE_LABELS, in the order the dropdown emits them. */
const ALL_REPORT_LABELS = [
  'Semua Report',
  'KYC/KYB',
  'LTKT',
  'LTKM',
  'Pencatatan Transfer',
  'Pengaduan',
];

/** What each role's generate dropdown must contain — mirrors the backend matrix. */
const EXPECTED_TYPES: Record<RoleName, string[]> = {
  ComplaintHandling: ['Pengaduan'],
  OperationSupervisor: ['Pengaduan'],
  FinanceStaff: ['Pencatatan Transfer'],
  FinanceManager: ['Pencatatan Transfer'],
  ComplianceLead: ALL_REPORT_LABELS,
  Auditor: ALL_REPORT_LABELS,
};

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`setup: login failed for ${email}: ${res.status}`);
  return (await res.json()).access_token;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function switchRole(page: Page, email: string, password: string) {
  const logoutButton = page.getByRole('button', { name: 'Keluar' });
  if ((await logoutButton.count()) > 0) {
    await logoutButton.click();
    await page.waitForURL('**/login');
  }
  await login(page, email, password);
}

async function createAdminViaFE(page: Page, opts: { email: string; fullName: string; role: RoleName }) {
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel('Nama').fill(opts.fullName);
  await page.getByLabel('Role').selectOption(opts.role);
  await page.getByLabel('Password awal').fill(ROLE_PASSWORD);

  const created = page.waitForResponse(
    (res) => res.url().includes('/users/admins') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Buat Admin' }).click();
  const res = await created;
  if (res.status() !== 201) {
    throw new Error(`setup: failed creating ${opts.role}: ${res.status()} ${await res.text()}`);
  }
}

/** Visible option labels of a <select>, trimmed. */
async function optionLabels(page: Page, selector: string): Promise<string[]> {
  return (await page.locator(`${selector} option`).allTextContents()).map((t) => t.trim());
}

test.describe.configure({ mode: 'serial' });

test.describe('Report Center access matrix', () => {
  let users: Record<RoleName, { email: string; password: string }>;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ts = Date.now().toString();
    await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD); // fail fast if the seed admin is missing

    const roles: RoleName[] = [
      'ComplaintHandling',
      'OperationSupervisor',
      'FinanceStaff',
      'FinanceManager',
      'ComplianceLead',
      'Auditor',
    ];
    users = Object.fromEntries(
      roles.map((r) => [r, { email: `e2e.rpt.${r.toLowerCase()}.${ts}@test.local`, password: ROLE_PASSWORD }]),
    ) as Record<RoleName, { email: string; password: string }>;

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    for (const role of roles) {
      await createAdminViaFE(page, { email: users[role].email, fullName: `E2E ${role} Report ${ts}`, role });
    }
    await page.close();
  });

  for (const role of ['ComplaintHandling', 'OperationSupervisor', 'FinanceStaff', 'FinanceManager', 'ComplianceLead'] as RoleName[]) {
    test(`${role} sees only its own report types and can generate`, async ({ page }) => {
      await login(page, users[role].email, users[role].password);

      // The menu is offered because the role has at least one allowed type.
      await expect(page.getByRole('link', { name: 'Laporan' }).first()).toBeVisible();

      await page.goto('/reports');
      await expect(page.getByRole('heading', { name: 'Report Center' })).toBeVisible();
      await expect(page.getByText('Anda tidak memiliki akses ke halaman Report Center.')).toHaveCount(0);

      // Generate dropdown: exactly the allowed types, nothing else.
      await expect(page.locator('#generate-report-type')).toBeVisible();
      expect(await optionLabels(page, '#generate-report-type')).toEqual(EXPECTED_TYPES[role]);

      // The history filter offers the same set, plus its "Semua" catch-all.
      expect(await optionLabels(page, '#filter-report-type')).toEqual(['Semua', ...EXPECTED_TYPES[role]]);

      await expect(page.getByRole('button', { name: 'Generate Report' })).toBeVisible();
    });
  }

  test('Auditor sees every report type read-only, with no generate action', async ({ page }) => {
    await login(page, users.Auditor.email, users.Auditor.password);
    await page.goto('/reports');

    await expect(page.getByRole('heading', { name: 'Report Center' })).toBeVisible();
    await expect(page.getByText('Anda hanya dapat melihat dan mengunduh report yang sudah dibuat.')).toBeVisible();

    // No generate card at all — not merely a disabled button.
    await expect(page.getByRole('button', { name: 'Generate Report' })).toHaveCount(0);
    await expect(page.locator('#generate-report-type')).toHaveCount(0);

    // The list is still readable, filterable across every type.
    expect(await optionLabels(page, '#filter-report-type')).toEqual(['Semua', ...ALL_REPORT_LABELS]);
    await expect(page.getByText('Gagal memuat daftar report.')).toHaveCount(0);
  });

  test('a role outside the matrix keeps no Laporan menu', async ({ page }) => {
    // FrontDesk is in no division of the Report Center.
    await switchRole(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    const ts = Date.now().toString();
    const frontDesk = { email: `e2e.rpt.frontdesk.${ts}@test.local`, password: ROLE_PASSWORD };
    await createAdminViaFE(page, {
      email: frontDesk.email,
      fullName: `E2E FrontDesk Report ${ts}`,
      role: 'FrontDesk' as RoleName,
    });

    await switchRole(page, frontDesk.email, frontDesk.password);
    await expect(page.getByRole('link', { name: 'Laporan' })).toHaveCount(0);

    await page.goto('/reports');
    await expect(page.getByText('Anda tidak memiliki akses ke halaman Report Center.')).toBeVisible();
  });
});
