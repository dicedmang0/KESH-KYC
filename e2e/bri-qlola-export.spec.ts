import { test, expect, type Page } from '@playwright/test';
import * as XLSX from 'xlsx';

/**
 * FE-to-BE E2E: unduh file BRI Qlola dari detail bulk batch.
 *
 * Peran BRI Qlola: FrontDesk = Maker (mengunduh & mengunggah file MAKER),
 * FinanceStaff = Checker (mengecek lewat POST /transfers/:id/finance-review,
 * TIDAK lewat file ini), FinanceManager = Approver (approval final, juga
 * tidak lewat file ini). FinanceStaff/FinanceManager tetap mengunduh file
 * FINAL/arsip seperti sebelumnya — itu tidak berubah oleh koreksi ini.
 *
 * Alur yang diuji lewat UI sungguhan: buka detail batch → tombol
 * "Download BRI Qlola" (Maker, FrontDesk) atau "Download Arsip Qlola"
 * (FINAL, FinanceStaff/FinanceManager) → unduhan .xlsx, plus pesan "Belum
 * siap diekspor" saat data belum lengkap, dan tombol yang tidak muncul untuk
 * role tanpa hak pada purpose tersebut.
 *
 * Panggilan backend langsung HANYA untuk setup (membuat batch & menjalankan
 * rantai approval) — bukan alur yang diuji.
 *
 * Butuh FE + BE jalan lokal — lihat e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const QLOLA_DEBIT_ACCOUNT = '020601000001301';
const QLOLA_SENDER_NAME = 'PT KESH E2E';

/** Header kolom A:AJ sheet "Transaction Records" — urutan asli workbook BRI. */
const QLOLA_HEADERS = [
  'No', 'CustRefNo', 'InstructionCode', 'ValueDate', 'Debit Account', 'Sender Name',
  'BenBankIdentifier', 'Credit Account', 'Beneficiary Name', 'Beneficiary Address',
  'Amount', 'Currency', 'TrxRemark', 'Notification', 'Charge Type', 'FxCode',
  'Rate Voucher Code', 'Sender Address', 'Ben Mobile Number', 'Sender Country Code',
  'Beneficiary Country Code', 'BenBankName', 'BenBankAddress', 'BenBankCountryCode',
  'InterBankIdentifier', 'InterBankName', 'InterBankAddress', 'InterBankCountryCode',
  'Beneficiary Category', 'Beneficiary Relation', 'BI Transaction Code', 'Simodis Info',
  'Enrichment Details 1', 'Enrichment Details 2', 'Enrichment Details 3', 'Enrichment Details 4',
];

// ── Setup-only backend calls ────────────────────────────────────────────────

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`setup: login failed: ${res.status}`);
  return (await res.json()).access_token;
}

async function apiToken(): Promise<string> {
  return apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
}

async function api(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`setup: ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}

/** Pakai application APPROVED yang sudah ada — spec ini tidak membuat KYC/KYB. */
async function resolveApprovedSenderId(token: string): Promise<string> {
  const body = await api(token, '/applications?status=APPROVED&limit=25');
  const apps: Array<{ id: string; display_name?: string }> = body.data ?? body;
  const found = apps.find((a) => a.display_name);
  if (!found) throw new Error('setup: no APPROVED application exists locally.');
  return String(found.id);
}

type Batch = { batchId: string; children: Array<{ id: string; partner_reference_no: string }> };

async function createBatch(
  token: string,
  senderId: string,
  items: Array<Record<string, unknown>>,
): Promise<Batch> {
  const res = await api(token, '/transfers/bulk', {
    method: 'POST',
    body: JSON.stringify({
      sender_application_id: Number(senderId),
      bulk_reference_no: `E2E-QLOLA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      qlola_debit_account: QLOLA_DEBIT_ACCOUNT,
      qlola_sender_name: QLOLA_SENDER_NAME,
      items,
    }),
  });
  return { batchId: String(res.batch_id), children: res.transfers };
}

