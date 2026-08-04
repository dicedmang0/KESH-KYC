import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: FinanceStaff returns a transfer for correction.
 *
 * The whole workflow runs through the real frontend — FrontDesk creates and
 * submits, OperationSupervisor approves layer 1, FinanceStaff returns it with a
 * reason, FinanceManager is checked for the absence of a final approval, and
 * FrontDesk edits and resubmits. Direct backend calls are used only to pick an
 * APPROVED sender application (setup), never for the workflow itself.
 *
 * A returned transfer is REVISION_REQUIRED / "Dikembalikan": non-final, and
 * resubmitting replays the entire flow (screening → supervisor → finance →
 * manager) rather than jumping back to FinanceStaff.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const ROLE_PASSWORD = 'Test@12345';

type RoleName = 'FrontDesk' | 'OperationSupervisor' | 'FinanceStaff' | 'FinanceManager';
type Credential = { email: string; password: string };

const RETURN_REASON = 'Nominal tidak sesuai bukti transfer';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Setup-only backend calls (not the tested workflow) ─────────────────────

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`setup: login failed for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

/** Reuse an existing APPROVED application as the sender — this spec never creates KYC/KYB data. */
async function resolveApprovedSender(token: string): Promise<{ displayName: string }> {
  const res = await fetch(`${API_BASE_URL}/applications?status=APPROVED&limit=25`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`setup: failed listing approved applications: ${res.status}`);
  const body = await res.json();
  const apps: Array<{ display_name?: string }> = body.data ?? (Array.isArray(body) ? body : []);
  const found = apps.find((a) => a.display_name);
  if (!found) {
    throw new Error(
      'setup: no APPROVED application with a display_name exists locally. Seed one before running this spec — see e2e/README.md.',
    );
  }
  return { displayName: found.display_name! };
}

// ── FE-driven helpers ──────────────────────────────────────────────────────

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
    throw new Error(`setup: failed creating ${opts.role} ${opts.email}: ${res.status()} ${await res.text()}`);
  }
}

/** The status shown in the detail page's Ringkasan card (the label also exists in the list filter). */
function summaryCard(page: Page) {
  return page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: 'Ringkasan' }) });
}

// ── Suite ──────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.describe('FinanceStaff return → FrontDesk edit & resubmit — FE-to-BE', () => {
  let ts: string;
  let users: Record<RoleName, Credential>;
  let senderName: string;
  let transferId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();
    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    senderName = (await resolveApprovedSender(sysAdminToken)).displayName;

    users = {
      FrontDesk: { email: `e2e.fd.ret.${ts}@test.local`, password: ROLE_PASSWORD },
      OperationSupervisor: { email: `e2e.os.ret.${ts}@test.local`, password: ROLE_PASSWORD },
      FinanceStaff: { email: `e2e.fs.ret.${ts}@test.local`, password: ROLE_PASSWORD },
      FinanceManager: { email: `e2e.fm.ret.${ts}@test.local`, password: ROLE_PASSWORD },
    };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    for (const role of Object.keys(users) as RoleName[]) {
      await createAdminViaFE(page, { email: users[role].email, fullName: `E2E ${role} Return ${ts}`, role });
    }
    await page.close();
  });

  test('transfer reaches PENDING_FINANCE_STAFF_REVIEW through the UI', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await page.goto('/transfers/new');

    await page.getByPlaceholder('Cari nama atau CIF pengirim…').fill(senderName);
    await page.getByRole('button', { name: new RegExp(escapeRegExp(senderName)) }).click();

    await page.locator('#transfer-amount').fill('25000000');
    await page.locator('#transfer-bank').selectOption({ index: 1 });
    await page.locator('#transfer-account-number').fill('9911223344');
    // Deliberately not a watchlist name — this transfer must take the clean path
    // (SUBMITTED), not the compliance-review branch.
    await page.locator('#transfer-account-name').fill(`E2E Penerima Return ${ts}`);
    await page.locator('#transfer-relationship').selectOption('Vendor');
    await page.locator('#transfer-purpose').fill(`Pembayaran vendor ${ts}`);

    const createResponse = page.waitForResponse(
      (r) => /\/api\/transfers$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Buat Draft' }).click();
    const created = await createResponse;
    expect(created.ok(), await created.text().catch(() => '')).toBeTruthy();
    transferId = String(((await created.json()) as { id: number | string }).id);

    await page.waitForURL(`**/transfers/${transferId}`);

    const submitResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${transferId}/submit`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Ajukan Transaksi' }).click();
    const submitted = await submitResponse;
    expect(submitted.ok(), await submitted.text().catch(() => '')).toBeTruthy();
    expect((await submitted.json()).status).toBe('SUBMITTED');

    // OperationSupervisor clears layer 1 → PENDING_FINANCE_STAFF_REVIEW.
    await switchRole(page, users.OperationSupervisor.email, users.OperationSupervisor.password);
    await page.goto(`/transfers/${transferId}`);
    const supervisorResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${transferId}/supervisor-review`),
    );
    await page.getByRole('button', { name: 'Review & Setujui Layer 1' }).click();
    expect((await (await supervisorResponse).json()).status).toBe('PENDING_FINANCE_STAFF_REVIEW');

    await expect(summaryCard(page).getByText('Menunggu Review Finance Staff')).toBeVisible();
  });

  test('FinanceStaff must give a reason, then the transfer becomes Dikembalikan', async ({ page }) => {
    await login(page, users.FinanceStaff.email, users.FinanceStaff.password);
    await page.goto(`/transfers/${transferId}`);

    const returnButton = page.getByRole('button', { name: 'Kembalikan Transaksi' });
    await expect(returnButton).toBeVisible();
    await returnButton.click();

    // 5. No notes → client-side validation, and no request goes out.
    let returnCalls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/finance-review') && r.method() === 'POST') returnCalls += 1;
    });
    await page.getByRole('button', { name: 'Konfirmasi Kembalikan' }).click();
    await expect(page.getByText('Alasan pengembalian wajib diisi.')).toBeVisible();
    expect(returnCalls).toBe(0);

    // 6. With a reason → RETURN.
    await page.locator('#finance-return-notes').fill(RETURN_REASON);
    const returnResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${transferId}/finance-review`) &&
        r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Konfirmasi Kembalikan' }).click();
    const returned = await returnResponse;
    expect(returned.ok(), await returned.text().catch(() => '')).toBeTruthy();
    expect(returned.request().postDataJSON()).toMatchObject({ action: 'RETURN', notes: RETURN_REASON });
    expect((await returned.json()).status).toBe('REVISION_REQUIRED');

    // 7. Detail reflects the returned state: label, reason, and no "rejected" wording.
    await expect(page.getByText('Transaksi dikembalikan ke FrontDesk untuk diperbaiki.')).toBeVisible();
    await expect(summaryCard(page).getByText('Dikembalikan', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: RETURN_REASON })).toBeVisible();
    await expect(summaryCard(page).getByText('Ditolak', { exact: true })).toHaveCount(0);

    // The list uses the same badge, and the status filter offers it.
    await page.goto('/transfers');
    await page.locator('#transfer-status-filter').selectOption('REVISION_REQUIRED');
    const listRow = page.locator('div.border-t').filter({ hasText: `#${transferId}` }).first();
    await expect(listRow).toBeVisible();
    await expect(listRow.getByText('Dikembalikan', { exact: true })).toBeVisible();
  });

  test('FinanceManager gets no final approval action on a returned transfer', async ({ page }) => {
    await login(page, users.FinanceManager.email, users.FinanceManager.password);
    await page.goto(`/transfers/${transferId}`);

    await expect(summaryCard(page).getByText('Dikembalikan', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Review & Setujui Final' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tolak' })).toHaveCount(0);
    await expect(page.getByText('Tampilan hanya baca')).toBeVisible();
  });

  test('FrontDesk edits the returned transfer and resubmits into the normal flow', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await page.goto(`/transfers/${transferId}`);

    // The return reason is what FrontDesk has to act on.
    await expect(page.getByRole('alert').filter({ hasText: RETURN_REASON })).toBeVisible();

    await page.getByRole('button', { name: 'Ubah Transaksi' }).click();
    await page.locator('#edit-amount').fill('12500000');

    const updateResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${transferId}`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    const updated = await updateResponse;
    expect(updated.ok(), await updated.text().catch(() => '')).toBeTruthy();
    // Still returned — saving edits does not resubmit by itself.
    expect((await updated.json()).status).toBe('REVISION_REQUIRED');
    await expect(summaryCard(page).getByText('Rp 12.500.000')).toBeVisible();

    // 12–13. Resubmit → back to the start of the normal flow, not to FinanceStaff.
    const resubmitResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${transferId}/submit`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Ajukan Ulang Transaksi' }).click();
    const resubmitted = await resubmitResponse;
    expect(resubmitted.ok(), await resubmitted.text().catch(() => '')).toBeTruthy();
    expect((await resubmitted.json()).status).toBe('SUBMITTED');

    await page.goto(`/transfers/${transferId}`);
    await expect(summaryCard(page).getByText('Menunggu Review Operation Supervisor')).toBeVisible();
    await expect(page.getByText('Transaksi dikembalikan ke FrontDesk untuk diperbaiki.')).toHaveCount(0);
  });
});
