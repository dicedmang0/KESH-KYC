import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: alur pengaduan berbasis complaint_level dengan layer COO
 * (backend migration 0070).
 *
 *   LEVEL_1: ComplaintHandling → OperationSupervisor → COO → ComplaintHandling
 *   LEVEL_2: … → COO → FinanceStaff → FinanceManager → ComplaintHandling
 *   LEVEL_3: … → COO → ComplianceLead → ComplaintHandling
 *
 * Seluruh workflow dijalankan lewat UI sungguhan. Panggilan API langsung hanya
 * untuk setup data (mencari/membuat transfer yang bisa diadukan).
 *
 * Butuh FE + BE berjalan lokal — lihat e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';
const ROLE_PASSWORD = 'Test@12345';

type RoleName =
  | 'ComplaintHandling'
  | 'OperationSupervisor'
  | 'COO'
  | 'FinanceStaff'
  | 'FinanceManager'
  | 'ComplianceLead';

type Credential = { email: string; password: string };
type Level = 'LEVEL_1' | 'LEVEL_2' | 'LEVEL_3';

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

type TestTransfer = { displayName: string; transactionReference: string };

/** Pakai transfer lokal yang sudah ada; buat satu kalau belum ada sama sekali. */
async function resolveTestTransfer(token: string): Promise<TestTransfer> {
  const headers = { Authorization: `Bearer ${token}` };
  const appsRes = await fetch(`${API_BASE_URL}/applications?status=APPROVED&limit=25`, { headers });
  if (!appsRes.ok) throw new Error(`setup: failed listing approved applications: ${appsRes.status}`);
  const apps: Array<{ id: string; display_name: string }> = (await appsRes.json()).data ?? [];

  for (const app of apps) {
    const txRes = await fetch(
      `${API_BASE_URL}/complaints/transactions/search?customer_application_id=${app.id}&q=`,
      { headers },
    );
    if (!txRes.ok) continue;
    const body = await txRes.json();
    const list = Array.isArray(body) ? body : (body.data ?? []);
    if (list.length > 0) {
      return { displayName: app.display_name, transactionReference: list[0].transaction_reference };
    }
  }

  const first = apps[0];
  if (!first) {
    throw new Error(
      'setup: no APPROVED application exists locally. Create at least one approved KYC/KYB application first.',
    );
  }
  const reference = `PW-COO-TRF-${Date.now()}`;
  const createRes = await fetch(`${API_BASE_URL}/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({
      amount: 250_000,
      beneficiary_relationship_to_sender: 'Lainnya',
      beneficiaryBankName: 'Bank Test E2E',
      sender_application_id: Number(first.id),
      beneficiaryAccountNumber: '1234567890',
      beneficiaryAccountName: 'E2E Penerima COO',
      partner_reference_no: reference,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`setup: failed creating fallback transfer: ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return { displayName: first.display_name, transactionReference: created.partner_reference_no };
}

// ── FE helpers ──────────────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function switchRole(page: Page, cred: Credential) {
  const logoutButton = page.getByRole('button', { name: 'Keluar' });
  if ((await logoutButton.count()) > 0) {
    await logoutButton.click();
    await page.waitForURL('**/login');
  }
  await login(page, cred.email, cred.password);
}

function actorField(page: Page, label: string) {
  return page.locator(`div:has(> div.text-xs:text-is("${label}")) > div.text-sm`).first();
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
    throw new Error(`setup: failed creating admin ${opts.email} (${opts.role}): ${res.status()}`);
  }
}

/**
 * Satu aksi workflow: pilih keputusan, isi catatan, tekan tombol, pastikan 201.
 * Tiap tahap hanya menampilkan satu form, jadi combobox tunggal sudah tepat.
 */
async function submitStage(
  page: Page,
  complaintId: string,
  opts: { endpoint: string; choice: string; notes: string; button: string },
) {
  await page.getByRole('combobox').selectOption(opts.choice);
  await page.getByPlaceholder('Tuliskan catatan hasil pemeriksaan…').fill(opts.notes);
  const responded = page.waitForResponse(
    (res) =>
      res.url().includes(`/complaints/${complaintId}/${opts.endpoint}`) &&
      res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: opts.button }).click();
  const res = await responded;
  expect(res.status(), await res.text().catch(() => '')).toBe(201);
}

