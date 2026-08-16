import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: conditional "Sumber Dana Lainnya" detail on Pencatatan Transfer.
 *
 * Rule (same as KYC/KYB since migration 0071): picking "Lainnya" never replaces
 * the dropdown value — `source_of_funds` stays "Lainnya" and the typed detail is
 * stored beside it in `source_of_funds_other`.
 *
 * Everything runs through the real UI; direct backend calls are setup only
 * (picking an APPROVED sender, and reading a row back to assert persistence).
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';
const ROLE_PASSWORD = 'Test@12345';

// Semua skenario di spec ini berjalan sebagai FrontDesk — pembuat & pengubah
// draft transfer. Peran lain tidak menyentuh field Sumber Dana.
type RoleName = 'FrontDesk';
type Credential = { email: string; password: string };

const SOF_DETAIL = 'Hasil penjualan aset';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Setup-only backend calls ────────────────────────────────────────────────

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`setup: login failed for ${email}: ${res.status}`);
  return (await res.json()).access_token;
}

async function resolveApprovedSender(token: string): Promise<{ displayName: string }> {
  const res = await fetch(`${API_BASE_URL}/applications?status=APPROVED&limit=25`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`setup: failed listing approved applications: ${res.status}`);
  const body = await res.json();
  const apps: Array<{ display_name?: string }> = body.data ?? (Array.isArray(body) ? body : []);
  const found = apps.find((a) => a.display_name);
  if (!found) {
    throw new Error('setup: no APPROVED application with a display_name exists locally.');
  }
  return { displayName: found.display_name! };
}

