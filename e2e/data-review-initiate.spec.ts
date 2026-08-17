import { test, expect, type Page } from '@playwright/test';

/**
 * FE-to-BE E2E: FrontDesk "Mulai Pengkinian Data" (Pengkinian Data / periodic
 * data review initiation).
 *
 * Backend already allows both FrontDesk and ComplianceLead to call
 * POST /applications/:id/data-review/initiate (@Roles("ComplianceLead",
 * "FrontDesk")) — the bug was purely FE-side: lib/data-reviews.ts's
 * canInitiateDataReview() still excluded FrontDesk, so the button never
 * rendered for that role even though the API would have accepted the call.
 *
 * The tested WORKFLOW (open application detail → see/click "Mulai Pengkinian
 * Data" → open the /data-reviews worklist) runs through the real frontend.
 * Direct backend calls appear only in beforeAll, to seed a fresh APPROVED
 * application with no active review — test-data setup, not the tested
 * workflow.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const COMPLIANCE_EMAIL = process.env.E2E_COMPLIANCE_EMAIL || 'admin@example.com';
const COMPLIANCE_PASSWORD = process.env.E2E_COMPLIANCE_PASSWORD || 'Admin123!';

const ROLE_PASSWORD = 'Test@12345';
const ts = Date.now().toString().slice(-7);

// ── Setup-only backend calls (not the tested workflow) ──────────────────────

async function api<T>(token: string, path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) throw new Error(`setup: ${path} → ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
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

/**
 * A fresh APPROVED individual application with no data review yet.
 * first_submitted_at lands today, so due_at is years out — this exercises the
 * "must still allow initiate while due_status is Belum Jatuh Tempo" rule
 * without needing to fabricate a risk score or due date.
 */
async function seedApprovedIndividual(token: string, fullName: string, seq: string): Promise<string> {
  const created = await api<{ id: number | string }>(token, '/applications/individual', {
    method: 'POST',
    body: {
      full_name: fullName,
      ktp_number: '3175001234567890',
      identity_type: 'KTP',
      identity_number: `36${seq}${ts}`,
      address_identity: 'Jl. Pengkinian Data No. 1, Jakarta',
      pob: 'Jakarta',
      dob: '1990-01-01',
      nationality: 'ID',
      phone: `0856${seq}${ts}`,
      occupation: 'Karyawan Swasta',
      gender: 'M',
      signature_uri: 'https://storage.test/dr_sig.png',
    },
  });
  const appId = String(created.id);

  for (const doc_type of ['INDIVIDUAL_KTP_PHOTO', 'INDIVIDUAL_FACE_PHOTO', 'INDIVIDUAL_FACE_WITH_KTP_PHOTO']) {
    await api(token, `/applications/${appId}/documents`, {
      method: 'POST',
      body: { doc_type, file_uri: `https://storage.test/dr_${doc_type.toLowerCase()}.jpg` },
    });
  }

  await api(token, `/applications/${appId}/submit`, { method: 'PATCH' });
  await api(token, `/applications/${appId}/decision`, {
    method: 'PATCH',
    body: { decision: 'APPROVED', reason: 'data-review spec setup' },
  });
  return appId;
}

// ── FE-driven helpers ────────────────────────────────────────────────────────

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

