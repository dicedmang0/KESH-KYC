import { test, expect, type Page } from '@playwright/test';

/**
 * FE-to-BE E2E: transaction-level mandatory EDD triggered by amount alone.
 *
 * Backend rule (transfers.service.ts submit()): amount >= Rp50.000.000 routes
 * the transfer straight to PENDING_COMPLIANCE_REVIEW with red flag
 * AMOUNT_EDD_THRESHOLD, independent of watchlist screening — same mechanism
 * `dttot-watchlist-transfer-hit.spec.ts` exercises for beneficiary hits, just
 * a different trigger. This spec drives the boundary (49.999.999 / 50.000.000)
 * through the real transfer form and checks what the detail page shows.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

type ApprovedSender = { applicationId: string; displayName: string };

/** Reuse an existing local APPROVED application — this spec never creates/approves KYC/KYB data. */
async function resolveApprovedSender(token: string): Promise<ApprovedSender> {
  const res = await fetch(`${API_BASE_URL}/applications?status=APPROVED&limit=25`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`setup: failed listing approved applications: ${res.status}`);
  const body = await res.json();
  const apps: Array<{ id: string; display_name: string }> = body.data ?? (Array.isArray(body) ? body : []);
  const found = apps.find((a) => a.display_name);
  if (!found) {
    throw new Error(
      'setup: no APPROVED application with a display_name exists locally. Seed one before running this spec.',
    );
  }
  return { applicationId: String(found.id), displayName: found.display_name };
}

/** Fills and submits the single-transfer form through the real UI, returns the created id. */
async function createAndSubmitTransfer(
  page: Page,
  sender: ApprovedSender,
  amount: number,
  benef: string,
): Promise<{ id: string; submitStatus: string }> {
  await page.goto('/transfers/new');
  await page.getByPlaceholder('Cari nama atau CIF pengirim…').fill(sender.displayName);
  await page.getByRole('button', { name: new RegExp(escapeRegExp(sender.displayName)) }).click();

  await page.locator('#transfer-amount').fill(String(amount));
  await page.locator('#transfer-bank').selectOption({ index: 1 });
  await page.locator('#transfer-account-number').fill('1234509876');
  await page.locator('#transfer-account-name').fill(benef);
  await page.locator('#transfer-relationship').selectOption('Lainnya');
  await page.locator('#transfer-purpose').fill('Pembayaran vendor EDD threshold spec');

  const createResponse = page.waitForResponse(
    (r) => /\/api\/transfers$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Buat Draft' }).click();
  const created = await createResponse;
  expect(created.ok(), await created.text().catch(() => '')).toBeTruthy();
  const id = String(((await created.json()) as { id: number | string }).id);

  await page.waitForURL(`**/transfers/${id}`);

  const submitResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname.endsWith(`/transfers/${id}/submit`) && r.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Ajukan Transaksi' }).click();
  const submitted = await submitResponse;
  expect(submitted.ok(), await submitted.text().catch(() => '')).toBeTruthy();
  const submitStatus = (await submitted.json()).status;

  // Detail redirects to the list after submit (existing behaviour, same as
  // the watchlist spec) — go back to the detail page to inspect it.
  await page.waitForURL('**/transfers');
  await page.goto(`/transfers/${id}`);

  return { id, submitStatus };
}

test.describe('Transfer EDD amount threshold — FE-to-BE', () => {
  let sender: ApprovedSender;
  const ts = String(Date.now()).slice(-8);

  test.beforeAll(async () => {
    const token = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    sender = await resolveApprovedSender(token);
  });

  test('Rp49.999.999 does not trigger the amount-based mandatory EDD', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    const { submitStatus } = await createAndSubmitTransfer(page, sender, 49_999_999, `EDD Below ${ts}`);
    expect(submitStatus).toBe('SUBMITTED');

    const summary = page
      .locator('div.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Ringkasan' }) });
    await expect(summary.getByText('Menunggu Review Compliance')).toHaveCount(0);
  });

  test('Rp50.000.000 (boundary) triggers mandatory EDD, shown on the transfer detail', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    const { submitStatus } = await createAndSubmitTransfer(page, sender, 50_000_000, `EDD Exact ${ts}`);
    expect(submitStatus).toBe('PENDING_COMPLIANCE_REVIEW');

    const summary = page
      .locator('div.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Ringkasan' }) });
    await expect(summary.getByText('Menunggu Review Compliance')).toBeVisible();

    const compliance = page
      .locator('div.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Review Compliance' }) });
    await expect(compliance).toBeVisible();
    await expect(compliance.getByText('Wajib EDD (nominal ≥ Rp50 juta)')).toBeVisible();
  });

  test('Rp50.000.001 also triggers mandatory EDD', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    const { submitStatus } = await createAndSubmitTransfer(page, sender, 50_000_001, `EDD Above ${ts}`);
    expect(submitStatus).toBe('PENDING_COMPLIANCE_REVIEW');
  });
});
