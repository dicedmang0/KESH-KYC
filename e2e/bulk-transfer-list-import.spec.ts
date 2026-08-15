import { test, expect, type Page, type Browser } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * FE-to-BE E2E: Single/Bulk transfer list separation, bulk batch detail, and
 * the Bulk Transfer Excel template/import flow.
 *
 * The tested WORKFLOW (open transfers list → default Single tab → switch to
 * Bulk tab → open bulk form → download template → import a generated XLSX →
 * submit → open the resulting batch in the list → open batch detail → open
 * child transfer detail) is driven
 * entirely through the real frontend (clicks/forms/file input). Direct
 * backend calls are used only for test-data setup (see "SETUP" below) —
 * never to create/approve KYC/KYB applications, which this spec must not touch.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const ROLE_PASSWORD = 'Test@12345';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Excel fixture builder ──────────────────────────────────────────────────
// Deliberately builds an OLD-style template that still carries a value in B4
// ("No. Referensi Bulk"). The current KESH template no longer has that cell,
// and the importer must ignore it — the backend owns the reference now.

type ImportFixtureRow = {
  beneficiaryAccountName: string;
  beneficiaryBank: string;
  beneficiaryAccount: string;
  amount: number;
  transaction_purpose: string;
  beneficiary_relationship_to_sender: string;
  beneficiary_mobile_number: string;
};

