import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * FE-to-BE E2E: a rejected KYC application must read "Ditolak", never
 * "Perlu Perbaikan".
 *
 * Between migration 0048 and backend commit 840ec94 the decision endpoint
 * collapsed "Tolak" and "Kembalikan untuk Revisi" into one branch that wrote
 * status=REVISION_REQUIRED, so Compliance rejections surfaced on the
 * "Semua Pengguna Jasa" list as "Perlu Perbaikan". Backend migration 0065 adds
 * an explicit `decision` column; these tests pin the user-visible half of that
 * contract from both directions, so the two statuses can never merge again.
 *
 * The tested workflow runs through the real frontend (decide on the detail
 * page, then read the list). Direct backend calls appear only in beforeAll, to
 * seed applications — test-data setup, not part of the workflow.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const COMPLIANCE_EMAIL = process.env.E2E_COMPLIANCE_EMAIL || 'admin@example.com';
const COMPLIANCE_PASSWORD = process.env.E2E_COMPLIANCE_PASSWORD || 'Admin123!';

const ROLE_PASSWORD = 'Test@12345';

const REJECT_REASON = 'Identitas tidak dapat diverifikasi, hubungan usaha ditolak';
const REVISION_REASON = 'Slip gaji belum dilampirkan, mohon lengkapi';

const ts = Date.now().toString().slice(-7);

// ── Setup-only backend calls (not the tested workflow) ─────────────────────

async function api<T>(
  token: string,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
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
  if (!res.ok) throw new Error(`setup: login failed for ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

/**
 * A clean (LOW/MEDIUM) individual application with the three required docs,
 * submitted and screened — decidable by OperationSupervisor.
 */
async function seedSubmittedIndividual(token: string, fullName: string, seq: string): Promise<string> {
  const created = await api<{ id: number | string }>(token, '/applications/individual', {
    method: 'POST',
    body: {
      full_name: fullName,
      ktp_number: '3175001234567890',
      identity_type: 'KTP',
      identity_number: `35${seq}${ts}`,
      address_identity: 'Jl. Status Keputusan No. 1, Jakarta',
      pob: 'Jakarta',
      dob: '1989-07-07',
      nationality: 'ID',
      phone: `0855${seq}${ts}`,
      occupation: 'Karyawan Swasta',
      gender: 'M',
      signature_uri: 'https://storage.test/status_sig.png',
    },
  });
  const appId = String(created.id);

  for (const doc_type of [
    'INDIVIDUAL_KTP_PHOTO',
    'INDIVIDUAL_FACE_PHOTO',
    'INDIVIDUAL_FACE_WITH_KTP_PHOTO',
  ]) {
    await api(token, `/applications/${appId}/documents`, {
      method: 'POST',
      body: { doc_type, file_uri: `https://storage.test/st_${doc_type.toLowerCase()}.jpg` },
    });
  }

  await api(token, `/applications/${appId}/submit`, { method: 'PATCH' });
  return appId;
}

