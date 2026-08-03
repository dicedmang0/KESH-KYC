import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: KYC/KYB application detail — watchlist screening section,
 * compliance-blocking banner, and the manual "Re-screen Watchlist" action.
 *
 * The tested workflow runs through the real frontend: open the application
 * detail as ComplianceLead, read the Screening section, click Re-screen, and
 * see the refreshed risk level. Direct backend calls are used only to pick the
 * target application and to state a clear reason when the local DB has no
 * DTTOT-hit application to test against.
 *
 * Screening hits come from the detail response (`screening[]` +
 * `watchlist_summary`) — the page no longer issues a separate
 * `GET /applications/:id/screening`.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const COMPLIANCE_EMAIL = process.env.E2E_COMPLIANCE_EMAIL || 'admin@example.com';
const COMPLIANCE_PASSWORD = process.env.E2E_COMPLIANCE_PASSWORD || 'Admin123!';

const ROLE_PASSWORD = 'Test@12345';

/** Local application known to carry DTTOT hits (Mira Ariani). Override if yours differs. */
const TARGET_APP_ID = process.env.E2E_WATCHLIST_APP_ID || '13686';

type ScreeningHit = {
  list_type: string;
  input_name: string;
  matched_name: string;
  match_score: number;
  unique_id: string | null;
  status: string;
};

type AppDetail = {
  application: { id: string | number; status: string };
  person?: { full_name?: string } | null;
  business?: { legal_name?: string } | null;
  risk?: { risk_level?: string } | null;
  screening?: ScreeningHit[] | null;
  watchlist_summary?: { compliance_blocking?: boolean; list_types?: string[] } | null;
};

// ── Setup / verification-only backend calls (not the tested workflow) ───────

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`setup: login failed for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function apiAppDetail(token: string, appId: string): Promise<AppDetail> {
  const res = await fetch(`${API_BASE_URL}/applications/${appId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `setup: application ${appId} not readable (${res.status}). Point E2E_WATCHLIST_APP_ID at a local ` +
        'application whose customer name matches an uploaded DTTOT entry — run ' +
        'e2e/dttot-watchlist-transfer-hit.spec.ts first to load DTTOT data.',
    );
  }
  return res.json();
}

// ── FE-driven helpers ──────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function createFrontDeskViaFE(page: Page, opts: { email: string; fullName: string }) {
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel('Nama').fill(opts.fullName);
  await page.getByLabel('Role').selectOption('FrontDesk');
  await page.getByLabel('Password awal').fill(ROLE_PASSWORD);

  const created = page.waitForResponse(
    (res) => res.url().includes('/users/admins') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Buat Admin' }).click();
  const res = await created;
  if (res.status() !== 201) {
    throw new Error(`setup: failed creating FrontDesk ${opts.email}: ${res.status()} ${await res.text()}`);
  }
}

// ── Suite ──────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.describe('Application detail — watchlist screening & re-screen — FE-to-BE', () => {
  let complianceToken: string;
  let detail: AppDetail;
  let customerName: string;
  let frontDesk: { email: string; password: string };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ts = Date.now().toString();
    complianceToken = await apiLogin(COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    detail = await apiAppDetail(complianceToken, TARGET_APP_ID);

    const hits = detail.screening ?? [];
    if (hits.length === 0) {
      throw new Error(
        `setup: application ${TARGET_APP_ID} has no watchlist hits. Run ` +
          'e2e/dttot-watchlist-transfer-hit.spec.ts to load DTTOT data, then re-screen that ' +
          'application, or point E2E_WATCHLIST_APP_ID at one that already hits.',
      );
    }
    customerName = detail.person?.full_name ?? detail.business?.legal_name ?? '';
    console.log(
      `[e2e] target app ${TARGET_APP_ID} "${customerName}": ${hits.length} hit(s), ` +
        `lists ${(detail.watchlist_summary?.list_types ?? []).join(',')}, risk ${detail.risk?.risk_level}`,
    );

    frontDesk = { email: `e2e.fd.screening.${ts}@test.local`, password: ROLE_PASSWORD };
    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await createFrontDeskViaFE(page, { email: frontDesk.email, fullName: `E2E FrontDesk Screening ${ts}` });
    await page.close();
  });

  test('Screening section lists the watchlist hits and warns that Compliance review is required', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/users/${TARGET_APP_ID}`);

    await expect(page.getByText('Screening', { exact: true })).toBeVisible();
    // The whole point of the fix: stored hits must not read as "no match".
    await expect(page.getByText('Tidak ada match pada watchlist')).toHaveCount(0);

    const hits = detail.screening ?? [];
    // "Jenis List" is the screening table's first column header — unique on the page.
    const table = page.locator('table', { hasText: 'Jenis List' });
    await expect(table.getByRole('cell', { name: 'DTTOT', exact: true }).first()).toBeVisible();
    await expect(table.getByRole('cell', { name: hits[0].matched_name, exact: true }).first()).toBeVisible();
    await expect(table.getByRole('cell', { name: customerName, exact: true }).first()).toBeVisible();
    // One row per hit — multiple hits must all render.
    await expect(table.getByRole('row')).toHaveCount(hits.length + 1); // + header

    // 1.000 → 100.0%
    if (hits.some((h) => Number(h.match_score) === 1)) {
      await expect(table.getByRole('cell', { name: '100.0%' }).first()).toBeVisible();
    }
    const withUniqueId = hits.find((h) => h.unique_id);
    if (withUniqueId) {
      await expect(table.getByRole('cell', { name: withUniqueId.unique_id!, exact: true })).toBeVisible();
    }

    await expect(
      page.getByRole('alert').filter({
        hasText: 'Customer terindikasi masuk daftar DTTOT/PPPSPM. Aplikasi memerlukan review Compliance.',
      }),
    ).toBeVisible();
  });

  test('ComplianceLead can re-screen, and the refreshed risk level is HIGH', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/users/${TARGET_APP_ID}`);

    const button = page.getByRole('button', { name: 'Re-screen Watchlist' });
    await expect(button).toBeVisible();

    const rescreened = page.waitForResponse(
      (res) => res.url().includes('/rescreen-watchlist') && res.request().method() === 'POST',
    );
    await button.click();
    const res = await rescreened;
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();
    const body = (await res.json()) as { risk_level: string; compliance_blocking: boolean; hit_count: number };
    expect(body.compliance_blocking).toBe(true);
    expect(body.risk_level).toBe('HIGH');
    expect(body.hit_count).toBeGreaterThan(0);

    await expect(page.getByText(/Re-screen selesai/)).toBeVisible();

    // Detail reloads from the same response — RBA card and screening stay consistent.
    const rbaCard = page.locator('div.rounded-xl', { hasText: 'Risk Based Approach' }).first();
    await expect(rbaCard.getByText('Tinggi', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('alert').filter({ hasText: 'Aplikasi memerlukan review Compliance.' }),
    ).toBeVisible();
    await expect(page.getByText('Tidak ada match pada watchlist')).toHaveCount(0);
  });

  test('FrontDesk sees the screening result but not the Re-screen action', async ({ page }) => {
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/users/${TARGET_APP_ID}`);

    await expect(page.getByText('Screening', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-screen Watchlist' })).toHaveCount(0);
  });
});
