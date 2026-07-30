import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: Bulk Transfer's batch-level "No. Referensi Bulk"
 * (`bulk_reference_no`) field.
 *
 * The tested WORKFLOW (open bulk form → pick sender → fill beneficiary row →
 * validate required reference → submit → success panel → list display →
 * detail display → duplicate rejection) is driven entirely through the real
 * frontend (clicks/forms). Direct backend calls are used only for test-data
 * setup: logging in as SystemAdmin and finding an existing APPROVED
 * application to use as the bulk sender (see "SETUP" section below) — never
 * to create/approve KYC/KYB applications, which this spec must not touch.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

// Password used for the FrontDesk account this test provisions.
const ROLE_PASSWORD = 'Test@12345';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Setup-only backend calls (not the tested workflow) ──────────────────────
// Plain fetch(), not page.request — deliberately outside the browser session
// so it's visually obvious which calls are precondition setup versus
// FE-driven workflow actions (all of which go through `page`).

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

/**
 * Option 1 from the task: reuse an existing local APPROVED application as
 * the bulk transfer sender. This spec deliberately does NOT create/approve
 * a KYC/KYB application itself (out of scope — "K. Do not change: KYC/KYB").
 * If none exists locally, fail loudly with what's missing instead of faking it.
 */
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
      'setup: no APPROVED application with a display_name exists locally. ' +
      'The bulk transfer sender picker (GET /transfers/senders/search) requires at least one ' +
      'APPROVED KYC/KYB application. Seed one in the local DB before running this spec — see e2e/README.md.',
    );
  }
  return { applicationId: String(found.id), displayName: found.display_name };
}

// ── FE-driven helpers (the actual tested interactions) ──────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

/** Provision the FrontDesk test user through the real Settings → "Buat Admin" form. */
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

// ── Network guards (attached per-test) ──────────────────────────────────────

type NetworkGuards = {
  devtunnelHits: string[];
  nonLocalApiHits: string[];
  failedApiResponses: { url: string; status: number; body: string }[];
  bulkPostRequests: string[];
};

