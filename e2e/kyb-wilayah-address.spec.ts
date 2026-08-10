import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * FE-to-BE E2E: KYB business address down to Kecamatan and Kelurahan/Desa.
 *
 * The wizard used to stop at Provinsi + Kota/Kabupaten. It now cascades four
 * levels off the same `/references/*` endpoints the Individual CDD form uses,
 * and the create payload carries `business_district_*` / `business_village_*`.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const EMAIL = process.env.E2E_EMAIL || 'admin@example.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin123!';

/** Optional override for the legacy "—" check; otherwise auto-detected. */
const LEGACY_APP_ID = process.env.E2E_LEGACY_WILAYAH_APP_ID || '';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

/** Wait for a <select> populated by an async reference-list fetch. */
async function waitForOptionsLoaded(select: Locator) {
  await expect.poll(async () => select.locator('option').count(), { timeout: 15_000 }).toBeGreaterThan(1);
}

/** The four cascading wilayah dropdowns, in parent→child order. */
function wilayahSelects(page: Page) {
  return {
    provinsi: page.getByLabel('Provinsi'),
    kota: page.getByLabel('Kota / Kabupaten'),
    kecamatan: page.getByLabel('Kecamatan'),
    kelurahan: page.getByLabel('Kelurahan / Desa'),
  };
}

/** Text of the currently selected option — the wizard sends the name alongside the code. */
async function selectedLabel(select: Locator): Promise<string> {
  return (await select.locator('option:checked').textContent())?.trim() ?? '';
}

/** Detail-page Row renders label + value in one flex div; read the value back. */
function detailRow(page: Page, label: string): Locator {
  return page
    .locator('div')
    .filter({ hasText: new RegExp(`^${label.replace(/[/]/g, '\\/')}`) })
    .last();
}

