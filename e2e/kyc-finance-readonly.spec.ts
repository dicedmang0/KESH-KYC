import { test, expect, type Page } from '@playwright/test';

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';
const ROLE_PASSWORD = 'Test@12345';

type Role = 'FrontDesk' | 'ComplianceLead' | 'FinanceStaff' | 'FinanceManager';
type Credential = { email: string; password: string };

async function apiToken(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function createRole(adminToken: string, role: Role, suffix: string): Promise<Credential> {
  const email = `e2e.kyc.readonly.${role.toLowerCase()}.${suffix}@test.local`;
  await api(adminToken, '/users/admins', {
    method: 'POST',
    body: JSON.stringify({
      email,
      fullName: `E2E KYC Readonly ${role} ${suffix}`,
      role,
      password: ROLE_PASSWORD,
    }),
  });
  return { email, password: ROLE_PASSWORD };
}

async function login(page: Page, credential: Credential) {
  await page.goto('/login');
  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByLabel('Email').fill(credential.email);
  await page.getByLabel('Password').fill(credential.password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe.configure({ mode: 'serial' });

test.describe('CDD/KYC/KYB finance roles are read-only', () => {
  let users: Record<Role, Credential>;
  let individualAppId: string;
  let businessAppId: string;
  let suffix: string;

  test.beforeAll(async () => {
    suffix = Date.now().toString();
    const adminToken = await apiToken(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    users = {} as Record<Role, Credential>;
    for (const role of ['FrontDesk', 'ComplianceLead', 'FinanceStaff', 'FinanceManager'] as Role[]) {
      users[role] = await createRole(adminToken, role, suffix);
    }

    const frontDeskToken = await apiToken(users.FrontDesk.email, users.FrontDesk.password);
    const nik = (`3175${suffix}`).padEnd(16, '0').slice(0, 16);
    const individual = await api(frontDeskToken, '/applications/individual', {
      method: 'POST',
      body: JSON.stringify({
        full_name: `Finance Readonly Customer ${suffix}`,
        ktp_number: nik,
        identity_type: 'KTP',
        identity_number: nik,
        pob: 'Jakarta',
        dob: '1990-01-01',
        nationality: 'Indonesia',
        phone: `0812${suffix.slice(-8)}`,
        occupation: 'Pegawai Swasta',
        gender: 'M',
        cif_relationship_type: 'OUR_CUSTOMER',
      }),
    });
    individualAppId = String(individual.id);

    await api(frontDeskToken, `/applications/${individualAppId}/documents`, {
      method: 'POST',
      body: JSON.stringify({ doc_type: 'INDIVIDUAL_KTP_PHOTO', file_uri: `https://storage.test/${suffix}.png` }),
    });
    await api(frontDeskToken, `/applications/${individualAppId}/edd`, {
      method: 'PATCH',
      body: JSON.stringify({ applicant_snapshot: { full_name: `Finance Readonly Customer ${suffix}` } }),
    });

    const business = await api(frontDeskToken, '/applications/business', {
      method: 'POST',
      body: JSON.stringify({
        legal_name: `PT Finance Readonly ${suffix}`,
        legal_form: 'PT',
        incorporation_date: '2020-01-01',
        deed_establishment_number: `AKTA-${suffix}`,
        business_license_number: `NIB-${suffix}`,
        nib: `NIB-${suffix}`,
        npwp: suffix.padEnd(15, '0').slice(0, 15),
        address_line: 'Jl. Readonly No. 1',
        city: 'Jakarta',
        province: 'DKI Jakarta',
        postal_code: '12345',
        business_activity: 'Perdagangan Umum',
        phone: `021${suffix.slice(-8)}`,
      }),
    });
    businessAppId = String(business.id);
    await api(frontDeskToken, `/applications/${businessAppId}/parties`, {
      method: 'POST',
      body: JSON.stringify({
        role: 'BO',
        full_name: `BO Readonly ${suffix}`,
        identity_type: 'KTP',
        identity_number: (`3275${suffix}`).padEnd(16, '0').slice(0, 16),
        ownership_percentage: 50,
      }),
    });
  });

  for (const role of ['FinanceStaff', 'FinanceManager'] as const) {
    test(`${role}: customer list/detail are readable and every KYC mutation control is absent`, async ({ page }) => {
      await login(page, users[role]);

      await page.goto('/users');
      await expect(page.getByRole('heading', { name: 'Manajemen Pengguna Jasa' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Tambah Individu' })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Tambah Perusahaan' })).toHaveCount(0);

      await page.goto('/applications/new?type=individual');
      await expect(page.getByText('Akses Ditolak', { exact: true })).toBeVisible();
      await expect(page.getByText('Anda hanya memiliki akses baca untuk CDD/KYC/KYB.')).toBeVisible();

      await page.goto(`/users/${individualAppId}`);
      await expect(page.getByText(`Finance Readonly Customer ${suffix}`, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Ajukan', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Simpan Data', exact: true })).toHaveCount(0);
      await expect(page.getByRole('button', { name: /Upload|Ambil Foto|Hapus/ })).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Mulai Pengkinian Data' })).toHaveCount(0);
      await expect(page.getByText('Hanya dapat dilihat')).toBeVisible();

      await page.goto(`/users/${businessAppId}`);
      await expect(page.getByText(`PT Finance Readonly ${suffix}`, { exact: true }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /Ubah Identitas|Tambah Pihak|Hapus/ })).toHaveCount(0);

      // KYC read-only must not hide or break the role's transfer workspace.
      await page.goto('/transfers');
      await expect(page.getByRole('heading', { name: 'Pencatatan Transfer' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Single Transfer' })).toBeVisible();
      await expect(page.getByRole('tab', { name: 'Bulk Transfer' })).toBeVisible();
    });
  }

  test('FrontDesk retains Our Customer, WIC, and Business KYB creation UI', async ({ page }) => {
    await login(page, users.FrontDesk);
    await page.goto('/users');
    await expect(page.getByRole('button', { name: 'Tambah Individu' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tambah Perusahaan' })).toBeVisible();

    await page.goto('/applications/new?type=individual');
    await expect(page.getByLabel('Jenis Customer')).toHaveValue('OUR_CUSTOMER');
    await expect(page.getByTestId('person-cdd-fields')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan Aplikasi' })).toBeVisible();
    await page.getByLabel('Jenis Customer').selectOption('WIC');
    await expect(page.getByText('Walk-In Customer', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan Aplikasi' })).toBeVisible();

    await page.goto('/applications/new?type=business');
    await expect(page.getByRole('heading', { name: 'Input Data KYB' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan & Lanjut' })).toBeVisible();
  });

  test('ComplianceLead Pengkinian initiation remains available', async ({ page }) => {
    await login(page, users.ComplianceLead);
    await page.goto(`/users/${individualAppId}`);
    await expect(page.getByRole('button', { name: 'Mulai Pengkinian Data' })).toBeVisible();
  });
});
