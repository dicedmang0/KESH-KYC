import { test, expect, type Page } from '@playwright/test';

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';
const ROLE_PASSWORD = 'Test@12345';

type Role = 'FrontDesk' | 'OperationSupervisor' | 'FinanceStaff' | 'FinanceManager';
type Credential = { email: string; password: string };

async function token(email: string, password: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error(`login ${email}: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function api(authToken: string, path: string, init: RequestInit = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

async function createUser(adminToken: string, role: Role, suffix: string): Promise<Credential> {
  const email = `e2e.provider.${role.toLowerCase()}.${suffix}@test.local`;
  await api(adminToken, '/users/admins', {
    method: 'POST',
    body: JSON.stringify({
      email,
      fullName: `E2E Provider ${role} ${suffix}`,
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

function card(page: Page, title: string) {
  return page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: title }) }).first();
}

function inputByText(container: ReturnType<typeof card>, label: string) {
  return container.locator('label').filter({ hasText: label }).locator('..').locator('input');
}

test.describe.configure({ mode: 'serial' });

test.describe('Post-manager provider result finalization', () => {
  let users: Record<Role, Credential>;
  let tokens: Record<Role, string>;
  let successId: string;
  let failedId: string;
  let batchId: string;
  let suffix: string;

  test.beforeAll(async () => {
    suffix = Date.now().toString();
    const adminToken = await token(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    const roles: Role[] = ['FrontDesk', 'OperationSupervisor', 'FinanceStaff', 'FinanceManager'];
    users = {} as Record<Role, Credential>;
    tokens = {} as Record<Role, string>;
    for (const role of roles) {
      users[role] = await createUser(adminToken, role, suffix);
      tokens[role] = await token(users[role].email, users[role].password);
    }

    const applications = await api(adminToken, '/applications?status=APPROVED&limit=25');
    const sender = (applications.data ?? applications).find((item: { id?: number | string }) => item.id);
    if (!sender) throw new Error('No APPROVED sender application is available for transfer E2E setup.');

    const commonItem = {
      amount: 275_000,
      beneficiaryBankName: 'Bank Central Asia',
      beneficiaryBankCode: 'BCA',
      beneficiaryAccountNumber: `88${suffix.slice(-8)}`,
      beneficiary_mobile_number: '081234567890',
      beneficiary_relationship_to_sender: 'Vendor',
      transaction_purpose: `Provider finalization ${suffix}`,
    };
    const batch = await api(tokens.FrontDesk, '/transfers/bulk', {
      method: 'POST',
      body: JSON.stringify({
        sender_application_id: Number(sender.id),
        bulk_reference_no: `E2E-RESULT-${suffix}`,
        qlola_debit_account: '020601000001301',
        qlola_sender_name: 'PT KESH E2E',
        items: [{ ...commonItem, beneficiaryAccountName: `E2E Success ${suffix}` }],
      }),
    });
    batchId = String(batch.batch_id);
    successId = String(batch.transfers[0].id);

    const failed = await api(tokens.FrontDesk, '/transfers', {
      method: 'POST',
      body: JSON.stringify({
        sender_application_id: Number(sender.id),
        ...commonItem,
        beneficiaryAccountNumber: `77${suffix.slice(-8)}`,
        beneficiaryAccountName: `E2E Failed ${suffix}`,
      }),
    });
    failedId = String(failed.id);

    for (const id of [successId, failedId]) {
      await api(tokens.FrontDesk, `/transfers/${id}/submit`, { method: 'POST' });
      await api(tokens.OperationSupervisor, `/transfers/${id}/supervisor-review`, {
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVE', notes: 'Lolos layer 1' }),
      });
      const checked = await api(tokens.FinanceStaff, `/transfers/${id}/finance-review`, {
        method: 'POST',
        body: JSON.stringify({ action: 'APPROVE', notes: 'Sudah diperiksa checker' }),
      });
      expect(checked.status).toBe('PENDING_FINANCE_MANAGER_APPROVAL');
    }
  });

  test('FinanceManager approves a bulk child but does not fabricate a result', async ({ page }) => {
    await login(page, users.FinanceManager);
    await page.goto(`/transfers/${successId}`);

    await page.getByRole('button', { name: 'Review & Setujui Final' }).click();
    const decisionResponse = page.waitForResponse(
      (response) => response.url().endsWith(`/transfers/${successId}/decision`) && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Konfirmasi Setujui Final' }).click();
    const decision = await decisionResponse;
    expect(decision.ok(), await decision.text().catch(() => '')).toBeTruthy();
    expect((await decision.json()).status).toBe('PENDING_FINANCE_STAFF_RESULT');

    await expect(page.getByText('Menunggu Hasil dari Finance Staff', { exact: true })).toBeVisible();
    await expect(page.getByText('Menunggu Hasil Finance Staff', { exact: true })).toBeVisible();
    await expect(page.getByTestId('provider-result-form')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cetak Resi' })).toHaveCount(0);

    await page.goto(`/transfers/bulk-batches/${batchId}`);
    await expect(page.getByTestId('batch-status-summary')).toContainText('Menunggu Hasil Finance Staff');
    await expect(page.getByTestId('child-status-cell')).toContainText('Menunggu Hasil Finance Staff');
  });

  test('FrontDesk sees unavailable result read-only before FinanceStaff finalizes', async ({ page }) => {
    await login(page, users.FrontDesk);
    await page.goto(`/transfers/${successId}`);
    const provider = card(page, 'Hasil / Provider');
    await expect(provider.getByText('Hasil transaksi belum tersedia.')).toBeVisible();
    await expect(provider.locator('input, select, textarea')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Finalisasi Hasil Transaksi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cetak Resi' })).toHaveCount(0);
  });

  test('FinanceStaff records SUCCESS, then fields become read-only and receipt is available', async ({ page }) => {
    await login(page, users.FinanceStaff);
    await page.goto(`/transfers/${successId}`);
    const provider = card(page, 'Hasil / Provider');
    await expect(provider.getByText('Ini bukan persetujuan ulang.', { exact: false })).toBeVisible();
    await provider.locator('select').selectOption('SUCCESS');
    await inputByText(provider, 'Provider (wajib)').fill('Bank Nobu');
    await inputByText(provider, 'Nomor Referensi Bank').fill(`BANK-SUCCESS-${suffix}`);
    const finalizedResponse = page.waitForResponse(
      (response) => response.url().endsWith(`/transfers/${successId}/result`) && response.request().method() === 'POST',
    );
    await provider.getByRole('button', { name: 'Finalisasi Hasil Transaksi' }).click();
    const finalized = await finalizedResponse;
    expect(finalized.ok(), await finalized.text().catch(() => '')).toBeTruthy();
    expect(await finalized.request().postDataJSON()).toMatchObject({
      result: 'SUCCESS',
      provider_name: 'Bank Nobu',
      bank_reference_no: `BANK-SUCCESS-${suffix}`,
    });

    await expect(provider.locator('input, select, textarea')).toHaveCount(0);
    await expect(provider.getByText('Berhasil', { exact: true })).toBeVisible();
    await expect(provider.getByText('Bank Nobu', { exact: true })).toBeVisible();
    await expect(provider.getByText('Bank Central Asia', { exact: true })).toBeVisible();
    await expect(provider.getByText(`BANK-SUCCESS-${suffix}`, { exact: true })).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflows).toBe(false);

    await login(page, users.FrontDesk);
    await page.goto(`/transfers/${successId}`);
    const frontDeskProvider = card(page, 'Hasil / Provider');
    await expect(frontDeskProvider.getByText('Berhasil', { exact: true })).toBeVisible();
    await expect(frontDeskProvider.getByText('Bank Nobu', { exact: true })).toBeVisible();
    await expect(frontDeskProvider.getByText('Bank Central Asia', { exact: true })).toBeVisible();
    await expect(frontDeskProvider.locator('input, select, textarea')).toHaveCount(0);
    await page.getByRole('button', { name: 'Cetak Resi' }).click();
    await page.waitForURL(`**/transfers/${successId}/receipt`);
    await expect(page.getByRole('heading', { name: 'Bukti Transaksi Transfer' })).toBeVisible();
  });

  test('FAILED uses the existing completed/failed semantics and never exposes a receipt', async ({ page }) => {
    const approved = await api(tokens.FinanceManager, `/transfers/${failedId}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: 'APPROVE', decision_notes: 'Setuju eksekusi' }),
    });
    expect(approved.status).toBe('PENDING_FINANCE_STAFF_RESULT');

    await login(page, users.FinanceStaff);
    await page.goto(`/transfers/${failedId}`);
    const provider = card(page, 'Hasil / Provider');
    await provider.locator('select').selectOption('FAILED');
    await inputByText(provider, 'Provider (wajib)').fill('Bank Nobu');
    await inputByText(provider, 'Alasan kegagalan').fill('Ditolak oleh bank tujuan');
    await inputByText(provider, 'Nomor Referensi Provider').fill(`PROVIDER-FAILED-${suffix}`);
    await provider.getByRole('button', { name: 'Finalisasi Hasil Transaksi' }).click();
    await expect(provider.getByText('Gagal', { exact: true })).toBeVisible();
    await expect(provider.getByText('Bank Nobu', { exact: true })).toBeVisible();
    await expect(provider.getByText('Ditolak oleh bank tujuan', { exact: true })).toBeVisible();

    await login(page, users.FrontDesk);
    await page.goto(`/transfers/${failedId}`);
    await expect(card(page, 'Hasil / Provider').getByText('Gagal', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cetak Resi' })).toHaveCount(0);
  });
});