function buildImportFixtureFile(bulkReferenceNo: string, rows: ImportFixtureRow[]): string {
  const aoa: (string | number)[][] = [];
  aoa[0] = ['KESH - Template Bulk Transfer'];
  aoa[3] = ['No. Referensi Bulk', bulkReferenceNo];
  aoa[7] = [
    'No', 'beneficiaryAccountName', 'beneficiaryBank', 'beneficiaryAccount',
    'amount', 'transaction_purpose', 'beneficiary_relationship_to_sender',
    'No. Handphone Penerima', 'notes',
  ];
  rows.forEach((r, i) => {
    aoa[8 + i] = [
      i + 1, r.beneficiaryAccountName, r.beneficiaryBank, r.beneficiaryAccount,
      r.amount, r.transaction_purpose, r.beneficiary_relationship_to_sender,
      r.beneficiary_mobile_number, '',
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bulk Transfer');
  const filePath = path.join(os.tmpdir(), `e2e-bulk-import-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
  XLSX.writeFile(wb, filePath);
  return filePath;
}

// ── Setup-only backend calls (not the tested workflow) ──────────────────────

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    throw new Error(`setup: login failed for ${email}: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

type ApprovedSender = { applicationId: string; displayName: string };

/** Reuse an existing local APPROVED application — this spec never creates/approves KYC/KYB data. */
async function resolveApprovedSender(sysAdminToken: string): Promise<ApprovedSender> {
  const headers = { Authorization: `Bearer ${sysAdminToken}` };
  const res = await fetch(`${API_BASE_URL}/applications?status=APPROVED&limit=25`, { headers });
  if (!res.ok) {
    throw new Error(`setup: failed listing approved applications: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  const apps: Array<{ id: string; display_name: string }> = body.data ?? (Array.isArray(body) ? body : []);
  const found = apps.find((a) => a.display_name);
  if (!found) {
    throw new Error(
      'setup: no APPROVED application with a display_name exists locally. Seed one before running this spec — see e2e/README.md.',
    );
  }
  return { applicationId: String(found.id), displayName: found.display_name };
}

// ── FE-driven helpers ────────────────────────────────────────────────────────

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

// ── Network guards ───────────────────────────────────────────────────────────

type NetworkGuards = {
  devtunnelHits: string[];
  nonLocalApiHits: string[];
  failedApiResponses: { url: string; status: number; body: string }[];
};

function attachNetworkGuards(page: Page): NetworkGuards {
  const guards: NetworkGuards = { devtunnelHits: [], nonLocalApiHits: [], failedApiResponses: [] };

  page.on('request', (req) => {
    const url = req.url();
    if (/devtunnels\.ms/i.test(url)) guards.devtunnelHits.push(`${req.method()} ${url}`);

    let pathname = '';
    try { pathname = new URL(url).pathname; } catch { /* ignore */ }
    if (pathname.includes('/api/')) {
      let hostname = '';
      try { hostname = new URL(url).hostname; } catch { /* ignore */ }
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        guards.nonLocalApiHits.push(`${req.method()} ${url}`);
      }
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const status = res.status();
    if (status >= 400) {
      res.text()
        .then((body) => {
          guards.failedApiResponses.push({ url: `${res.request().method()} ${url}`, status, body });
          console.log(`[e2e] failed API response: ${res.request().method()} ${url} -> ${status}\n${body}`);
        })
        .catch(() => { /* body unreadable — irrelevant to this check */ });
    }
  });

  return guards;
}

async function assertNoNetworkViolations(page: Page, guards: NetworkGuards, allowedStatuses: number[] = []) {
  await page.waitForTimeout(250);
  expect(guards.devtunnelHits, `Requests hit a devtunnel host:\n${guards.devtunnelHits.join('\n')}`).toHaveLength(0);
  expect(
    guards.nonLocalApiHits,
    `API requests did not target localhost:\n${guards.nonLocalApiHits.join('\n')}`,
  ).toHaveLength(0);
  const unexpected = guards.failedApiResponses.filter((f) => !allowedStatuses.includes(f.status));
  expect(unexpected, `Unexpected failed API responses:\n${JSON.stringify(unexpected, null, 2)}`).toHaveLength(0);
}

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe('Transfer list split + Bulk Excel import — FE-to-BE', () => {
  let ts: string;
  let sender: ApprovedSender;
  let frontDesk: { email: string; password: string };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();

    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    sender = await resolveApprovedSender(sysAdminToken);

    frontDesk = { email: `e2e.fd.bulklist.${ts}@test.local`, password: ROLE_PASSWORD };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await createFrontDeskViaFE(page, { email: frontDesk.email, fullName: `E2E FrontDesk BulkList ${ts}` });
    await page.close();
  });

  test('Single/Bulk tabs, batch detail, template download, Excel import+submit, generated batch reference', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    const bulkReferenceNo = `BULK-E2E-IMPORT-${ts}`;

    // 1. Login as FrontDesk.
    await login(page, frontDesk.email, frontDesk.password);

    // ── 1. Single tab uses transfer_mode=single ─────────────────────────────
    const singleReqPromise = page.waitForRequest((req) => {
      if (req.method() !== 'GET') return false;
      let p = '';
      try { p = new URL(req.url()).pathname; } catch { return false; }
      return /\/api\/transfers$/.test(p);
    });
    await page.goto('/transfers');
    const singleReq = await singleReqPromise;
    expect(singleReq.url()).toContain('transfer_mode=single');
    await expect(page.getByRole('tab', { name: 'Single Transfer', exact: true })).toHaveAttribute('aria-selected', 'true');

    // ── Create a bulk batch via the Excel import flow ───────────────────────
    await page.goto('/transfers/bulk');
    await page.getByPlaceholder('Cari nama atau CIF pengirim…').fill(sender.displayName);
    await page.getByRole('button', { name: new RegExp(escapeRegExp(sender.displayName)) }).click();

    // ── 4. Download template button exists and produces a real file ────────
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download Template' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('kesh-bulk-transfer-template.xlsx');

    // Tanggal transaksi diisi backend saat pengajuan — template tidak boleh memintanya.
    const templatePath = path.join(os.tmpdir(), `kesh-template-${ts}.xlsx`);
    await download.saveAs(templatePath);
    const templateAoa = XLSX.utils.sheet_to_json<unknown[]>(
      XLSX.readFile(templatePath).Sheets['Bulk Transfer'],
      { header: 1, defval: '' },
    );
    const templateHeaders = templateAoa[7];
    expect(templateHeaders?.join(',')).not.toContain('transaction_date');
    // No. Referensi Bulk dibuat backend — template tidak boleh memintanya lagi,
    // termasuk sel metadata B4 tempatnya dulu berada.
    expect(String(templateAoa[3]?.[0] ?? '')).not.toBe('No. Referensi Bulk');
    expect(JSON.stringify(templateAoa)).not.toContain('Isi "No. Referensi Bulk"');
    fs.unlinkSync(templatePath);

    // ── 5. Import valid XLSX fills the bulk rows ────────────────────────────
    // B4 in the fixture still holds a legacy reference; importing must ignore it.
    const fixturePath = buildImportFixtureFile(bulkReferenceNo, [
      {
        beneficiaryAccountName: `E2E Import A ${ts}`,
        beneficiaryBank: 'BCA',
        beneficiaryAccount: '1234567890',
        amount: 150000,
        transaction_purpose: 'Pembayaran vendor import 1',
        beneficiary_relationship_to_sender: 'Lainnya',
        beneficiary_mobile_number: '081200005551',
      },
      {
        beneficiaryAccountName: `E2E Import B ${ts}`,
        beneficiaryBank: 'BCA',
        beneficiaryAccount: '1234567891',
        amount: 175000,
        transaction_purpose: 'Pembayaran vendor import 2',
        beneficiary_relationship_to_sender: 'Lainnya',
        beneficiary_mobile_number: '081200005552',
      },
    ]);
    await page.getByLabel('Import Excel').setInputFiles(fixturePath);

    await expect(page.getByText('2 baris berhasil diimpor.')).toBeVisible();
    // The manual reference input is gone, so B4 has nowhere to land.
    await expect(page.locator('#bulk-reference-no')).toHaveCount(0);
    await expect(page.locator('#row-account-name-0')).toHaveValue(`E2E Import A ${ts}`);
    await expect(page.locator('#row-account-name-1')).toHaveValue(`E2E Import B ${ts}`);
    // Rekening debit BRI & nama pengirim tidak ikut template import KESH —
    // keduanya data level batch, diisi di form.
    await page.locator('#qlola-debit-account').fill('020601000001301');
    await page.locator('#qlola-sender-name').fill('PT KESH E2E');

    // ── 6. Submit imported rows successfully ────────────────────────────────
    const bulkPostResponse = page.waitForResponse(
      (res) => res.url().includes('/transfers/bulk') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Buat 2 Transfer$/ }).click();
    const bulkRes = await bulkPostResponse;
    expect(bulkRes.ok(), await bulkRes.text().catch(() => '')).toBeTruthy();

    const reqBody = bulkRes.request().postDataJSON() as { items: unknown[] };
    // The legacy B4 value must NOT be sent, let alone become authoritative.
    expect(Object.keys(reqBody), JSON.stringify(reqBody)).not.toContain('bulk_reference_no');
    expect(reqBody.items).toHaveLength(2);

    const respBody = (await bulkRes.json()) as { batch_no: string; bulk_reference_no: string; total_count: number };
    expect(respBody.total_count).toBe(2);
    await expect(page.getByRole('heading', { name: 'Bulk Transfer Berhasil' })).toBeVisible();

    // ── 2. Bulk tab calls /transfers/bulk-batches and shows one row per batch ──
    await page.getByRole('button', { name: 'Ke Daftar Transfer' }).click();
    await page.waitForURL('**/transfers');

    const bulkBatchesReqPromise = page.waitForResponse(
      (res) => res.url().includes('/transfers/bulk-batches') && res.request().method() === 'GET',
    );
    await page.getByRole('tab', { name: 'Bulk Transfer' }).click();
    const bulkBatchesRes = await bulkBatchesReqPromise;
    expect(bulkBatchesRes.ok(), await bulkBatchesRes.text().catch(() => '')).toBeTruthy();
    // Bump page size so the newly created batch isn't pushed off page 1 by
    // pre-existing local data (only the Pagination page-size <select> renders
    // on this tab — the status filter <select> is Single-tab only).
    await page.locator('select').first().selectOption('100');

    const tableContainer = page.locator('div.rounded-2xl.border.overflow-x-auto');
    const batchRow = tableContainer.locator('div.border-t').filter({ hasText: respBody.bulk_reference_no });
    // One row for the whole batch, not one row per item (2 items, still 1 row).
    await expect(batchRow).toHaveCount(1);
    await expect(batchRow.getByText(respBody.batch_no)).toBeVisible();
    // Column order: Batch No, No. Referensi Bulk, Sender, Total Item, Total
    // Nominal, Status Summary, Dibuat Pada, Aksi — index 3 is Total Item.
    await expect(batchRow.locator('> div').nth(3)).toHaveText('2');

    // ── 3. Bulk batch detail opens and shows child transfers ───────────────
    await batchRow.getByRole('link', { name: 'Detail' }).click();
    await page.waitForURL(/\/transfers\/bulk-batches\/[^/]+$/);
    // batch_no also appears in the <h1> ("Bulk Batch <batch_no>") — scope to
    // the summary Field's value div specifically to avoid a strict-mode clash.
    const fieldValue = page.getByTestId('batch-field-value');
    await expect(fieldValue.filter({ hasText: respBody.batch_no })).toBeVisible();
    await expect(fieldValue.filter({ hasText: respBody.bulk_reference_no })).toBeVisible();
    await expect(page.getByText(`E2E Import A ${ts}`)).toBeVisible();
    await expect(page.getByText(`E2E Import B ${ts}`)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Detail' })).toHaveCount(2);

    // ── 7. Nomor referensi batch dibuat backend, bukan dari B4 template ───
    // Nilai warisan di B4 template lama tidak boleh menjadi referensi batch.
    expect(respBody.bulk_reference_no).toMatch(/^BLK-[A-HJ-NP-Z2-9]{8}$/);
    expect(respBody.bulk_reference_no).not.toBe(bulkReferenceNo);

    fs.unlinkSync(fixturePath);
    await assertNoNetworkViolations(page, guards);
  });
});