test.describe('KYB business address — Kecamatan & Kelurahan/Desa', () => {
  test('wizard cascades four levels, clears children, and submits the wilayah payload', async ({ page }) => {
    const ts = Date.now().toString();

    await login(page);
    await page.goto('/applications/new?type=business');
    await expect(page.getByText('Input Data KYB')).toBeVisible();

    const { provinsi, kota, kecamatan, kelurahan } = wilayahSelects(page);

    // 1. Provinsi loads on mount.
    await waitForOptionsLoaded(provinsi);

    // Children stay disabled until their parent is chosen.
    await expect(kota).toBeDisabled();
    await expect(kecamatan).toBeDisabled();
    await expect(kelurahan).toBeDisabled();

    // 2. Provinsi → Kota/Kabupaten.
    await provinsi.selectOption({ index: 1 });
    await waitForOptionsLoaded(kota);
    await expect(kecamatan).toBeDisabled();

    // 3. Kota/Kabupaten → Kecamatan.
    await kota.selectOption({ index: 1 });
    await waitForOptionsLoaded(kecamatan);
    await expect(kelurahan).toBeDisabled();

    // 4. Kecamatan → Kelurahan/Desa.
    await kecamatan.selectOption({ index: 1 });
    await waitForOptionsLoaded(kelurahan);
    await kelurahan.selectOption({ index: 1 });
    await expect(kelurahan).not.toHaveValue('');

    // 7. Changing Kecamatan clears only Kelurahan/Desa.
    await kecamatan.selectOption({ index: 2 });
    await expect(kelurahan).toHaveValue('');
    await expect(kota).not.toHaveValue('');

    // 6. Changing Kota/Kabupaten clears Kecamatan + Kelurahan/Desa.
    await kota.selectOption({ index: 2 });
    await expect(kecamatan).toHaveValue('');
    await expect(kelurahan).toHaveValue('');
    await expect(provinsi).not.toHaveValue('');

    // 5. Changing Provinsi clears Kota/Kabupaten, Kecamatan and Kelurahan/Desa.
    await kota.selectOption({ index: 1 });
    await waitForOptionsLoaded(kecamatan);
    await kecamatan.selectOption({ index: 1 });
    await provinsi.selectOption({ index: 2 });
    await expect(kota).toHaveValue('');
    await expect(kecamatan).toHaveValue('');
    await expect(kelurahan).toHaveValue('');

    // Re-pick the full chain and record the names the payload must echo.
    await waitForOptionsLoaded(kota);
    await kota.selectOption({ index: 1 });
    await waitForOptionsLoaded(kecamatan);
    await kecamatan.selectOption({ index: 1 });
    await waitForOptionsLoaded(kelurahan);
    await kelurahan.selectOption({ index: 1 });

    const provinsiName = await selectedLabel(provinsi);
    const kotaName = await selectedLabel(kota);
    const kecamatanName = await selectedLabel(kecamatan);
    const kelurahanName = await selectedLabel(kelurahan);

    // Remaining Step 1 required fields.
    await page.getByLabel('Nama Badan Usaha').fill(`PT Wilayah ${ts}`);
    await page.getByLabel('No. Akta Pendirian').fill(`AKTA-${ts}`);
    await page.getByLabel('Tanggal Pendirian').fill('2021-06-01');
    await page.getByLabel('Nomor Izin Usaha').fill(`NIB-${ts}`);
    await page.getByLabel('NPWP Badan Usaha').fill(ts.padEnd(15, '0').slice(0, 15));
    const bidangUsaha = page.getByLabel('Bidang Usaha');
    await waitForOptionsLoaded(bidangUsaha);
    await bidangUsaha.selectOption({ index: 1 });
    await page.getByLabel('Alamat Kedudukan').fill('Jl. Wilayah Testing No. 4');
    await page.getByLabel('Kode Pos').fill('12345');
    await page.getByLabel('Nomor Telepon Perusahaan').fill(`021${ts.slice(-8)}`);

    const createResponse = page.waitForResponse(
      (res) => res.url().includes('/applications/business') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
    const createRes = await createResponse;
    expect(createRes.status(), await createRes.text().catch(() => '')).toBe(201);

    // 8. Submit payload carries district/village code *and* name.
    const sent = JSON.parse(createRes.request().postData() ?? '{}');
    expect(sent.business_district_code, JSON.stringify(sent)).toBeTruthy();
    expect(sent.business_district_name).toBe(kecamatanName);
    expect(sent.business_village_code, JSON.stringify(sent)).toBeTruthy();
    expect(sent.business_village_name).toBe(kelurahanName);
    expect(sent.business_province_name).toBe(provinsiName);
    expect(sent.business_city_name).toBe(kotaName);

    const appId = (await createRes.json()).id;

    // 9. Detail shows the full address chain.
    await page.goto(`/users/${appId}`);
    await expect(page.getByText('Informasi Identitas Badan Usaha')).toBeVisible();
    await expect(detailRow(page, 'Provinsi')).toContainText(provinsiName);
    await expect(detailRow(page, 'Kota / Kabupaten')).toContainText(kotaName);
    await expect(detailRow(page, 'Kecamatan')).toContainText(kecamatanName);
    await expect(detailRow(page, 'Kelurahan / Desa')).toContainText(kelurahanName);
    await expect(detailRow(page, 'Kode Pos')).toContainText('12345');

    // 10. Edit form preloads the stored chain and can change Kecamatan/Kelurahan.
    await page.getByRole('button', { name: 'Ubah Identitas' }).click();

    const editKecamatan = page.locator('#biz-district');
    const editKelurahan = page.locator('#biz-village');
    // Options for the stored city/district load off the prefilled codes alone.
    await waitForOptionsLoaded(editKecamatan);
    await waitForOptionsLoaded(editKelurahan);
    await expect(editKecamatan.locator('option:checked')).toHaveText(kecamatanName);
    await expect(editKelurahan.locator('option:checked')).toHaveText(kelurahanName);

    await editKecamatan.selectOption({ index: 2 });
    await expect(editKelurahan).toHaveValue('');
    const newKecamatanName = await selectedLabel(editKecamatan);
    await waitForOptionsLoaded(editKelurahan);
    await editKelurahan.selectOption({ index: 1 });
    const newKelurahanName = await selectedLabel(editKelurahan);

    const patchResponse = page.waitForResponse(
      (res) => /\/applications\/\d+\/business$/.test(new URL(res.url()).pathname) && res.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Identitas' }).click();
    const patchRes = await patchResponse;
    expect(patchRes.status(), await patchRes.text().catch(() => '')).toBe(200);

    const patched = JSON.parse(patchRes.request().postData() ?? '{}');
    expect(patched.business_district_name).toBe(newKecamatanName);
    expect(patched.business_village_name).toBe(newKelurahanName);

    await expect(detailRow(page, 'Kecamatan')).toContainText(newKecamatanName);
    await expect(detailRow(page, 'Kelurahan / Desa')).toContainText(newKelurahanName);
  });

  test('legacy rows without district/village show —', async ({ page }) => {
    // Finding a pre-wilayah record is setup, not the tested behaviour.
    const loginRes = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(loginRes.ok, `setup: login failed (${loginRes.status})`).toBeTruthy();
    const auth = { Authorization: `Bearer ${(await loginRes.json()).access_token}` };

    let legacyId = LEGACY_APP_ID;
    if (!legacyId) {
      const list = await (
        await fetch(`${API_BASE_URL}/applications?type=business&limit=200`, { headers: auth })
      ).json();
      const rows: Array<{ id: number | string }> = list.data ?? (Array.isArray(list) ? list : []);
      for (const r of rows) {
        const d = await (await fetch(`${API_BASE_URL}/applications/${r.id}`, { headers: auth })).json();
        if (d?.business && !d.business.business_district_code && !d.business.business_village_code) {
          legacyId = String(r.id);
          break;
        }
      }
    }

    test.skip(
      !legacyId,
      'no pre-wilayah business application exists locally — set E2E_LEGACY_WILAYAH_APP_ID to check the fallback',
    );

    await login(page);
    await page.goto(`/users/${legacyId}`);
    await expect(page.getByText('Informasi Identitas Badan Usaha')).toBeVisible();
    await expect(detailRow(page, 'Kecamatan')).toContainText('—');
    await expect(detailRow(page, 'Kelurahan / Desa')).toContainText('—');
  });

  test('mobile viewport has no document horizontal overflow', async ({ page }) => {
    await login(page);
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/applications/new?type=business');
    await expect(page.getByText('Input Data KYB')).toBeVisible();

    // Let the province list — the longest option text on the form — land first.
    await waitForOptionsLoaded(wilayahSelects(page).provinsi);

    const overflow = await page.evaluate(() => {
      const el = document.documentElement;
      return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
    });
    expect(overflow.scrollWidth, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.clientWidth);
  });
});