// ── Suite ───────────────────────────────────────────────────────────────────

test.describe('Pengaduan — alur COO berbasis level (FE-to-BE)', () => {
  let ts: string;
  let testTransfer: TestTransfer;
  let users: Record<RoleName, Credential>;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();
    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    testTransfer = await resolveTestTransfer(sysAdminToken);

    users = {
      ComplaintHandling: { email: `pw.coo.ch.${ts}@test.local`, password: ROLE_PASSWORD },
      OperationSupervisor: { email: `pw.coo.os.${ts}@test.local`, password: ROLE_PASSWORD },
      COO: { email: `pw.coo.coo.${ts}@test.local`, password: ROLE_PASSWORD },
      FinanceStaff: { email: `pw.coo.fs.${ts}@test.local`, password: ROLE_PASSWORD },
      FinanceManager: { email: `pw.coo.fm.${ts}@test.local`, password: ROLE_PASSWORD },
      ComplianceLead: { email: `pw.coo.cl.${ts}@test.local`, password: ROLE_PASSWORD },
    };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    for (const role of Object.keys(users) as RoleName[]) {
      await createAdminViaFE(page, { email: users[role].email, fullName: `PW ${role} ${ts}`, role });
    }
    await page.close();
  });

  /** Buat pengaduan pada level tertentu lewat form FE; kembalikan id-nya. */
  async function createComplaint(page: Page, level: Level, seq: string): Promise<string> {
    await page.goto('/complaints/new');
    await page.getByPlaceholder('Cari nama atau CIF customer…').fill(testTransfer.displayName);
    await page
      .getByRole('button', { name: new RegExp(escapeRegExp(testTransfer.displayName)) })
      .click();
    await page
      .getByPlaceholder('Cari nomor referensi transaksi…')
      .fill(testTransfer.transactionReference);
    await page
      .getByRole('button', { name: new RegExp(escapeRegExp(testTransfer.transactionReference)) })
      .click();

    await page.getByLabel('Complaint Level').selectOption(level);
    if (level === 'LEVEL_3') {
      await page.getByLabel('Kategori Risiko Level 3').selectOption('COMPLIANCE_RISK');
    }
    await page.getByLabel('Jenis Pengaduan').selectOption('TRANSFER');
    await page
      .getByPlaceholder('Tuliskan kronologi dan detail keluhan customer.')
      .fill(`Uji alur ${level} dengan layer COO (${seq}).`);

    const created = page.waitForResponse(
      (res) => res.url().endsWith('/complaints') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Catat Pengaduan' }).click();
    const res = await created;
    expect(res.status(), await res.text().catch(() => '')).toBe(201);
    const id = String((await res.json()).id);
    await page.waitForURL(`**/complaints/${id}`);
    return id;
  }

  /** ComplaintHandling verify → OperationSupervisor investigasi → status COO_REVIEW. */
  async function driveToCooReview(page: Page, level: Level, seq: string): Promise<string> {
    await login(page, users.ComplaintHandling.email, users.ComplaintHandling.password);
    const id = await createComplaint(page, level, seq);

    await submitStage(page, id, {
      endpoint: 'verify-data',
      choice: 'COMPLETE',
      notes: 'Data pengaduan lengkap.',
      button: 'Simpan Verifikasi Data',
    });
    await expect(page.getByText('Operation Investigation', { exact: true }).first()).toBeVisible();

    await switchRole(page, users.OperationSupervisor);
    await page.goto(`/complaints/${id}`);
    await submitStage(page, id, {
      endpoint: 'operation-investigation',
      choice: 'SUCCESS',
      notes: 'Investigasi transaksi selesai, dinaikkan ke COO.',
      button: 'Simpan Hasil Investigasi',
    });
    await expect(page.getByText('Menunggu Review COO', { exact: true }).first()).toBeVisible();

    // Aksi tahap sebelumnya hilang begitu tiket pindah.
    await expect(page.getByRole('button', { name: 'Simpan Hasil Investigasi' })).toHaveCount(0);
    return id;
  }

  /** COO menyetujui; tujuannya ditentukan level, tidak dipilih manual. */
  async function cooApprove(page: Page, id: string) {
    await switchRole(page, users.COO);
    await page.goto(`/complaints/${id}`);
    await expect(page.getByRole('heading', { name: 'Review COO' })).toBeVisible();
    await submitStage(page, id, {
      endpoint: 'coo-review',
      choice: 'APPROVE',
      notes: 'Disetujui COO, diteruskan sesuai level pengaduan.',
      button: 'Simpan Keputusan COO',
    });
    // Setelah memutus, COO read-only.
    await expect(page.getByRole('button', { name: 'Simpan Keputusan COO' })).toHaveCount(0);
  }

  /** ComplaintHandling menutup tiket dari tahap finalisasi. */
  async function finalize(page: Page, id: string) {
    await switchRole(page, users.ComplaintHandling);
    await page.goto(`/complaints/${id}`);
    await expect(
      page.getByText('Menunggu Finalisasi Pengaduan', { exact: true }).first(),
    ).toBeVisible();

    await page
      .getByPlaceholder('Ringkasan penyelesaian pengaduan…')
      .fill('Hasil penanganan sudah disampaikan ke nasabah.');
    await page
      .getByPlaceholder('Isi komunikasi yang sudah disampaikan ke nasabah / merchant…')
      .fill('Nasabah dihubungi via telepon.');
    const resolved = page.waitForResponse(
      (res) => res.url().includes(`/complaints/${id}/resolve`) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Selesaikan Pengaduan' }).click();
    expect((await resolved).status()).toBe(201);
    await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible();

    await page
      .getByPlaceholder('Alasan / ringkasan penutupan tiket…')
      .fill('Pengaduan ditutup setelah komunikasi ke nasabah.');
    const closed = page.waitForResponse(
      (res) => res.url().includes(`/complaints/${id}/close`) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tutup Pengaduan' }).click();
    expect((await closed).status()).toBe(201);
    await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();
  }

  /** Nama tahap yang muncul di timeline detail. */
  function timelineStages(page: Page) {
    return page.getByTestId('complaint-timeline').locator('li');
  }

  // ── LEVEL 1 ───────────────────────────────────────────────────────────────

  test('LEVEL_1: COO menyetujui → langsung finalisasi ComplaintHandling', async ({ page }) => {
    const id = await driveToCooReview(page, 'LEVEL_1', 'L1');

    await cooApprove(page, id);
    await expect(
      page.getByText('Menunggu Finalisasi Pengaduan', { exact: true }).first(),
    ).toBeVisible();
    await expect(actorField(page, 'Review Oleh')).toHaveText(`PW COO ${ts}`);

    // Timeline hanya menampilkan tahap yang relevan — tanpa Finance/Compliance.
    const stages = timelineStages(page);
    await expect(stages).toHaveCount(4);
    await expect(page.getByTestId('complaint-timeline')).not.toContainText('Finance');
    await expect(page.getByTestId('complaint-timeline')).not.toContainText('Compliance');

    // Finance & Compliance tidak punya aksi apa pun di LEVEL_1.
    for (const role of ['FinanceStaff', 'FinanceManager', 'ComplianceLead'] as RoleName[]) {
      await switchRole(page, users[role]);
      await page.goto(`/complaints/${id}`);
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(
        page.getByText('Anda memiliki akses baca saja pada pengaduan ini.'),
      ).toBeVisible();
    }

    await finalize(page, id);
  });

  // ── LEVEL 2 ───────────────────────────────────────────────────────────────

  test('LEVEL_2: COO → Finance Staff → Finance Manager → ComplaintHandling', async ({ page }) => {
    const id = await driveToCooReview(page, 'LEVEL_2', 'L2');
    await cooApprove(page, id);
    await expect(
      page.getByText('Menunggu Review Finance Staff', { exact: true }).first(),
    ).toBeVisible();

    // Compliance tidak berperan di LEVEL_2.
    await switchRole(page, users.ComplianceLead);
    await page.goto(`/complaints/${id}`);
    await expect(page.getByRole('combobox')).toHaveCount(0);

    await switchRole(page, users.FinanceStaff);
    await page.goto(`/complaints/${id}`);
    await submitStage(page, id, {
      endpoint: 'finance-review',
      choice: 'APPROVE',
      notes: 'Dampak finansial sudah diverifikasi.',
      button: 'Simpan Keputusan Finance',
    });
    await expect(
      page.getByText('Menunggu Review Finance Manager', { exact: true }).first(),
    ).toBeVisible();
    // Aksi Finance Staff hilang setelah tiket naik ke manager.
    await expect(page.getByRole('button', { name: 'Simpan Keputusan Finance' })).toHaveCount(0);

    // Timeline LEVEL_2 memuat kedua tahap Finance, tanpa Compliance.
    const stages = timelineStages(page);
    await expect(stages).toHaveCount(6);
    await expect(page.getByTestId('complaint-timeline')).not.toContainText('Compliance');

    await switchRole(page, users.FinanceManager);
    await page.goto(`/complaints/${id}`);
    await submitStage(page, id, {
      endpoint: 'finance-manager-review',
      choice: 'APPROVE',
      notes: 'Disetujui Finance Manager.',
      button: 'Simpan Keputusan Finance Manager',
    });
    await expect(
      page.getByText('Menunggu Finalisasi Pengaduan', { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Simpan Keputusan Finance Manager' }),
    ).toHaveCount(0);
    // Jejak dua aktor Finance terpisah.
    await expect(actorField(page, 'Finance Review Oleh')).toHaveText(`PW FinanceStaff ${ts}`);

    await finalize(page, id);
  });

  test('LEVEL_2: Finance Manager RETURN mengembalikan tiket ke Finance Staff', async ({ page }) => {
    const id = await driveToCooReview(page, 'LEVEL_2', 'L2-RET');
    await cooApprove(page, id);

    await switchRole(page, users.FinanceStaff);
    await page.goto(`/complaints/${id}`);
    await submitStage(page, id, {
      endpoint: 'finance-review',
      choice: 'APPROVE',
      notes: 'Diteruskan ke Finance Manager.',
      button: 'Simpan Keputusan Finance',
    });

    await switchRole(page, users.FinanceManager);
    await page.goto(`/complaints/${id}`);
    await submitStage(page, id, {
      endpoint: 'finance-manager-review',
      choice: 'RETURN',
      notes: 'Lampiran perhitungan kurang lengkap.',
      button: 'Simpan Keputusan Finance Manager',
    });
    await expect(
      page.getByText('Menunggu Review Finance Staff', { exact: true }).first(),
    ).toBeVisible();

    // Finance Staff kembali punya form; Finance Manager tidak.
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await switchRole(page, users.FinanceStaff);
    await page.goto(`/complaints/${id}`);
    await expect(page.getByRole('button', { name: 'Simpan Keputusan Finance' })).toBeVisible();
  });

  // ── LEVEL 3 ───────────────────────────────────────────────────────────────

  test('LEVEL_3: COO → Compliance Lead → ComplaintHandling', async ({ page }) => {
    const id = await driveToCooReview(page, 'LEVEL_3', 'L3');
    await cooApprove(page, id);
    await expect(
      page.getByText('Menunggu Review Compliance', { exact: true }).first(),
    ).toBeVisible();

    // Finance tidak berperan di LEVEL_3.
    for (const role of ['FinanceStaff', 'FinanceManager'] as RoleName[]) {
      await switchRole(page, users[role]);
      await page.goto(`/complaints/${id}`);
      await expect(page.getByRole('combobox')).toHaveCount(0);
    }

    await switchRole(page, users.ComplianceLead);
    await page.goto(`/complaints/${id}`);

    // Timeline LEVEL_3 memuat Compliance, tanpa tahap Finance.
    const stages = timelineStages(page);
    await expect(stages).toHaveCount(5);
    await expect(page.getByTestId('complaint-timeline')).not.toContainText('Finance');

    await submitStage(page, id, {
      endpoint: 'compliance-review',
      choice: 'APPROVE',
      notes: 'Tidak ditemukan indikasi pencucian uang.',
      button: 'Simpan Keputusan Compliance',
    });
    await expect(
      page.getByText('Menunggu Finalisasi Pengaduan', { exact: true }).first(),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan Keputusan Compliance' })).toHaveCount(0);

    await finalize(page, id);
  });

  // ── COO RETURN & pembatasan role ──────────────────────────────────────────

  test('COO RETURN_TO_SUPERVISOR mengembalikan tiket ke Operation Supervisor', async ({ page }) => {
    const id = await driveToCooReview(page, 'LEVEL_2', 'RET');

    await switchRole(page, users.COO);
    await page.goto(`/complaints/${id}`);
    await submitStage(page, id, {
      endpoint: 'coo-review',
      choice: 'RETURN_TO_SUPERVISOR',
      notes: 'Bukti mutasi rekening belum dilampirkan.',
      button: 'Simpan Keputusan COO',
    });
    await expect(page.getByText('Operation Investigation', { exact: true }).first()).toBeVisible();
    // Jejak investigasi sebelumnya tidak terhapus.
    await expect(actorField(page, 'Investigasi Oleh')).toHaveText(`PW OperationSupervisor ${ts}`);

    await switchRole(page, users.OperationSupervisor);
    await page.goto(`/complaints/${id}`);
    await submitStage(page, id, {
      endpoint: 'operation-investigation',
      choice: 'SUCCESS',
      notes: 'Bukti mutasi rekening sudah dilampirkan.',
      button: 'Simpan Hasil Investigasi',
    });
    await expect(page.getByText('Menunggu Review COO', { exact: true }).first()).toBeVisible();
  });

  test('COO hanya melihat menu Pengaduan & Laporan, tanpa aksi di luar tahapnya', async ({ page }) => {
    const id = await driveToCooReview(page, 'LEVEL_1', 'MENU');

    await switchRole(page, users.COO);

    // Sidebar: hanya menu yang relevan.
    await expect(page.getByRole('link', { name: 'Pencatatan Pengaduan' })).toBeVisible();
    for (const menu of [
      'Verifikasi KYC/KYB',
      'Pencatatan Transfer',
      'Daftar Pengawasan',
      'Monitoring',
      'Pengaturan',
      'Pencatatan Refund',
      'Manajemen Pengguna Jasa',
    ]) {
      await expect(page.getByRole('link', { name: menu })).toHaveCount(0);
    }

    // Daftar pengaduan bisa dibuka, tapi tanpa tombol buat pengaduan.
    await page.goto('/complaints');
    await expect(page.getByRole('heading', { name: 'Pencatatan Pengaduan' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Catat Pengaduan' })).toHaveCount(0);
    // Scope ke tabel: teks yang sama juga ada di <option> filter status (hidden).
    await expect(
      page.locator('table').getByText('Menunggu Review COO').first(),
    ).toBeVisible();

    // Di tahapnya COO punya form; setelah tiket lanjut, read-only.
    await page.goto(`/complaints/${id}`);
    await expect(page.getByRole('button', { name: 'Simpan Keputusan COO' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Simpan Verifikasi Data' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Simpan Hasil Investigasi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Selesaikan Pengaduan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tutup Pengaduan' })).toHaveCount(0);
  });

  test('halaman pengaduan tetap terbaca di lebar mobile & tablet', async ({ page }) => {
    const id = await driveToCooReview(page, 'LEVEL_2', 'RESP');
    await cooApprove(page, id);

    await switchRole(page, users.ComplaintHandling);
    for (const viewport of [
      { width: 390, height: 844 },  // mobile
      { width: 820, height: 1180 }, // tablet
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/complaints/${id}`);
      await expect(page.getByTestId('complaint-timeline')).toBeVisible();
      // Body tidak boleh scroll horizontal.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `viewport ${viewport.width}px meluber ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});