function item(extra: Record<string, unknown> = {}) {
  return {
    amount: 150_000,
    beneficiaryBankName: 'Bank Central Asia',
    beneficiaryBankCode: 'BCA',
    beneficiaryAccountNumber: '1234567890',
    beneficiaryAccountName: 'E2E Qlola Penerima',
    beneficiary_relationship_to_sender: 'Lainnya',
    transaction_purpose: 'Pembayaran vendor Qlola',
    beneficiary_mobile_number: '081200009999',
    ...extra,
  };
}

const FRONTDESK_PASSWORD = 'Test@12345';

/**
 * FrontDesk untuk menguji role tanpa hak unduh. Email tetap supaya dipakai
 * ulang antar-run; backend menolak email duplikat dengan "Email already exists"
 * — itu berarti user-nya sudah ada, bukan kegagalan setup.
 */
async function ensureFrontDesk(sysAdminToken: string) {
  const email = 'e2e-qlola-frontdesk@test.local';
  const res = await fetch(`${API_BASE_URL}/users/admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sysAdminToken}` },
    body: JSON.stringify({
      email,
      fullName: 'E2E Qlola FrontDesk',
      role: 'FrontDesk',
      password: FRONTDESK_PASSWORD,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (!/already exists/i.test(text)) {
      throw new Error(`setup: create FrontDesk → ${res.status} ${text}`);
    }
  }
  return { email, password: FRONTDESK_PASSWORD };
}

/** SystemAdmin punya full access → boleh memutus langsung dari SUBMITTED. */
async function approveChild(token: string, id: string) {
  await api(token, `/transfers/${id}/submit`, { method: 'POST' });
  return api(token, `/transfers/${id}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: 'APPROVE' }),
  });
}

/**
 * Bawa transfer anak sampai PENDING_FINANCE_STAFF_REVIEW — populasi export
 * REVIEW. Berhenti tepat sebelum Finance Staff memutuskan.
 */
async function toFinanceStaffReview(token: string, id: string) {
  await api(token, `/transfers/${id}/submit`, { method: 'POST' });
  const res = await api(token, `/transfers/${id}/supervisor-review`, {
    method: 'POST',
    body: JSON.stringify({ action: 'APPROVE', notes: 'ok' }),
  });
  if (res.status !== 'PENDING_FINANCE_STAFF_REVIEW') {
    throw new Error(`setup: expected PENDING_FINANCE_STAFF_REVIEW, got ${res.status}`);
  }
  return res;
}

const FINANCE_STAFF_PASSWORD = 'Test@12345';

/** FinanceStaff untuk menguji jalur review. Email tetap, dipakai ulang antar-run. */
async function ensureFinanceStaff(sysAdminToken: string) {
  const email = 'e2e-qlola-financestaff@test.local';
  const res = await fetch(`${API_BASE_URL}/users/admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sysAdminToken}` },
    body: JSON.stringify({
      email,
      fullName: 'E2E Qlola Finance Staff',
      role: 'FinanceStaff',
      password: FINANCE_STAFF_PASSWORD,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (!/already exists/i.test(text)) {
      throw new Error(`setup: create FinanceStaff → ${res.status} ${text}`);
    }
  }
  return { email, password: FINANCE_STAFF_PASSWORD };
}

const FINANCE_MANAGER_PASSWORD = 'Test@12345';

/** FinanceManager (Approver Qlola) — dipakai untuk memastikan mereka tidak melihat tombol Maker. */
async function ensureFinanceManager(sysAdminToken: string) {
  const email = 'e2e-qlola-financemanager@test.local';
  const res = await fetch(`${API_BASE_URL}/users/admins`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sysAdminToken}` },
    body: JSON.stringify({
      email,
      fullName: 'E2E Qlola Finance Manager',
      role: 'FinanceManager',
      password: FINANCE_MANAGER_PASSWORD,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    if (!/already exists/i.test(text)) {
      throw new Error(`setup: create FinanceManager → ${res.status} ${text}`);
    }
  }
  return { email, password: FINANCE_MANAGER_PASSWORD };
}

// ── FE helpers ──────────────────────────────────────────────────────────────

async function login(page: Page, email = SYSADMIN_EMAIL, password = SYSADMIN_PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

test.describe.configure({ mode: 'serial' });

test.describe('Export BRI Qlola dari bulk batch', () => {
  let token: string;
  let senderId: string;

  test.beforeAll(async () => {
    token = await apiToken();
    senderId = await resolveApprovedSenderId(token);
  });

  test('batch final: tombol tampil dan unduhan menghasilkan .xlsx sesuai struktur BRI', async ({ page }) => {
    const { batchId, children } = await createBatch(token, senderId, [item()]);
    const approved = await approveChild(token, children[0].id);

    await login(page);
    await page.goto(`/transfers/bulk-batches/${batchId}`);

    // Data level batch tampil di ringkasan.
    await expect(page.getByText(QLOLA_DEBIT_ACCOUNT)).toBeVisible();
    await expect(page.getByText(QLOLA_SENDER_NAME)).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('download-qlola-final').click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/^BRI_QLOLA_BIF_.+_\d{12}\.xlsx$/);

    const filePath = await download.path();
    const wb = XLSX.readFile(filePath!);
    expect(wb.SheetNames).toEqual(['Transaction Records']);

    const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Transaction Records'], {
      header: 1,
      defval: '',
      blankrows: true,
    });
    // Legenda baris 1-6, baris 7 kosong, header baris 8, data baris 9.
    expect(aoa[3][1]).toBe('Mandatory Field for BI-Fast');
    expect(aoa[7]).toEqual(QLOLA_HEADERS);
    const row = aoa[8];
    expect(row[0]).toBe(1);
    expect(row[1]).toBe(approved.partner_reference_no);
    expect(row[2]).toBe('BIF');
    expect(row[4]).toBe(QLOLA_DEBIT_ACCOUNT);
    expect(row[5]).toBe(QLOLA_SENDER_NAME);
    expect(row[11]).toBe('IDR');
    expect(row[14]).toBe('OUR');
    expect(String(row[18])).toBe('081200009999');
  });

  test('batch tanpa populasi layak: tidak ada tombol unduh sama sekali', async ({ page }) => {
    // Semua baris masih DRAFT — bukan populasi REVIEW maupun FINAL, jadi tidak
    // ada tombol yang boleh muncul (daripada tombol yang pasti gagal diklik).
    const draftOnly = await createBatch(token, senderId, [item()]);

    await login(page);
    await page.goto(`/transfers/bulk-batches/${draftOnly.batchId}`);
    await expect(page.getByTestId('batch-child-row')).toHaveCount(1);
    await expect(page.getByTestId('download-qlola-final')).toHaveCount(0);
    await expect(page.getByTestId('download-qlola-maker')).toHaveCount(0);
    await expect(page.getByTestId('qlola-blockers')).toHaveCount(0);
  });

  test('data belum lengkap: panel "Belum siap diekspor" dengan field yang kurang', async ({ page }) => {
    // Baris final, tapi tanpa BIC bank tujuan → export harus diblokir dan
    // alasannya ditampilkan, bukan menghasilkan file yang tidak sah.
    const { batchId, children } = await createBatch(token, senderId, [
      item({
        beneficiaryAccountName: 'E2E Qlola Tanpa BIC',
        beneficiaryBankCode: 'NEOBANK',
        beneficiaryBankName: 'Bank Neo Commerce (neobank)',
      }),
    ]);
    const approved = await approveChild(token, children[0].id);

    await login(page);
    await page.goto(`/transfers/bulk-batches/${batchId}`);
    await page.getByTestId('download-qlola-final').click();

    const blockers = page.getByTestId('qlola-blockers');
    await expect(blockers).toBeVisible();
    await expect(blockers).toContainText('Belum siap diekspor ke BRI Qlola');
    await expect(blockers).toContainText(approved.partner_reference_no);
    await expect(blockers).toContainText('Bank Neo Commerce (neobank)');
    await expect(blockers).toContainText('BenBankIdentifier tidak tersedia');
  });

  test('FrontDesk (Maker): tombol Download BRI Qlola, ?purpose=MAKER, dan aksi Review per baris', async ({ page }) => {
    // GET bulk-batches/:id membatasi FrontDesk hanya ke batch yang dia buat
    // sendiri (lihat TransfersService.getBulkBatchById) — jadi batch di test
    // ini harus dibuat pakai token FrontDesk itu sendiri, bukan token sysadmin.
    const frontDesk = await ensureFrontDesk(token);
    const frontDeskToken = await apiLogin(frontDesk.email, frontDesk.password);

    const { batchId, children } = await createBatch(frontDeskToken, senderId, [
      item({ beneficiaryAccountName: 'E2E Qlola Maker' }),
    ]);
    // Lanjutkan rantai approval pakai token sysadmin (full-access bypass) —
    // submit/supervisor-review tidak dibatasi kepemilikan seperti detail batch.
    await toFinanceStaffReview(token, children[0].id);

    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/transfers/bulk-batches/${batchId}`);

    // Hitungan + helper text jalur Maker — bukan lagi "untuk review Finance Staff".
    await expect(page.getByText('1 transaksi siap dibuat di Qlola')).toBeVisible();
    await expect(
      page.getByText('File digunakan Frontline sebagai Maker untuk upload transaksi ke BRI Qlola.'),
    ).toBeVisible();
    // Tidak ada baris final, jadi tombol arsip tidak muncul untuk FrontDesk.
    await expect(page.getByTestId('download-qlola-final')).toHaveCount(0);

    // Unduhan memakai ?purpose=MAKER dan menghasilkan file bertanda MAKER.
    const [request, download] = await Promise.all([
      page.waitForRequest((r) => r.url().includes('/exports/bri-qlola')),
      page.waitForEvent('download'),
      page.getByTestId('download-qlola-maker').click(),
    ]);
    expect(request.url()).toContain('purpose=MAKER');
    expect(download.suggestedFilename()).toMatch(/^BRI_QLOLA_MAKER_.+_\d{12}\.xlsx$/);

    // FrontDesk melihat baris anak, tapi bukan aksi approval Finance Staff.
    const actionCell = page.getByTestId('child-action-cell').first();
    await expect(actionCell.getByRole('link', { name: 'Review' })).toBeVisible();
    await actionCell.getByRole('link', { name: 'Review' }).click();
    await page.waitForURL(/\/transfers\/\d+$/);
    await expect(page.getByRole('button', { name: 'Review Finance Staff' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kembalikan Transaksi' })).toHaveCount(0);
  });

  test('FinanceStaff: tidak melihat tombol Maker, tetap punya Review Finance Staff / Kembalikan Transaksi', async ({ page }) => {
    const { batchId, children } = await createBatch(token, senderId, [
      item({ beneficiaryAccountName: 'E2E Qlola Checker' }),
    ]);
    await toFinanceStaffReview(token, children[0].id);
    const financeStaff = await ensureFinanceStaff(token);

    await login(page, financeStaff.email, financeStaff.password);
    await page.goto(`/transfers/bulk-batches/${batchId}`);

    // FinanceStaff adalah Checker, bukan Maker — tombol Maker tidak boleh tampil.
    await expect(page.getByTestId('download-qlola-maker')).toHaveCount(0);
    await expect(page.getByText('File digunakan Frontline sebagai Maker')).toHaveCount(0);

    const actionCell = page.getByTestId('child-action-cell').first();
    await actionCell.getByRole('link', { name: 'Review' }).click();
    await page.waitForURL(/\/transfers\/\d+$/);
    await expect(page.getByRole('button', { name: 'Review Finance Staff' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kembalikan Transaksi' })).toBeVisible();
  });

  test('FinanceManager: tidak melihat tombol Maker', async ({ page }) => {
    const { batchId, children } = await createBatch(token, senderId, [
      item({ beneficiaryAccountName: 'E2E Qlola Approver' }),
    ]);
    await toFinanceStaffReview(token, children[0].id);
    const financeManager = await ensureFinanceManager(token);

    await login(page, financeManager.email, financeManager.password);
    await page.goto(`/transfers/bulk-batches/${batchId}`);
    await expect(page.getByTestId('download-qlola-maker')).toHaveCount(0);
  });

  test('batch campuran (SystemAdmin, akses penuh) menampilkan dua tombol terpisah', async ({ page }) => {
    const { batchId, children } = await createBatch(token, senderId, [
      item({ beneficiaryAccountName: 'E2E Mixed Maker' }),
      item({ beneficiaryAccountName: 'E2E Mixed Final' }),
    ]);
    await toFinanceStaffReview(token, children[0].id);
    await approveChild(token, children[1].id);

    await login(page);
    await page.goto(`/transfers/bulk-batches/${batchId}`);

    await expect(page.getByTestId('download-qlola-maker')).toBeVisible();
    await expect(page.getByTestId('download-qlola-final')).toBeVisible();
    await expect(page.getByText('1 transaksi siap dibuat di Qlola')).toBeVisible();
    await expect(page.getByText('1 transaksi sudah final')).toBeVisible();
  });

  test('Ringkasan Batch: label Indonesia, tanpa enum mentah dan tanpa hitungan nol', async ({ page }) => {
    const { batchId, children } = await createBatch(token, senderId, [
      item({ beneficiaryAccountName: 'E2E Status Review' }),
      item({ beneficiaryAccountName: 'E2E Status Draft' }),
    ]);
    await toFinanceStaffReview(token, children[0].id);
    // children[1] dibiarkan DRAFT.

    await login(page);
    await page.goto(`/transfers/bulk-batches/${batchId}`);

    const summary = page.getByTestId('batch-status-summary');
    await expect(summary).toBeVisible();
    await expect(summary).toContainText('Menunggu Review Finance Staff: 1');
    await expect(summary).toContainText('Draft: 1');

    // Enum mentah tidak boleh bocor ke layar, dan status berjumlah 0 disembunyikan.
    const summaryText = (await summary.innerText()).toUpperCase();
    for (const raw of [
      'PENDING_FINANCE_STAFF_REVIEW',
      'PENDING_FINANCE_MANAGER_APPROVAL',
      'PENDING_COMPLIANCE_REVIEW',
      'SUBMITTED',
      'COMPLETED',
      'REJECTED',
    ]) {
      expect(summaryText).not.toContain(raw);
    }
    expect(summaryText).not.toContain(': 0');
  });

  test('tabel anak: Status dan Aksi tidak bertumpuk, dokumen tidak overflow horizontal', async ({ page }) => {
    const { batchId, children } = await createBatch(token, senderId, [
      item({ beneficiaryAccountName: 'E2E Layout Row' }),
    ]);
    await toFinanceStaffReview(token, children[0].id);

    await login(page);
    await page.goto(`/transfers/bulk-batches/${batchId}`);
    await expect(page.getByTestId('batch-child-row').first()).toBeVisible();

    // Status & Aksi adalah dua sel terpisah yang tidak beririsan secara horizontal.
    const statusBox = await page.getByTestId('child-status-cell').first().boundingBox();
    const actionBox = await page.getByTestId('child-action-cell').first().boundingBox();
    expect(statusBox).not.toBeNull();
    expect(actionBox).not.toBeNull();
    expect(statusBox!.x + statusBox!.width).toBeLessThanOrEqual(actionBox!.x + 1);

    // Hanya wrapper tabel yang boleh menggeser; dokumen sendiri tidak.
    for (const viewport of [
      { width: 390, height: 844 }, // mobile
      { width: 820, height: 1180 }, // tablet
    ]) {
      await page.setViewportSize(viewport);
      await expect(page.getByTestId('batch-child-row').first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `document overflows at ${viewport.width}px`).toBeLessThanOrEqual(1);
    }
  });

  test('FrontDesk tidak melihat tombol arsip (FINAL) pada batch berisi transaksi final', async ({ page }) => {
    // Batch dibuat pakai token FrontDesk sendiri — lihat catatan kepemilikan
    // di test "FrontDesk (Maker)" di atas.
    const frontDesk = await ensureFrontDesk(token);
    const frontDeskToken = await apiLogin(frontDesk.email, frontDesk.password);

    const { batchId, children } = await createBatch(frontDeskToken, senderId, [item()]);
    await approveChild(token, children[0].id);

    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/transfers/bulk-batches/${batchId}`);
    await expect(page.getByText('Bulk Batch')).toBeVisible();
    await expect(page.getByTestId('download-qlola-final')).toHaveCount(0);
    // Tidak ada baris PENDING_FINANCE_STAFF_REVIEW pada batch ini, jadi tombol
    // Maker juga tidak tampil — bukan karena FrontDesk kekurangan hak.
    await expect(page.getByTestId('download-qlola-maker')).toHaveCount(0);
  });
});
