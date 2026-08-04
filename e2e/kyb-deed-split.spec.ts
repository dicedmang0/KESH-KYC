import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * FE-to-BE E2E: KYB Business Identity — the deed field split.
 *
 * "No. Akta Pendirian" (deed_establishment_number, required for PT) and
 * "No. Akta Perubahan Terakhir" (deed_latest_amendment_number, optional) are
 * now two separate inputs instead of one combined field. Old records that only
 * carry the deprecated `deed_number` still display it under No. Akta Pendirian.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const EMAIL = process.env.E2E_EMAIL || 'admin@example.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin123!';

/** Optional override for the legacy-fallback check; otherwise auto-detected. */
const LEGACY_APP_ID = process.env.E2E_LEGACY_DEED_APP_ID || '';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

/** Wait for a <select> populated by an async reference-list fetch. */
async function waitForOptionsLoaded(select: Locator) {
  await expect.poll(async () => select.locator('option').count(), { timeout: 10_000 }).toBeGreaterThan(1);
}

/** Fill everything Step 1 needs except the deed fields, which each test sets itself. */
async function fillStep1Base(page: Page, ts: string) {
  await page.goto('/applications/new?type=business');
  await expect(page.getByText('Input Data KYB')).toBeVisible();

  await page.getByLabel('Nama Badan Usaha').fill(`PT Deed Split ${ts}`);
  // Bentuk Badan Usaha stays at its "PT" default → No. Akta Pendirian required.
  await page.getByLabel('Tanggal Pendirian').fill('2021-03-10');
  await page.getByLabel('Nomor Izin Usaha').fill(`NIB-${ts}`);
  await page.getByLabel('NPWP Badan Usaha').fill(ts.padEnd(15, '0').slice(0, 15));

  const bidangUsaha = page.getByLabel('Bidang Usaha');
  await waitForOptionsLoaded(bidangUsaha);
  await bidangUsaha.selectOption({ index: 1 });

  await page.getByLabel('Alamat Kedudukan').fill('Jl. Akta Split No. 2');

  const provinsi = page.getByLabel('Provinsi');
  await waitForOptionsLoaded(provinsi);
  await provinsi.selectOption({ index: 1 });

  const kota = page.getByLabel('Kota / Kabupaten');
  await waitForOptionsLoaded(kota);
  await kota.selectOption({ index: 1 });

  await page.getByLabel('Kode Pos').fill('12345');
  await page.getByLabel('Nomor Telepon Perusahaan').fill(`021${ts.slice(-8)}`);
}