// ── FE-driven helpers ──────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function createAdminViaFE(
  page: Page,
  opts: { email: string; fullName: string; role: 'FrontDesk' | 'OperationSupervisor' },
) {
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

/** Drive a decision through the detail page exactly as a reviewer would. */
async function decideViaFE(
  page: Page,
  appId: string,
  opts: { open: string; placeholder: string; confirm: string; reason: string },
) {
  await page.goto(`/users/${appId}`);
  await page.getByRole('button', { name: opts.open }).click();

  const decided = page.waitForResponse(
    (r) => r.url().includes(`/applications/${appId}/decision`) && r.request().method() === 'PATCH',
  );
  await page.getByPlaceholder(opts.placeholder).fill(opts.reason);
  await page.getByRole('button', { name: opts.confirm, exact: true }).click();

  const res = await decided;
  expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();
  return res;
}

/**
 * Row text for one application on the "Semua Pengguna Jasa" list, found by the
 * applicant name — the list renders CIF/name/type/status, not the id. Searching
 * rather than scanning page 1 keeps this independent of how much seed data the
 * environment already holds.
 */
async function listRowTextFor(page: Page, fullName: string): Promise<string> {
  await page.goto('/users');
  await page.getByPlaceholder('Nama, email, telepon…').fill(fullName);

  const row = page.locator('tr').filter({ hasText: fullName }).first();
  await expect(row).toBeVisible();
  return (await row.innerText()).trim();
}

// ── Suite ──────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.describe('Rejected vs revision-required status display — FE-to-BE', () => {
  let complianceToken: string;
  let rejectedAppId: string;
  let revisionAppId: string;
  const rejectedName = `Uji Ditolak ${ts}`;
  const revisionName = `Uji Perbaikan ${ts}`;
  let ops: { email: string; password: string };
  let frontDesk: { email: string; password: string };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    complianceToken = await apiLogin(COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);

    rejectedAppId = await seedSubmittedIndividual(complianceToken, rejectedName, '50');
    revisionAppId = await seedSubmittedIndividual(complianceToken, revisionName, '51');

    ops = { email: `e2e.os.st.${ts}@test.local`, password: ROLE_PASSWORD };
    frontDesk = { email: `e2e.fd.st.${ts}@test.local`, password: ROLE_PASSWORD };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await createAdminViaFE(page, {
      email: ops.email,
      fullName: `E2E OpsSupervisor Status ${ts}`,
      role: 'OperationSupervisor',
    });
    await createAdminViaFE(page, {
      email: frontDesk.email,
      fullName: `E2E FrontDesk Status ${ts}`,
      role: 'FrontDesk',
    });
    await page.close();
  });

  test('Tolak sends REJECTED and the detail page shows Ditolak', async ({ page }) => {
    await login(page, ops.email, ops.password);

    const res = await decideViaFE(page, rejectedAppId, {
      open: 'Tolak…',
      placeholder: 'Tuliskan alasan penolakan...',
      confirm: 'Tolak',
      reason: REJECT_REASON,
    });
    expect(res.request().postDataJSON()).toEqual({
      decision: 'REJECTED',
      reason: REJECT_REASON,
    });

    await expect(page.getByText('Ditolak', { exact: true })).toBeVisible();
    await expect(page.getByText('Perlu Perbaikan')).toHaveCount(0);
  });

  test('Kembalikan untuk Revisi sends RETURN_FOR_REVISION and shows Perlu Perbaikan', async ({ page }) => {
    await login(page, ops.email, ops.password);

    const res = await decideViaFE(page, revisionAppId, {
      open: 'Kembalikan untuk Revisi…',
      placeholder: 'Tuliskan alasan yang perlu diperbaiki...',
      confirm: 'Kembalikan',
      reason: REVISION_REASON,
    });
    expect(res.request().postDataJSON()).toEqual({
      decision: 'RETURN_FOR_REVISION',
      reason: REVISION_REASON,
    });

    await expect(page.getByText('Perlu Perbaikan')).toBeVisible();
  });

  test('the rejected application reads Ditolak on Semua Pengguna Jasa', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);

    const rowText = await listRowTextFor(page, rejectedName);
    expect(rowText).toContain('Ditolak');
    // The regression this whole spec exists for.
    expect(rowText).not.toContain('Perlu Perbaikan');
  });

  test('the returned application still reads Perlu Perbaikan on the same list', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);

    const rowText = await listRowTextFor(page, revisionName);
    expect(rowText).toContain('Perlu Perbaikan');
    expect(rowText).not.toContain('Ditolak');
  });

  test('FrontDesk gets no correction flow on a rejected application', async ({ page }) => {
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/users/${rejectedAppId}`);

    await expect(page.getByText('Ditolak', { exact: true })).toBeVisible();
    // REJECTED is terminal: nothing to edit, nothing to resubmit.
    await expect(page.getByRole('button', { name: 'Ajukan', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajukan Ulang', exact: true })).toHaveCount(0);
  });

  test('FrontDesk keeps the correction flow on a revision-required application', async ({ page }) => {
    await login(page, frontDesk.email, frontDesk.password);
    await page.goto(`/users/${revisionAppId}`);

    await expect(page.getByText('Perlu Perbaikan')).toBeVisible();
    await expect(page.getByText(REVISION_REASON)).toBeVisible();
    // The resubmit affordance must survive — this is the flow REJECTED loses.
    await expect(page.getByRole('button', { name: 'Ajukan Ulang', exact: true })).toBeVisible();
  });
});