/** Read the stored row back — asserts persistence, never drives the workflow. */
async function readTransfer(token: string, id: string) {
  const res = await fetch(`${API_BASE_URL}/transfers/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`assert: failed reading transfer ${id}: ${res.status}`);
  return res.json() as Promise<{ source_of_funds?: string | null; source_of_funds_other?: string | null }>;
}

// ── FE helpers ──────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
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
    throw new Error(`setup: failed creating admin ${opts.email}: ${res.status()}`);
  }
}

/** The conditional detail input, addressed by its visible label. */
const detailInput = (page: Page) =>
  page.locator('div').filter({ hasText: /^Sumber Dana Lainnya/ }).last().locator('input');

// ── Suite ───────────────────────────────────────────────────────────────────

test.describe('Pencatatan Transfer — Sumber Dana "Lainnya" (FE-to-BE)', () => {
  let ts: string;
  let senderName: string;
  let users: Record<RoleName, Credential>;
  let sysAdminToken: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();
    sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    senderName = (await resolveApprovedSender(sysAdminToken)).displayName;

    users = {
      FrontDesk: { email: `pw.sof.fd.${ts}@test.local`, password: ROLE_PASSWORD },
    };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    for (const role of Object.keys(users) as RoleName[]) {
      await createAdminViaFE(page, { email: users[role].email, fullName: `PW ${role} ${ts}`, role });
    }
    await page.close();
  });

  /** Fill the create form's mandatory fields, leaving Sumber Dana untouched. */
  async function fillTransferBasics(page: Page, tag: string) {
    await page.goto('/transfers/new');
    await page.getByPlaceholder('Cari nama atau CIF pengirim…').fill(senderName);
    await page.getByRole('button', { name: new RegExp(escapeRegExp(senderName)) }).click();
    await page.locator('#transfer-amount').fill('1500000');
    await page.locator('#transfer-bank').selectOption({ index: 1 });
    await page.locator('#transfer-account-number').fill('9911223344');
    await page.locator('#transfer-account-name').fill(`E2E Penerima SOF ${tag}`);
    await page.locator('#transfer-relationship').selectOption('Vendor');
    await page.locator('#transfer-purpose').fill(`Pembayaran vendor ${tag}`);
  }

  async function submitDraft(page: Page): Promise<string> {
    const createResponse = page.waitForResponse(
      (r) => /\/api\/transfers$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Buat Draft' }).click();
    const created = await createResponse;
    expect(created.ok(), await created.text().catch(() => '')).toBeTruthy();
    return String(((await created.json()) as { id: number | string }).id);
  }

  test('non-Lainnya selection never shows the detail field and stores no detail', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await fillTransferBasics(page, `${ts}-plain`);

    // Default (nothing picked) → hidden.
    await expect(detailInput(page)).toHaveCount(0);

    await page.locator('#transfer-sof').selectOption('Gaji');
    await expect(detailInput(page)).toHaveCount(0);

    const id = await submitDraft(page);
    const stored = await readTransfer(sysAdminToken, id);
    expect(stored.source_of_funds).toBe('Gaji');
    expect(stored.source_of_funds_other).toBeNull();

    // Detail page shows only the dropdown value.
    await page.waitForURL(`**/transfers/${id}`);
    await expect(page.getByText('Sumber Dana', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Sumber Dana Lainnya', { exact: true })).toHaveCount(0);
  });

  test('selecting Lainnya reveals the field, blocks empty submit, and sends both values', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await fillTransferBasics(page, `${ts}-other`);

    await page.locator('#transfer-sof').selectOption('Lainnya');
    const input = detailInput(page);
    await expect(input).toBeVisible();
    await expect(input).toHaveAttribute('placeholder', 'Masukkan sumber dana');

    // Empty → submit blocked, no POST fired.
    let posted = false;
    page.on('request', (r) => {
      if (/\/api\/transfers$/.test(new URL(r.url()).pathname) && r.method() === 'POST') posted = true;
    });
    await page.getByRole('button', { name: 'Buat Draft' }).click();
    await expect(page.getByText('Sumber dana lainnya wajib diisi.')).toBeVisible();
    expect(posted, 'empty detail must not reach the backend').toBe(false);

    // Valid value → payload carries the dropdown value AND the detail separately.
    await input.fill(SOF_DETAIL);
    const createRequest = page.waitForRequest(
      (r) => /\/api\/transfers$/.test(new URL(r.url()).pathname) && r.method() === 'POST',
    );
    const id = await submitDraft(page);
    const body = (await createRequest).postDataJSON();
    expect(body.source_of_funds).toBe('Lainnya');
    expect(body.source_of_funds_other).toBe(SOF_DETAIL);

    const stored = await readTransfer(sysAdminToken, id);
    expect(stored.source_of_funds).toBe('Lainnya');
    expect(stored.source_of_funds_other).toBe(SOF_DETAIL);

    // Detail page shows both, on separate rows.
    await page.waitForURL(`**/transfers/${id}`);
    await expect(page.getByText('Sumber Dana Lainnya', { exact: true })).toBeVisible();
    await expect(page.getByText(SOF_DETAIL).first()).toBeVisible();
  });

  test('switching away from Lainnya removes the field and clears the value', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await fillTransferBasics(page, `${ts}-switch`);

    await page.locator('#transfer-sof').selectOption('Lainnya');
    await detailInput(page).fill('teks yang harus hilang');

    await page.locator('#transfer-sof').selectOption('Warisan');
    await expect(detailInput(page)).toHaveCount(0);

    // Switching back shows an empty input, never the stale text.
    await page.locator('#transfer-sof').selectOption('Lainnya');
    await expect(detailInput(page)).toHaveValue('');

    await page.locator('#transfer-sof').selectOption('Warisan');
    const id = await submitDraft(page);
    const stored = await readTransfer(sysAdminToken, id);
    expect(stored.source_of_funds).toBe('Warisan');
    expect(stored.source_of_funds_other).toBeNull();
  });

  test('edit restores the saved detail, and changing to a normal option clears it', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await fillTransferBasics(page, `${ts}-edit`);
    await page.locator('#transfer-sof').selectOption('Lainnya');
    await detailInput(page).fill('Hasil investasi');
    const id = await submitDraft(page);
    await page.waitForURL(`**/transfers/${id}`);

    // Reopen the edit panel — both values must come back.
    await page.getByRole('button', { name: 'Ubah Transaksi' }).click();
    await expect(page.locator('#edit-sof')).toHaveValue('Lainnya');
    await expect(detailInput(page)).toHaveValue('Hasil investasi');

    // Lainnya → Gaji clears the detail end to end.
    await page.locator('#edit-sof').selectOption('Gaji');
    await expect(detailInput(page)).toHaveCount(0);
    const saved = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${id}`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    expect((await saved).ok()).toBeTruthy();

    const stored = await readTransfer(sysAdminToken, id);
    expect(stored.source_of_funds).toBe('Gaji');
    expect(stored.source_of_funds_other).toBeNull();
    await expect(page.getByText('Sumber Dana Lainnya', { exact: true })).toHaveCount(0);
  });

  test('edit from a normal option to Lainnya requires the detail before saving', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await fillTransferBasics(page, `${ts}-toother`);
    await page.locator('#transfer-sof').selectOption('Gaji');
    const id = await submitDraft(page);
    await page.waitForURL(`**/transfers/${id}`);

    await page.getByRole('button', { name: 'Ubah Transaksi' }).click();
    await page.locator('#edit-sof').selectOption('Lainnya');
    await expect(detailInput(page)).toHaveValue('');

    let patched = false;
    page.on('request', (r) => {
      if (new URL(r.url()).pathname.endsWith(`/transfers/${id}`) && r.method() === 'PATCH') patched = true;
    });
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    await expect(page.getByText('Sumber dana lainnya wajib diisi.')).toBeVisible();
    expect(patched, 'empty detail must not reach the backend').toBe(false);

    await detailInput(page).fill('Hasil penjualan kendaraan');
    const saved = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${id}`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    expect((await saved).ok()).toBeTruthy();

    const stored = await readTransfer(sysAdminToken, id);
    expect(stored.source_of_funds).toBe('Lainnya');
    expect(stored.source_of_funds_other).toBe('Hasil penjualan kendaraan');
  });

  test('the create form stays responsive on mobile and tablet widths', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
    ]) {
      await page.setViewportSize(viewport);
      await fillTransferBasics(page, `${ts}-resp`);
      await page.locator('#transfer-sof').selectOption('Lainnya');
      await expect(detailInput(page)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `viewport ${viewport.width}px overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