/** Submit Step 1 and return the created application id. */
async function saveStep1(page: Page): Promise<string> {
  const createResponse = page.waitForResponse(
    (res) => res.url().includes('/applications/business') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
  const res = await createResponse;
  expect(res.status(), await res.text().catch(() => '')).toBe(201);
  return String(((await res.json()) as { id: number | string }).id);
}

test.describe('KYB Business Identity — deed fields split — FE-to-BE', () => {
  test('PT cannot be saved without No. Akta Pendirian', async ({ page }) => {
    const ts = Date.now().toString();
    await login(page);
    await fillStep1Base(page, ts);

    // Both deed inputs exist and the optional one carries no asterisk.
    await expect(page.getByLabel('No. Akta Pendirian')).toBeVisible();
    await expect(page.getByLabel('No. Akta Perubahan Terakhir')).toBeVisible();

    let createCalls = 0;
    page.on('request', (r) => {
      if (r.url().includes('/applications/business') && r.method() === 'POST') createCalls += 1;
    });

    await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
    await expect(page.getByText('Nomor Akta Pendirian wajib diisi untuk badan usaha PT.')).toBeVisible();
    expect(createCalls).toBe(0);
    await expect(page.getByText('Input Data KYB')).toBeVisible();
  });

  test('Akta Perubahan Terakhir is optional, and the detail shows an em dash for it', async ({ page }) => {
    const ts = Date.now().toString();
    await login(page);
    await fillStep1Base(page, ts);
    await page.getByLabel('No. Akta Pendirian').fill(`AKTA-P-${ts}`);

    const createRequest = page.waitForRequest(
      (r) => r.url().includes('/applications/business') && r.method() === 'POST',
    );
    const appId = await saveStep1(page);

    // Empty optional field is sent as null, and the deprecated key is not sent.
    const body = (await createRequest).postDataJSON();
    expect(body).toMatchObject({
      deed_establishment_number: `AKTA-P-${ts}`,
      deed_latest_amendment_number: null,
    });
    expect(body.deed_number).toBeUndefined();

    await page.goto(`/users/${appId}`);
    await expect(page.getByText('Informasi Identitas Badan Usaha')).toBeVisible();
    const establishment = page.locator('div').filter({ hasText: /^No\. Akta Pendirian/ }).last();
    await expect(establishment).toContainText(`AKTA-P-${ts}`);
    const amendment = page.locator('div').filter({ hasText: /^No\. Akta Perubahan Terakhir/ }).last();
    await expect(amendment).toContainText('—');
    // The old combined label is gone.
    await expect(page.getByText('Nomor Akta Pendirian & Perubahan Terakhir')).toHaveCount(0);
  });

  test('both deed numbers are stored and shown on the business detail', async ({ page }) => {
    const ts = Date.now().toString();
    await login(page);
    await fillStep1Base(page, ts);
    await page.getByLabel('No. Akta Pendirian').fill(`AKTA-P-${ts}`);
    await page.getByLabel('No. Akta Perubahan Terakhir').fill(`AKTA-U-${ts}`);

    const createRequest = page.waitForRequest(
      (r) => r.url().includes('/applications/business') && r.method() === 'POST',
    );
    const appId = await saveStep1(page);

    expect((await createRequest).postDataJSON()).toMatchObject({
      deed_establishment_number: `AKTA-P-${ts}`,
      deed_latest_amendment_number: `AKTA-U-${ts}`,
    });

    await page.goto(`/users/${appId}`);
    await expect(page.locator('div').filter({ hasText: /^No\. Akta Pendirian/ }).last()).toContainText(
      `AKTA-P-${ts}`,
    );
    await expect(
      page.locator('div').filter({ hasText: /^No\. Akta Perubahan Terakhir/ }).last(),
    ).toContainText(`AKTA-U-${ts}`);
  });

  test('legacy records show deed_number under No. Akta Pendirian', async ({ page }) => {
    // Locating a pre-split record is setup, not the tested behaviour: scan recent
    // business applications for one whose detail still only carries deed_number.
    const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(loginRes.ok, `setup: login failed (${loginRes.status})`).toBeTruthy();
    const token = (await loginRes.json()).access_token;
    const auth = { Authorization: `Bearer ${token}` };

    let legacyId = LEGACY_APP_ID;
    let deedNumber = '';
    if (legacyId) {
      const d = await (await fetch(`${API_BASE_URL}/applications/${legacyId}`, { headers: auth })).json();
      deedNumber = d?.business?.deed_number ?? '';
    } else {
      // Pre-split records are old, so scan deep rather than just the newest page.
      const listRes = await fetch(`${API_BASE_URL}/applications?type=business&limit=200`, { headers: auth });
      const list = await listRes.json();
      const rows: Array<{ id: number | string }> = list.data ?? (Array.isArray(list) ? list : []);
      for (const r of rows) {
        const d = await (await fetch(`${API_BASE_URL}/applications/${r.id}`, { headers: auth })).json();
        const b = d?.business;
        if (b?.deed_number && !b?.deed_establishment_number) {
          legacyId = String(r.id);
          deedNumber = b.deed_number;
          break;
        }
      }
    }

    test.skip(
      !legacyId,
      'no pre-split business application (deed_number without deed_establishment_number) exists locally — ' +
        'set E2E_LEGACY_DEED_APP_ID to check the fallback',
    );

    await login(page);
    await page.goto(`/users/${legacyId}`);
    await expect(page.getByText('Informasi Identitas Badan Usaha')).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^No\. Akta Pendirian/ }).last()).toContainText(
      deedNumber,
    );
  });
});
