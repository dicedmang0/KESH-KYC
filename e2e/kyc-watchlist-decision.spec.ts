import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * FE-to-BE E2E: ComplianceLead decision actions on a watchlist-hit KYC
 * application.
 *
 * A DTTOT/PPPSPM MATCH blocks approval in the backend
 * (`ApplicationsService.decide`), so the detail page must not offer "Setujui"
 * for such an application — but "Tolak" and "Kembalikan untuk Revisi" stay
 * available, and rejection is the whole point of the compliance review.
 *
 * The tested workflow (open detail → Tolak → reason → submit) runs through the
 * real frontend. Direct backend calls are used only to seed a fresh DTTOT entry
 * and a matching application, and to read back the resulting status.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const COMPLIANCE_EMAIL = process.env.E2E_COMPLIANCE_EMAIL || 'admin@example.com';
const COMPLIANCE_PASSWORD = process.env.E2E_COMPLIANCE_PASSWORD || 'Admin123!';

const ROLE_PASSWORD = 'Test@12345';

const REJECT_REASON = 'Match DTTOT terkonfirmasi, hubungan usaha ditolak';
const REVISION_REASON = 'Konfirmasi ulang identitas customer';

const ts = Date.now().toString().slice(-7);
const DTTOT_NAME = `Sanksi Uji Tolak ${ts}`;
const CLEAN_NAME = `Bersih Uji Setujui ${ts}`;

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

/** Seed one DTTOT entry through the real ingest path, same as the FE upload. */
async function seedDttot(token: string, fullName: string) {
  const csv = [
    'Unique_ID,Watchlist_Type,Full_Name,Nationality,Subject_Type',
    `WLDEC${ts},DTTOT,${fullName},ID,Orang`,
  ].join('\n');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), `dec_dttot_${ts}.csv`);
  form.append('list_type', 'DTTOT');
  form.append('list_source', `E2E DEC DTTOT ${ts}`);

  const res = await fetch(`${API_BASE_URL}/watchlist/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) throw new Error(`setup: watchlist upload → ${res.status} ${await res.text()}`);
}

/** Individual application with the three required docs, submitted and screened. */
async function seedSubmittedIndividual(token: string, fullName: string, seq: string): Promise<string> {
  const created = await api<{ id: number | string }>(token, '/applications/individual', {
    method: 'POST',
    body: {
      full_name: fullName,
      ktp_number: '3175001234567890',
      identity_type: 'KTP',
      identity_number: `34${seq}${ts}`,
      address_identity: 'Jl. Keputusan Watchlist No. 1, Jakarta',
      pob: 'Jakarta',
      dob: '1988-04-04',
      nationality: 'ID',
      phone: `0844${seq}${ts}`,
      occupation: 'Karyawan Swasta',
      gender: 'M',
      signature_uri: 'https://storage.test/dec_sig.png',
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
      body: { doc_type, file_uri: `https://storage.test/dec_${doc_type.toLowerCase()}.jpg` },
    });
  }

  await api(token, `/applications/${appId}/submit`, { method: 'PATCH' });
  return appId;
}

async function fetchStatus(token: string, appId: string): Promise<string> {
  const detail = await api<{ application: { status: string } }>(token, `/applications/${appId}`);
  return detail.application.status;
}

// ── FE-driven helpers ──────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function createOpsSupervisorViaFE(page: Page, opts: { email: string; fullName: string }) {
  await page.getByLabel('Email').fill(opts.email);
  await page.getByLabel('Nama').fill(opts.fullName);
  await page.getByLabel('Role').selectOption('OperationSupervisor');
  await page.getByLabel('Password awal').fill(ROLE_PASSWORD);

  const created = page.waitForResponse(
    (res) => res.url().includes('/users/admins') && res.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Buat Admin' }).click();
  const res = await created;
  if (res.status() !== 201) {
    throw new Error(`setup: failed creating OperationSupervisor: ${res.status()} ${await res.text()}`);
  }
}

