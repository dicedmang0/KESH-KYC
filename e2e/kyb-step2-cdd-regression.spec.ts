import { test, expect, type Page, type Locator, type Request, type Response } from '@playwright/test';

/**
 * Regression test for the KYB bug where Step 2 "Pengurus & Pemegang Saham" →
 * "Lanjut" incorrectly called PATCH /api/applications/:id — the Individual-only
 * CDD update endpoint — and failed with:
 *   "Update CDD hanya berlaku untuk aplikasi Individual"
 *
 * Drives the real FE against a real local BE (no direct API calls for the
 * scenario itself; only assertions inspect the network traffic the browser made).
 *
 * Requires FE at http://localhost:3000 talking to a local BE at
 * http://localhost:4000/api. See e2e/README.md for how to start both.
 */

const FORBIDDEN_MESSAGE = 'Update CDD hanya berlaku untuk aplikasi Individual';

const EMAIL = process.env.E2E_EMAIL || 'admin@example.com';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin123!';

// Individual-CDD-only endpoint the Step 2 bug used to hit: PATCH /applications/<id>
// (exact match — must not also catch /applications/<id>/parties or /<id>/submit).
const INDIVIDUAL_CDD_PATCH = /\/applications\/\d+$/;

function uniqueSuffix(): string {
  return Date.now().toString();
}