function attachNetworkGuards(page: Page): NetworkGuards {
  const guards: NetworkGuards = {
    devtunnelHits: [],
    nonLocalApiHits: [],
    failedApiResponses: [],
    bulkPostRequests: [],
  };

  page.on('request', (req) => {
    const url = req.url();
    if (/devtunnels\.ms/i.test(url)) {
      guards.devtunnelHits.push(`${req.method()} ${url}`);
    }

    let pathname = '';
    try { pathname = new URL(url).pathname; } catch { /* ignore */ }

    if (pathname.includes('/api/')) {
      let hostname = '';
      try { hostname = new URL(url).hostname; } catch { /* ignore */ }
      if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
        guards.nonLocalApiHits.push(`${req.method()} ${url}`);
      }
    }

    if (req.method() === 'POST' && pathname.includes('/api/') && /\/transfers\/bulk$/.test(pathname)) {
      guards.bulkPostRequests.push(`${req.method()} ${url}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const status = res.status();
    if (status >= 400) {
      let pathname = '';
      try { pathname = new URL(url).pathname; } catch { /* ignore */ }
      // The duplicate-bulk_reference_no scenario intentionally triggers a 409
      // on this endpoint — that's an assertion target, not a real failure, so
      // don't log it as one. Still recorded in failedApiResponses below so
      // assertNoNetworkViolations' allowedStatuses check still sees it.
      const isExpectedDuplicateConflict =
        status === 409 && res.request().method() === 'POST' && /\/transfers\/bulk$/.test(pathname);

      res.text()
        .then((body) => {
          guards.failedApiResponses.push({ url: `${res.request().method()} ${url}`, status, body });
          if (!isExpectedDuplicateConflict) {
            console.log(`[e2e] failed API response: ${res.request().method()} ${url} -> ${status}\n${body}`);
          }
        })
        .catch(() => { /* body unreadable — irrelevant to this check */ });
    }
  });

  return guards;
}

/**
 * `allowedStatuses` lets the duplicate-reference scenario acknowledge the
 * exact 409 it intentionally triggers without masking genuinely unexpected
 * failures.
 */
async function assertNoNetworkViolations(
  page: Page,
  guards: NetworkGuards,
  allowedStatuses: number[] = [],
) {
  await page.waitForTimeout(250); // let trailing response-body reads resolve
  expect(guards.devtunnelHits, `Requests hit a devtunnel host:\n${guards.devtunnelHits.join('\n')}`).toHaveLength(0);
  expect(
    guards.nonLocalApiHits,
    `API requests did not target localhost:\n${guards.nonLocalApiHits.join('\n')}`,
  ).toHaveLength(0);
  const unexpected = guards.failedApiResponses.filter((f) => !allowedStatuses.includes(f.status));
  expect(
    unexpected,
    `Unexpected failed API responses:\n${JSON.stringify(unexpected, null, 2)}`,
  ).toHaveLength(0);
}

// ── Suite ────────────────────────────────────────────────────────────────────

test.describe('Bulk Transfer — No. Referensi Bulk — FE-to-BE', () => {
  let ts: string;
  let sender: ApprovedSender;
  let frontDesk: { email: string; password: string };

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();

    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    sender = await resolveApprovedSender(sysAdminToken);

    frontDesk = { email: `e2e.fd.bulk.${ts}@test.local`, password: ROLE_PASSWORD };

    // Provisioning the FrontDesk account through the real Settings UI — not a
    // backend shortcut, just setup that happens once ahead of the workflow test.
    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await createFrontDeskViaFE(page, { email: frontDesk.email, fullName: `E2E FrontDesk Bulk ${ts}` });
    await page.close();
  });

  test('Required validation, success with bulk_reference_no, list/detail display, duplicate rejection', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    const bulkReferenceNo = `BULK-E2E-${ts}`;
    const beneficiaryName = `E2E Bulk Penerima ${ts}`;

    // 1. Login as FrontDesk.
    await login(page, frontDesk.email, frontDesk.password);

    // 2. Open /transfers/bulk.
    await page.goto('/transfers/bulk');
    await expect(page.getByRole('heading', { name: 'Bulk Transfer' })).toBeVisible();

    // 3. Select sender/customer.
    await page.getByPlaceholder('Cari nama atau CIF pengirim…').fill(sender.displayName);
    await page.getByRole('button', { name: new RegExp(escapeRegExp(sender.displayName)) }).click();

    // 5. Fill one beneficiary row with valid values (row index 0).
    await page.locator('#row-account-name-0').fill(beneficiaryName);
    await page.locator('#row-bank-code-0').selectOption({ index: 1 }); // skip "Pilih bank…" placeholder
    await page.locator('#row-account-number-0').fill('1234567890');
    await page.locator('#row-amount-0').fill('150000');
    await page.locator('#row-purpose-0').fill('Pembayaran vendor E2E');
    await page.locator('#row-relationship-0').selectOption('Lainnya');

    // ── Scenario D: No. Referensi Bulk required ─────────────────────────────
    // 4/6/7. Leave "No. Referensi Bulk" empty and try to submit. The FE
    // enforces this by disabling the submit button (the acceptance criteria
    // allows "blocked OR validation error shown" — this implementation blocks).
    const submitButton = page.getByRole('button', { name: /^Buat 1 Transfer$/ });
    await expect(submitButton).toBeDisabled();
    await page.waitForTimeout(250); // let any stray fetch appear, if any

    // 8. Assert POST /api/transfers/bulk is NOT called.
    expect(
      guards.bulkPostRequests,
      `POST /transfers/bulk must not fire while No. Referensi Bulk is empty:\n${guards.bulkPostRequests.join('\n')}`,
    ).toHaveLength(0);

    // ── Scenario E: successful bulk transfer with bulk_reference_no ────────
    // 1. Fill "No. Referensi Bulk" with a unique value.
    await page.locator('#bulk-reference-no').fill(bulkReferenceNo);
    await expect(submitButton).toBeEnabled();

    // 3-4. Submit and wait for the POST /api/transfers/bulk response.
    const bulkPostResponse = page.waitForResponse(
      (res) => res.url().includes('/transfers/bulk') && res.request().method() === 'POST',
    );
    await submitButton.click();
    const bulkRes = await bulkPostResponse;
    expect(bulkRes.ok(), await bulkRes.text().catch(() => '')).toBeTruthy();

    // 5. Assert request payload.
    const reqBody = bulkRes.request().postDataJSON() as {
      sender_application_id: number;
      bulk_reference_no: string;
      items: unknown[];
    };
    expect(reqBody.sender_application_id).toBe(Number(sender.applicationId));
    expect(reqBody.bulk_reference_no).toBe(bulkReferenceNo);
    expect(Array.isArray(reqBody.items)).toBe(true);
    expect(reqBody.items).toHaveLength(1);

    // 6. Assert response body.
    const respBody = (await bulkRes.json()) as {
      batch_id: number | string;
      batch_no: string;
      bulk_reference_no: string;
      total_count: number;
    };
    expect(respBody.batch_no).toBeTruthy();
    expect(respBody.bulk_reference_no).toBe(bulkReferenceNo);
    expect(respBody.total_count).toBe(1);

    // 7. Assert success panel/message.
    await expect(page.getByRole('heading', { name: 'Bulk Transfer Berhasil' })).toBeVisible();
    await expect(page.getByText('Bulk transfer berhasil dibuat.', { exact: true })).toBeVisible();
    await expect(page.getByText('Batch No:')).toBeVisible();
    await expect(page.getByText(respBody.batch_no)).toBeVisible();
    await expect(page.getByText('No. Referensi Bulk:')).toBeVisible();
    await expect(page.getByText(respBody.bulk_reference_no)).toBeVisible();
    await expect(page.getByText('Total transaksi: 1')).toBeVisible();

    // ── Scenario G: list display ────────────────────────────────────────────
    // Bulk-created transfers live under the "Bulk Transfer" tab (one row per
    // batch) — the "Single Transfer" tab (transfer_mode=single) never shows them.
    await page.getByRole('button', { name: 'Ke Daftar Transfer' }).click();
    await page.waitForURL('**/transfers');
    await page.getByRole('tab', { name: 'Bulk Transfer' }).click();
    // Bump page size so the newly created batch isn't pushed off page 1 by
    // pre-existing local data (only the Pagination page-size <select> renders
    // on this tab — the status filter <select> is Single-tab only).
    await page.locator('select').first().selectOption('100');

    const tableContainer = page.locator('div.rounded-2xl.border.overflow-x-auto');
    const batchRow = tableContainer.locator('div.border-t').filter({ hasText: bulkReferenceNo });
    await expect(batchRow).toHaveCount(1);
    await expect(batchRow.getByText(respBody.batch_no)).toBeVisible();
    await expect(batchRow.getByText(bulkReferenceNo)).toBeVisible();

    // 8-9. Open the batch detail, then the created transfer's detail — both
    // through the FE (click "Detail").
    await batchRow.getByRole('link', { name: 'Detail' }).click();
    await page.waitForURL(/\/transfers\/bulk-batches\/[^/]+$/);
    // batch_no also appears in the <h1> ("Bulk Batch <batch_no>") — scope to
    // the summary Field's value div specifically to avoid a strict-mode clash.
    const batchFieldValue = page.locator('div.text-sm.font-medium.break-words');
    await expect(page.getByText('Batch No', { exact: true })).toBeVisible();
    await expect(batchFieldValue.filter({ hasText: respBody.batch_no })).toBeVisible();
    await expect(page.getByText('No. Referensi Bulk', { exact: true })).toBeVisible();
    await expect(batchFieldValue.filter({ hasText: respBody.bulk_reference_no })).toBeVisible();

    await page.getByRole('link', { name: 'Detail' }).first().click();
    await page.waitForURL(/\/transfers\/[^/]+$/);
    await expect(page.getByText('Batch No', { exact: true })).toBeVisible();
    await expect(page.getByText(respBody.batch_no)).toBeVisible();
    await expect(page.getByText('No. Referensi Bulk', { exact: true })).toBeVisible();
    await expect(page.getByText(respBody.bulk_reference_no)).toBeVisible();

    // ── Scenario F: duplicate bulk_reference_no ─────────────────────────────
    // 1-2. Return to /transfers/bulk, select the same sender.
    await page.goto('/transfers/bulk');
    await page.getByPlaceholder('Cari nama atau CIF pengirim…').fill(sender.displayName);
    await page.getByRole('button', { name: new RegExp(escapeRegExp(sender.displayName)) }).click();

    // 3-4. Use the exact same No. Referensi Bulk, fill one valid row.
    await page.locator('#bulk-reference-no').fill(bulkReferenceNo);
    await page.locator('#row-account-name-0').fill(`${beneficiaryName} 2`);
    await page.locator('#row-bank-code-0').selectOption({ index: 1 });
    await page.locator('#row-account-number-0').fill('1234567891');
    await page.locator('#row-amount-0').fill('150000');
    await page.locator('#row-purpose-0').fill('Pembayaran vendor E2E duplikat');
    await page.locator('#row-relationship-0').selectOption('Lainnya');

    // 5-6. Submit, assert backend returns 409.
    const dupResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/transfers/bulk') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: /^Buat 1 Transfer$/ }).click();
    const dupRes = await dupResponsePromise;
    expect(dupRes.status(), await dupRes.text().catch(() => '')).toBe(409);

    // 7. Assert user-friendly message (scoped to the persistent error banner —
    // the toast shows the identical text too, but auto-dismisses).
    await expect(
      page.getByRole('main').getByText('No. Referensi Bulk sudah pernah digunakan untuk pengguna jasa ini.'),
    ).toBeVisible();

    await assertNoNetworkViolations(page, guards, [409]);
  });
});