// ── Suite ──────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.describe('KYC decision actions on a watchlist hit — FE-to-BE', () => {
  let complianceToken: string;
  let hitAppId: string;
  let revisionAppId: string;
  let cleanAppId: string;
  let ops: { email: string; password: string };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    complianceToken = await apiLogin(COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await seedDttot(complianceToken, DTTOT_NAME);

    hitAppId = await seedSubmittedIndividual(complianceToken, DTTOT_NAME, '40');
    revisionAppId = await seedSubmittedIndividual(complianceToken, DTTOT_NAME, '41');
    cleanAppId = await seedSubmittedIndividual(complianceToken, CLEAN_NAME, '42');

    const detail = await api<{
      application: { status: string };
      watchlist_summary?: { compliance_blocking?: boolean } | null;
    }>(complianceToken, `/applications/${hitAppId}`);
    expect(detail.application.status).toBe('IN_REVIEW');
    expect(detail.watchlist_summary?.compliance_blocking).toBe(true);

    ops = { email: `e2e.os.dec.${ts}@test.local`, password: ROLE_PASSWORD };
    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await createOpsSupervisorViaFE(page, { email: ops.email, fullName: `E2E OpsSupervisor Dec ${ts}` });
    await page.close();
  });

  test('ComplianceLead sees Tolak but no Setujui while the DTTOT match is active', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/users/${hitAppId}`);

    await expect(
      page.getByRole('alert').filter({ hasText: 'Aplikasi memerlukan review Compliance.' }),
    ).toBeVisible();

    await expect(page.getByRole('button', { name: 'Tolak…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kembalikan untuk Revisi…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Setujui', exact: true })).toHaveCount(0);
    await expect(
      page.getByText('Aplikasi tidak dapat disetujui karena masih terdapat match DTTOT/PPPSPM aktif.'),
    ).toBeVisible();
  });

  test('Tolak sends decision REJECTED with the reason and the application becomes Ditolak', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/users/${hitAppId}`);

    await page.getByRole('button', { name: 'Tolak…' }).click();
    const decided = page.waitForResponse(
      (r) => r.url().includes(`/applications/${hitAppId}/decision`) && r.request().method() === 'PATCH',
    );
    await page.getByPlaceholder('Tuliskan alasan penolakan...').fill(REJECT_REASON);
    await page.getByRole('button', { name: 'Tolak', exact: true }).click();

    const res = await decided;
    expect(res.request().postDataJSON()).toEqual({ decision: 'REJECTED', reason: REJECT_REASON });
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();

    expect(await fetchStatus(complianceToken, hitAppId)).toBe('REJECTED');
    await expect(page.getByText('Ditolak', { exact: true })).toBeVisible();
    await expect(page.getByText('Aplikasi telah ditolak.')).toBeVisible();
    await expect(page.getByText(REJECT_REASON)).toBeVisible();
    // Terminal status — no decision affordances left.
    await expect(page.getByRole('button', { name: 'Tolak…' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Kembalikan untuk Revisi…' })).toHaveCount(0);
  });

  test('Kembalikan untuk Revisi still works on a watchlist-hit application', async ({ page }) => {
    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/users/${revisionAppId}`);

    await page.getByRole('button', { name: 'Kembalikan untuk Revisi…' }).click();
    const decided = page.waitForResponse(
      (r) => r.url().includes(`/applications/${revisionAppId}/decision`) && r.request().method() === 'PATCH',
    );
    await page.getByPlaceholder('Tuliskan alasan yang perlu diperbaiki...').fill(REVISION_REASON);
    await page.getByRole('button', { name: 'Kembalikan', exact: true }).click();

    const res = await decided;
    expect(res.request().postDataJSON()).toEqual({
      decision: 'RETURN_FOR_REVISION',
      reason: REVISION_REASON,
    });
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();

    expect(await fetchStatus(complianceToken, revisionAppId)).toBe('REVISION_REQUIRED');
    await expect(page.getByText('Perlu Perbaikan')).toBeVisible();
  });

  test('A non-blocking LOW/MEDIUM application keeps Setujui alongside Tolak', async ({ page }) => {
    await login(page, ops.email, ops.password);
    await page.goto(`/users/${cleanAppId}`);

    await expect(page.getByRole('button', { name: 'Setujui', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Tolak…' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Kembalikan untuk Revisi…' })).toBeVisible();
    await expect(
      page.getByText('Aplikasi tidak dapat disetujui karena masih terdapat match DTTOT/PPPSPM aktif.'),
    ).toHaveCount(0);
  });
});