async function login(page: Page) {
  await page.goto('/login');
  // Login page labels are plain text siblings (no htmlFor/id), not associated
  // with their inputs — target by input type instead of getByLabel.
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

/** Wait for a <select>'s options to be populated from an async reference-list fetch. */
async function waitForOptionsLoaded(select: Locator) {
  await expect
    .poll(async () => select.locator('option').count(), { timeout: 10_000 })
    .toBeGreaterThan(1);
}

test.describe('KYB Business wizard — Step 2 no longer calls Individual CDD endpoint', () => {
  test('create Business/KYB app, add a party, Lanjut reaches Step 3 without PATCH /applications/:id', async ({ page }) => {
    const ts = uniqueSuffix();

    // ── Network watchdogs — active for the whole journey, not just around the click ──
    const individualCddPatchCalls: string[] = [];
    const forbiddenMessageHits: string[] = [];
    const failed400s: { url: string; body: string }[] = [];

    page.on('request', (req: Request) => {
      if (req.method() === 'PATCH' && INDIVIDUAL_CDD_PATCH.test(new URL(req.url()).pathname)) {
        individualCddPatchCalls.push(`${req.method()} ${req.url()}`);
      }
    });

    page.on('response', (res: Response) => {
      const url = res.url();
      if (!url.includes('/api/')) return;
      res
        .text()
        .then((body) => {
          if (body.includes(FORBIDDEN_MESSAGE)) {
            forbiddenMessageHits.push(`${res.request().method()} ${url} -> ${body}`);
          }
          if (res.status() === 400) {
            failed400s.push({ url: `${res.request().method()} ${url}`, body });
          }
        })
        .catch(() => {
          // Response body may not be readable (e.g. redirects) — irrelevant to this check.
        });
    });

    // 1–2. Login as a role allowed to create Business/KYB applications (ComplianceLead).
    await login(page);

    // 3. Navigate straight to the Business/KYB wizard.
    await page.goto('/applications/new?type=business');
    await expect(page.getByText('Input Data KYB')).toBeVisible();

    // 4–5. Step 1: Identitas — fill everything the backend's CreateBusinessDto requires.
    await page.getByLabel('Nama Badan Usaha').fill(`PW E2E Business ${ts}`);
    // Bentuk Badan Usaha left at its "PT" default → No. Akta Pendirian is required.
    // (Akta Perubahan Terakhir is a separate, optional field — left empty here.)
    await page.getByLabel('No. Akta Pendirian').fill(`AKTA-${ts}`);
    await page.getByLabel('Tanggal Pendirian').fill('2020-01-15');
    await page.getByLabel('Nomor Izin Usaha').fill(`NIB-${ts}`);
    await page.getByLabel('NPWP Badan Usaha').fill(ts.padEnd(15, '0').slice(0, 15));

    const bidangUsaha = page.getByLabel('Bidang Usaha');
    await waitForOptionsLoaded(bidangUsaha);
    await bidangUsaha.selectOption({ index: 1 });

    await page.getByLabel('Alamat Kedudukan').fill('Jl. Playwright Testing No. 1');

    const provinsi = page.getByLabel('Provinsi');
    await waitForOptionsLoaded(provinsi);
    await provinsi.selectOption({ index: 1 });

    const kota = page.getByLabel('Kota / Kabupaten');
    await waitForOptionsLoaded(kota);
    await kota.selectOption({ index: 1 });

    await page.getByLabel('Kode Pos').fill('12345');
    await page.getByLabel('Nomor Telepon Perusahaan').fill(`021${ts.slice(-8)}`);

    // Porsi Saham Direktur Utama/Komisaris now live on Step 2, not here.
    await expect(page.getByLabel('Porsi Saham Direktur Utama')).toHaveCount(0);
    await expect(page.getByLabel('Porsi Saham Komisaris')).toHaveCount(0);

    const businessCreateResponse = page.waitForResponse(
      (res) => res.url().includes('/applications/business') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
    const createRes = await businessCreateResponse;
    expect(createRes.status(), await createRes.text().catch(() => '')).toBe(201);

    // 7. Step 2: Pengurus & Pemegang Saham.
    await expect(page.getByText('Informasi Pengurus & Pemegang Saham')).toBeVisible();

    // 8. Add at least one required party (DIRECTOR/KTP defaults satisfy the wizard's
    // "at least one core party" gate on the Lanjut button).
    await page.getByRole('button', { name: '+ Tambah Pihak' }).click();
    await page.getByLabel('Nama', { exact: true }).fill(`Direktur Test ${ts}`);
    await page.getByLabel('Nomor Identitas').fill(ts.slice(-16));

    const addPartyResponse = page.waitForResponse(
      (res) => res.url().includes('/parties') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    const addRes = await addPartyResponse;
    expect(addRes.status(), await addRes.text().catch(() => '')).toBe(201);

    // 4/5. Party list remains visible and reflects the addition.
    const partyRow = page.getByRole('row', { name: new RegExp(`Direktur Test ${ts}`) });
    await expect(partyRow).toBeVisible();

    // 13. Exercise delete too, then re-add — proves both add/delete endpoints still
    // work, and leaves the wizard with a party so Lanjut stays enabled.
    const deleteResponse = page.waitForResponse(
      (res) => res.url().includes('/parties/') && res.request().method() === 'DELETE',
    );
    await partyRow.getByRole('button', { name: 'Hapus' }).click();
    const delRes = await deleteResponse;
    expect(delRes.status(), await delRes.text().catch(() => '')).toBe(200);
    await expect(partyRow).toHaveCount(0);

    await page.getByRole('button', { name: '+ Tambah Pihak' }).click();
    await page.getByLabel('Nama', { exact: true }).fill(`Direktur Test ${ts}`);
    await page.getByLabel('Nomor Identitas').fill(ts.slice(-16));
    const readdResponse = page.waitForResponse(
      (res) => res.url().includes('/parties') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    await readdResponse;
    await expect(page.getByRole('row', { name: new RegExp(`Direktur Test ${ts}`) })).toBeVisible();

    // ── Edit pihak — baris yang sama di-PATCH, bukan dihapus lalu dibuat ulang ──
    const directorRow = page.getByRole('row', { name: new RegExp(`Direktur Test ${ts}`) });
    await expect(directorRow.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(directorRow.getByRole('button', { name: 'Hapus' })).toBeVisible();

    await directorRow.getByRole('button', { name: 'Edit' }).click();
    // Form Edit terisi nilai party yang ada.
    await expect(page.getByText('Edit Pihak')).toBeVisible();
    await expect(page.getByLabel('Nama', { exact: true })).toHaveValue(`Direktur Test ${ts}`);
    await expect(page.getByLabel('Nomor Identitas')).toHaveValue(ts.slice(-16));

    await page.getByLabel('Nama', { exact: true }).fill(`Direktur Edited ${ts}`);
    const editResponse = page.waitForResponse(
      (res) => /\/parties\/\d+$/.test(new URL(res.url()).pathname) && res.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Perubahan' }).click();
    const editRes = await editResponse;
    expect(editRes.status(), await editRes.text().catch(() => '')).toBe(200);

    // Baris ter-update, dan tidak ada duplikat baris lama.
    await expect(page.getByRole('row', { name: new RegExp(`Direktur Edited ${ts}`) })).toHaveCount(1);
    await expect(page.getByRole('row', { name: new RegExp(`Direktur Test ${ts}`) })).toHaveCount(0);

    // ── Porsi saham dinamis: hanya peran yang ada yang punya field ─────────────
    // Saat ini cuma ada Direktur → field Komisaris tidak boleh dirender.
    await expect(page.getByText('Porsi Saham Pengurus Utama')).toBeVisible();
    const directorShare = page.getByLabel('Porsi Saham Direktur Utama');
    await expect(directorShare).toBeVisible();
    await expect(page.getByLabel('Porsi Saham Komisaris')).toHaveCount(0);

    // Tambah Komisaris → field porsi saham Komisaris muncul otomatis.
    await page.getByRole('button', { name: '+ Tambah Pihak' }).click();
    await page.getByLabel('Peran').selectOption('COMMISSIONER');
    await page.getByLabel('Nama', { exact: true }).fill(`Komisaris Test ${ts}`);
    await page.getByLabel('Nomor Identitas').fill(`9${ts}`.slice(-16));
    const addCommissionerResponse = page.waitForResponse(
      (res) => res.url().includes('/parties') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    expect((await addCommissionerResponse).status()).toBe(201);

    const commissionerShare = page.getByLabel('Porsi Saham Komisaris');
    await expect(commissionerShare).toBeVisible();

    // Porsi Saham Direktur Utama/Komisaris now live under Step 2's "Pengurus &
    // Pemegang Saham" and save via PATCH /applications/:id/business — never
    // the Individual-only PATCH /applications/:id endpoint this spec guards against.
    await directorShare.fill('60');
    await commissionerShare.fill('40');

    const saveSharesRequest = page.waitForRequest(
      (req) => /\/applications\/\d+\/business$/.test(new URL(req.url()).pathname) && req.method() === 'PATCH',
    );
    const saveSharesResponse = page.waitForResponse(
      (res) => /\/applications\/\d+\/business$/.test(new URL(res.url()).pathname) && res.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Porsi Saham' }).click();
    const sharesReq = await saveSharesRequest;
    expect(sharesReq.postDataJSON()).toMatchObject({
      director_share_percentage: 60,
      commissioner_share_percentage: 40,
    });
    const sharesRes = await saveSharesResponse;
    expect(sharesRes.status(), await sharesRes.text().catch(() => '')).toBe(200);

    // Hapus Komisaris → field porsi saham Komisaris ikut hilang.
    const commissionerRow = page.getByRole('row', { name: new RegExp(`Komisaris Test ${ts}`) });
    const deleteCommissionerResponse = page.waitForResponse(
      (res) => res.url().includes('/parties/') && res.request().method() === 'DELETE',
    );
    await commissionerRow.getByRole('button', { name: 'Hapus' }).click();
    expect((await deleteCommissionerResponse).status()).toBe(200);
    await expect(commissionerRow).toHaveCount(0);
    await expect(page.getByLabel('Porsi Saham Komisaris')).toHaveCount(0);
    await expect(directorShare).toBeVisible();

    // Tabel & tombol aksi tetap terbaca di viewport sempit (mobile).
    const editedRow = page.getByRole('row', { name: new RegExp(`Direktur Edited ${ts}`) });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(editedRow.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(editedRow.getByRole('button', { name: 'Hapus' })).toBeVisible();
    // Halaman tidak boleh ikut scroll horizontal — tabel yang scroll sendiri.
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
    ).toBe(true);
    await page.setViewportSize({ width: 1280, height: 800 });

    // 9–10. Click "Lanjut" — this is the exact action that used to fire the broken
    // Individual CDD PATCH. It must now be a pure client-side step transition.
    const lanjutButton = page.getByRole('button', { name: 'Lanjut', exact: true });
    await expect(lanjutButton).toBeEnabled();
    await lanjutButton.click();

    await expect(page.getByText('Dokumen Wajib')).toBeVisible();

    // Give any stray in-flight response handlers a tick to resolve before asserting.
    await page.waitForTimeout(250);

    // 11. No response anywhere in the journey carried the Individual-only CDD message.
    expect(forbiddenMessageHits, forbiddenMessageHits.join('\n')).toHaveLength(0);

    // 12. The browser never called PATCH /applications/:id from Step 2 (or anywhere else).
    expect(individualCddPatchCalls, individualCddPatchCalls.join('\n')).toHaveLength(0);

    // No unexpected 400s at all during the journey (party add/delete + business
    // create were already asserted 2xx above; this is the overall safety net).
    expect(failed400s, JSON.stringify(failed400s, null, 2)).toHaveLength(0);
  });
});