async function createAdminViaFE(page: Page, opts: { email: string; fullName: string; role: 'FrontDesk' | 'Auditor' }) {
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

/** The "Pengkinian Data" card on the application detail page. */
function dataReviewCard(page: Page) {
  return page.locator('div.rounded-xl').filter({ hasText: 'Pengkinian Data' }).first();
}

test.describe.serial('Pengkinian Data — FrontDesk initiate (FE-to-BE)', () => {
  let frontDesk: { email: string; password: string };
  let auditor: { email: string; password: string };
  let appDetail: string; // used for the full application-detail flow (A tests)

  test.beforeAll(async ({ browser }) => {
    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);

    frontDesk = { email: `e2e.dr.fd.${ts}@test.local`, password: ROLE_PASSWORD };
    auditor = { email: `e2e.dr.aud.${ts}@test.local`, password: ROLE_PASSWORD };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await createAdminViaFE(page, { email: frontDesk.email, fullName: `E2E DR FrontDesk ${ts}`, role: 'FrontDesk' });
    await createAdminViaFE(page, { email: auditor.email, fullName: `E2E DR Auditor ${ts}`, role: 'Auditor' });
    await page.close();

    appDetail = await seedApprovedIndividual(sysAdminToken, `DR Detail Flow ${ts}`, '01');
    await seedApprovedIndividual(sysAdminToken, `DR Worklist Flow ${ts}`, '02');
  });

  // ── A. Application detail ──────────────────────────────────────────────

  test('A1/A2: FrontDesk sees "Mulai Pengkinian Data" even while Belum Jatuh Tempo', async ({ page }) => {
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/users/${appDetail}`);

    const card = dataReviewCard(page);
    await expect(card).toBeVisible();
    // Fresh application → due date is years out → still allowed to initiate.
    await expect(card.getByText('Belum Jatuh Tempo').first()).toBeVisible();
    await expect(card.getByRole('button', { name: 'Mulai Pengkinian Data' })).toBeVisible();
  });

  test('A3: ComplianceLead sees "Mulai Pengkinian Data" too', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/users/${appDetail}`);
    await expect(dataReviewCard(page).getByRole('button', { name: 'Mulai Pengkinian Data' })).toBeVisible();
  });

  test('A4: Auditor does not see "Mulai Pengkinian Data" (read-only)', async ({ page }) => {
    await login(page, auditor.email, auditor.password);
    await page.goto(`/users/${appDetail}`);
    const card = dataReviewCard(page);
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'Mulai Pengkinian Data' })).toHaveCount(0);
  });

  test('A5-A9: FrontDesk initiate calls the real API, button disappears, active state + Perbarui Data show, no Compliance controls', async ({ page }) => {
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/users/${appDetail}`);

    const card = dataReviewCard(page);
    const initiateResponse = page.waitForResponse(
      (r) => r.url().includes(`/applications/${appDetail}/data-review/initiate`) && r.request().method() === 'POST',
    );
    await card.getByRole('button', { name: 'Mulai Pengkinian Data' }).click();
    const res = await initiateResponse;
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();
    const body = await res.json();
    expect(body.created).toBe(true);
    expect(body.status).toBe('DRAFT');

    // A6: initiate button gone, replaced by the active-review state.
    await expect(card.getByRole('button', { name: 'Mulai Pengkinian Data' })).toHaveCount(0);

    // A7: current workflow state visible.
    await expect(card.getByText('Pengkinian Sedang Berjalan')).toBeVisible();
    await expect(card.getByText('Menunggu Update Frontline').first()).toBeVisible();
    await expect(card.getByText('Diinisiasi oleh')).toBeVisible();

    // A8: FrontDesk has a path back into the edit flow.
    await expect(card.getByRole('link', { name: 'Perbarui Data' })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Lihat Detail Pengkinian' })).toBeVisible();

    // A9: no Compliance decision controls for FrontDesk.
    await expect(card.getByRole('button', { name: 'Setujui' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Kembalikan untuk Revisi' })).toHaveCount(0);
    await expect(card.getByRole('button', { name: 'Tolak' })).toHaveCount(0);

    // Re-initiate while active must be idempotent, never a duplicate button.
    await switchRole(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/users/${appDetail}`);
    await expect(dataReviewCard(page).getByRole('button', { name: 'Mulai Pengkinian Data' })).toHaveCount(0);
  });

  // ── B. Pengkinian Data worklist ─────────────────────────────────────────

  test('B10/B11: FrontDesk can open the worklist and an eligible row exposes initiation', async ({ page }) => {
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto('/data-reviews');
    await expect(page.getByRole('heading', { name: 'Pengkinian Data' })).toBeVisible();

    await page.getByPlaceholder('CIF atau nama…').fill(`DR Worklist Flow ${ts}`);
    const row = page.locator('tr').filter({ hasText: `DR Worklist Flow ${ts}` }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Mulai Pengkinian Data' })).toBeVisible();
  });

  test('B12: an active-review row does not expose a duplicate initiate action', async ({ page }) => {
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto('/data-reviews');
    await page.getByPlaceholder('CIF atau nama…').fill(`DR Detail Flow ${ts}`);
    const row = page.locator('tr').filter({ hasText: `DR Detail Flow ${ts}` }).first();
    await expect(row).toBeVisible();
    // Already initiated in the A5-A9 test above.
    await expect(row.getByRole('button', { name: 'Mulai Pengkinian Data' })).toHaveCount(0);
    await expect(row.getByText('Menunggu Update Frontline')).toBeVisible();
  });

  test('B13: ComplianceLead worklist access still works', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto('/data-reviews');
    await expect(page.getByRole('heading', { name: 'Pengkinian Data' })).toBeVisible();
    await page.getByPlaceholder('CIF atau nama…').fill(`DR Worklist Flow ${ts}`);
    const row = page.locator('tr').filter({ hasText: `DR Worklist Flow ${ts}` }).first();
    await expect(row.getByRole('button', { name: 'Mulai Pengkinian Data' })).toBeVisible();
  });

  test('B14: Auditor stays read-only on the worklist', async ({ page }) => {
    await login(page, auditor.email, auditor.password);
    await page.goto('/data-reviews');
    await expect(page.getByRole('heading', { name: 'Pengkinian Data' })).toBeVisible();
    await page.getByPlaceholder('CIF atau nama…').fill(`DR Worklist Flow ${ts}`);
    const row = page.locator('tr').filter({ hasText: `DR Worklist Flow ${ts}` }).first();
    await expect(row).toBeVisible();
    await expect(row.getByRole('button', { name: 'Mulai Pengkinian Data' })).toHaveCount(0);
  });
});
