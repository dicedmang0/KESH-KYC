import { test, expect, type Page, type Browser, type Locator } from '@playwright/test';

/**
 * FE-to-BE E2E for two KYB defects:
 *
 *  1. Step 3 "Dokumen Wajib" showed empty "No file chosen" cards even for
 *     documents the application already had, so users re-uploaded (or thought
 *     the upload had failed). Cards now reflect the documents stored on the
 *     application, survive a page reload, and satisfy the required-doc gate.
 *
 *  2. A KYB application returned for revision (REVISION_REQUIRED / "Perlu
 *     Perbaikan") must stay workable for FrontDesk: replace documents, manage
 *     related parties, resubmit — but never approve/reject. Read-only roles
 *     (Auditor, OperationSupervisor after returning) keep seeing nothing
 *     writable.
 *
 * The whole workflow runs through the real frontend. Direct backend calls are
 * used only to read back the application status as an assertion.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const ROLE_PASSWORD = 'Test@12345';

type RoleName = 'FrontDesk' | 'Auditor' | 'OperationSupervisor' | 'FinanceStaff';
type Credential = { email: string; password: string };

const REVISION_REASON = 'NPWP badan usaha tidak terbaca, mohon unggah ulang';
const NEW_PHONE = '0215557788';
const NEW_DEED = 'AKTA-REVISI-01';

/** Smallest valid PNG — content is irrelevant, only the upload round-trip matters. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function upload(name: string) {
  return { name, mimeType: 'image/png', buffer: PNG_1PX };
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
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

/** Read the stored status — assertion only, never part of the tested workflow. */
async function fetchStatus(appId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SYSADMIN_EMAIL, password: SYSADMIN_PASSWORD }),
  });
  const token = (await res.json()).access_token;
  const detail = await fetch(`${API_BASE_URL}/applications/${appId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return (await detail.json()).application?.status;
}

async function waitForOptionsLoaded(select: Locator) {
  await expect.poll(async () => select.locator('option').count(), { timeout: 10_000 }).toBeGreaterThan(1);
}

/** The Step 3 card for one document type. */
function docCard(page: Page, code: string) {
  return page.locator('div.rounded-md.border-dashed').filter({
    has: page.locator(`input[data-doc-type="${code}"]`),
  });
}

async function uploadDoc(page: Page, code: string, filename: string) {
  const uploaded = page.waitForResponse(
    (r) => r.url().includes('/documents/upload') && r.request().method() === 'POST',
  );
  await page.locator(`input[data-doc-type="${code}"]`).setInputFiles(upload(filename));
  const res = await uploaded;
  expect(res.status(), await res.text().catch(() => '')).toBe(201);
  await expect(docCard(page, code).getByText('Berhasil Terupload')).toBeVisible();
}

const REQUIRED_DOCS = [
  'BUSINESS_DEED_ESTABLISHMENT_AMENDMENT',
  'BUSINESS_LICENSE',
  'BUSINESS_NPWP',
  'BUSINESS_MANAGEMENT_IDENTITY',
];

test.describe.configure({ mode: 'serial' });

test.describe('KYB documents & returned-application editing — FE-to-BE', () => {
  let ts: string;
  let users: Record<RoleName, Credential>;
  let appId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();
    users = {
      FrontDesk: { email: `e2e.fd.kyb.${ts}@test.local`, password: ROLE_PASSWORD },
      Auditor: { email: `e2e.au.kyb.${ts}@test.local`, password: ROLE_PASSWORD },
      OperationSupervisor: { email: `e2e.os.kyb.${ts}@test.local`, password: ROLE_PASSWORD },
      FinanceStaff: { email: `e2e.fs.kyb.${ts}@test.local`, password: ROLE_PASSWORD },
    };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    for (const role of Object.keys(users) as RoleName[]) {
      await createAdminViaFE(page, { email: users[role].email, fullName: `E2E ${role} KYB ${ts}`, role });
    }
    await page.close();
  });

  test('Step 3 shows already-uploaded documents, survives a reload, and satisfies the required-doc gate', async ({
    page,
  }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);

    // ── Step 1: identitas ──────────────────────────────────────────────────
    await page.goto('/applications/new?type=business');
    await expect(page.getByText('Input Data KYB')).toBeVisible();

    await page.getByLabel('Nama Badan Usaha').fill(`PT Dokumen KYB ${ts}`);
    await page.getByLabel('No. Akta Pendirian').fill(`AKTA-DOC-${ts}`);
    await page.getByLabel('Tanggal Pendirian').fill('2019-08-01');
    await page.getByLabel('Nomor Izin Usaha').fill(`NIB-DOC-${ts}`);
    await page.getByLabel('NPWP Badan Usaha').fill(ts.padEnd(15, '0').slice(0, 15));

    const bidangUsaha = page.getByLabel('Bidang Usaha');
    await waitForOptionsLoaded(bidangUsaha);
    await bidangUsaha.selectOption({ index: 1 });

    await page.getByLabel('Alamat Kedudukan').fill('Jl. Dokumen Wajib No. 3');

    const provinsi = page.getByLabel('Provinsi');
    await waitForOptionsLoaded(provinsi);
    await provinsi.selectOption({ index: 1 });
    const kota = page.getByLabel('Kota / Kabupaten');
    await waitForOptionsLoaded(kota);
    await kota.selectOption({ index: 1 });

    await page.getByLabel('Kode Pos').fill('12345');
    await page.getByLabel('Nomor Telepon Perusahaan').fill(`021${ts.slice(-8)}`);

    const createResponse = page.waitForResponse(
      (res) => res.url().includes('/applications/business') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
    const createRes = await createResponse;
    expect(createRes.status(), await createRes.text().catch(() => '')).toBe(201);
    appId = String(((await createRes.json()) as { id: number | string }).id);

    // The application id lands in the URL so a reload resumes this application.
    await expect(page).toHaveURL(new RegExp(`app_id=${appId}`));

    // ── Step 2: one Direktur is enough to unlock Lanjut ────────────────────
    await expect(page.getByText('Informasi Pengurus & Pemegang Saham')).toBeVisible();
    await page.getByRole('button', { name: '+ Tambah Pihak' }).click();
    await page.getByLabel('Nama', { exact: true }).fill(`Direktur Dokumen ${ts}`);
    await page.getByLabel('Nomor Identitas').fill(ts.slice(-16));
    const partyAdded = page.waitForResponse(
      (res) => res.url().includes('/parties') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    expect((await partyAdded).status()).toBe(201);
    await page.getByRole('button', { name: 'Lanjut', exact: true }).click();

    // ── Step 3: cards start empty, then reflect each upload immediately ────
    await expect(page.getByText('Dokumen Wajib')).toBeVisible();
    for (const code of REQUIRED_DOCS) {
      await expect(docCard(page, code).getByText('Belum Terupload')).toBeVisible();
    }

    await uploadDoc(page, 'BUSINESS_DEED_ESTABLISHMENT_AMENDMENT', `akta-${ts}.png`);
    // Filename and the "Lihat" link appear without any reload.
    await expect(docCard(page, 'BUSINESS_DEED_ESTABLISHMENT_AMENDMENT')).toContainText(`akta-${ts}.png`);
    await expect(
      docCard(page, 'BUSINESS_DEED_ESTABLISHMENT_AMENDMENT').getByRole('button', { name: 'Lihat' }),
    ).toBeVisible();

    // ── Reload: the wizard resumes the same application and the state holds ─
    await page.reload();
    await expect(page.getByText('Informasi Pengurus & Pemegang Saham')).toBeVisible();
    await page.getByRole('button', { name: 'Lanjut', exact: true }).click();
    await expect(page.getByText('Dokumen Wajib')).toBeVisible();
    await expect(docCard(page, 'BUSINESS_DEED_ESTABLISHMENT_AMENDMENT').getByText('Berhasil Terupload')).toBeVisible();
    await expect(docCard(page, 'BUSINESS_DEED_ESTABLISHMENT_AMENDMENT')).toContainText(`akta-${ts}.png`);

    // The gate must still name the three that really are missing.
    await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
    const gate = page.getByText(/Dokumen wajib belum lengkap/);
    await expect(gate).toBeVisible();
    await expect(gate).not.toContainText('Akta Pendirian & Perubahan');

    for (const code of REQUIRED_DOCS.slice(1)) {
      await uploadDoc(page, code, `${code.toLowerCase()}-${ts}.png`);
    }

    // No file is re-selected here — the gate passes on the stored documents.
    await page.getByRole('button', { name: 'Simpan & Lanjut' }).click();
    await expect(page.getByText('Tinjauan & Ajukan')).toBeVisible();

    const submitted = page.waitForResponse(
      (r) => r.url().includes(`/applications/${appId}/submit`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Ajukan Aplikasi' }).click();
    const submitRes = await submitted;
    expect(submitRes.ok(), await submitRes.text().catch(() => '')).toBeTruthy();
    await page.waitForURL(`**/users/${appId}`);
  });

  test('SystemAdmin returns the application for revision', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/users/${appId}`);

    await page.getByRole('button', { name: 'Kembalikan untuk Revisi…' }).click();
    const returned = page.waitForResponse(
      (r) => r.url().includes(`/applications/${appId}/decision`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('textbox').last().fill(REVISION_REASON);
    await page.getByRole('button', { name: 'Kembalikan', exact: true }).click();
    const res = await returned;
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();

    expect(await fetchStatus(appId)).toBe('REVISION_REQUIRED');
    await expect(page.getByText('Perlu Perbaikan')).toBeVisible();
  });

  test('FrontDesk can replace a document and resubmit a returned KYB, but cannot decide it', async ({ page }) => {
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await page.goto(`/users/${appId}`);

    // Revision banner with the reason from the backend.
    await expect(
      page.getByText('Aplikasi dikembalikan untuk perbaikan. Silakan perbarui data lalu submit ulang.'),
    ).toBeVisible();
    await expect(page.getByText(REVISION_REASON)).toBeVisible();

    // No decision affordances for FrontDesk.
    await expect(page.getByRole('button', { name: 'Setujui' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kembalikan untuk Revisi…' })).toHaveCount(0);

    // Documents are replaceable, and the type list is the one submit validates.
    const uploadForm = page.locator('form').filter({ hasText: 'Upload Dokumen Baru' });
    const docTypeSelect = uploadForm.locator('select');
    await expect(docTypeSelect).toBeVisible();
    await docTypeSelect.selectOption('BUSINESS_NPWP');
    const uploaded = page.waitForResponse(
      (r) => r.url().includes('/documents/upload') && r.request().method() === 'POST',
    );
    await uploadForm.locator('input[type="file"]').setInputFiles(upload(`npwp-revisi-${ts}.png`));
    await uploadForm.getByRole('button', { name: 'Upload File' }).click();
    const uploadRes = await uploaded;
    expect(uploadRes.status(), await uploadRes.text().catch(() => '')).toBe(201);
    expect((await uploadRes.json()).doc_type).toBe('BUSINESS_NPWP');
    await expect(page.getByText(`npwp-revisi-${ts}.png`)).toBeVisible();

    // Related parties stay manageable.
    await expect(page.getByRole('button', { name: '+ Tambah Pihak' })).toBeVisible();

    // ── Business identity is editable via PATCH /applications/:id/business ──
    let createCalls = 0;
    page.on('request', (r) => {
      if (r.url().endsWith('/applications/business') && r.method() === 'POST') createCalls += 1;
    });

    await page.getByRole('button', { name: 'Ubah Identitas' }).click();
    await expect(page.locator('#biz-legal_name')).toHaveValue(`PT Dokumen KYB ${ts}`);
    // Deed fields are two separate inputs; the optional one starts empty.
    await expect(page.locator('#biz-deed_establishment_number')).toHaveValue(`AKTA-DOC-${ts}`);
    await expect(page.locator('#biz-deed_latest_amendment_number')).toHaveValue('');

    await page.locator('#biz-phone').fill(NEW_PHONE);
    await page.locator('#biz-deed_establishment_number').fill(NEW_DEED);

    const patched = page.waitForRequest(
      (r) => r.url().endsWith(`/applications/${appId}/business`) && r.method() === 'PATCH',
    );
    const patchedResponse = page.waitForResponse(
      (r) => r.url().endsWith(`/applications/${appId}/business`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Simpan Identitas' }).click();

    // Partial patch: only the two touched fields, amendment left untouched.
    const body = (await patched).postDataJSON();
    expect(body).toEqual({ phone: NEW_PHONE, deed_establishment_number: NEW_DEED });
    const patchRes = await patchedResponse;
    expect(patchRes.ok(), await patchRes.text().catch(() => '')).toBeTruthy();

    // Reload: the new values persisted, and the document card state survived.
    await page.reload();
    await expect(page.getByText(NEW_PHONE)).toBeVisible();
    await expect(page.getByText(NEW_DEED)).toBeVisible();
    await expect(page.locator('div').filter({ hasText: /^No\. Akta Perubahan Terakhir/ }).last()).toContainText('—');
    await expect(page.getByText(`npwp-revisi-${ts}.png`)).toBeVisible();

    // Editing must never create a second application.
    expect(createCalls).toBe(0);

    // Resubmit — the application leaves REVISION_REQUIRED.
    const resubmitted = page.waitForResponse(
      (r) => r.url().includes(`/applications/${appId}/submit`) && r.request().method() === 'PATCH',
    );
    await page.getByRole('button', { name: 'Ajukan Ulang' }).click();
    const res = await resubmitted;
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();
    expect(await fetchStatus(appId)).not.toBe('REVISION_REQUIRED');
  });

  test('Auditor, FinanceStaff and OperationSupervisor stay read-only on the same application', async ({ page }) => {
    await login(page, users.Auditor.email, users.Auditor.password);
    await page.goto(`/users/${appId}`);
    await expect(page.getByText('Informasi Identitas Badan Usaha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload File' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Tambah Pihak' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajukan Ulang' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ubah Identitas' })).toHaveCount(0);

    await switchRole(page, users.FinanceStaff.email, users.FinanceStaff.password);
    await page.goto(`/users/${appId}`);
    await expect(page.getByText('Informasi Identitas Badan Usaha')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ubah Identitas' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Upload File' })).toHaveCount(0);

    await switchRole(page, users.OperationSupervisor.email, users.OperationSupervisor.password);
    await page.goto(`/users/${appId}`);
    await expect(page.getByText('Informasi Identitas Badan Usaha')).toBeVisible();
    // OperationSupervisor decides, never edits — the write endpoints would 403.
    await expect(page.getByRole('button', { name: 'Upload File' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '+ Tambah Pihak' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ubah Identitas' })).toHaveCount(0);
  });
});
