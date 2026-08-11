import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: Complaint Handling + Statement Refund happy path, plus a
 * handful of negative role checks.
 *
 * The tested WORKFLOW (create complaint → verify data → operation
 * investigation → finance review → statement refund → match → submit →
 * approve → resolve → close) is driven entirely through the real frontend
 * (clicks/forms). Direct backend calls are used only for test-data setup:
 * finding/creating a transfer to reference, provisioning role accounts is
 * still done through the FE admin UI, and one throwaway refund used solely
 * by a negative check (see "SETUP" section below for exactly which calls
 * are direct-API and why).
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

// Password used for every role account this test provisions.
const ROLE_PASSWORD = 'Test@12345';

type RoleName = 'ComplaintHandling' | 'OperationSupervisor' | 'FinanceStaff' | 'FinanceManager' | 'FrontDesk';
type Credential = { email: string; password: string };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── Setup-only backend calls (not the tested workflow) ──────────────────────
// Plain fetch(), not page.request — deliberately outside the browser session
// so it's visually obvious in this file which calls are precondition setup
// versus FE-driven workflow actions (all of which go through `page`).

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

type TestTransfer = {
  applicationId: string;
  displayName: string;
  transferId: string;
  transactionReference: string;
  amount: number;
};

/**
 * Option 1 from the task: reuse an existing local transfer if one is already
 * tied to an APPROVED application. Falls back to creating one (option 3 —
 * explicitly sanctioned as setup-only when going through the FE would be
 * slow/flaky) only if the local DB has none.
 */
async function resolveTestTransfer(sysAdminToken: string): Promise<TestTransfer> {
  const headers = { Authorization: `Bearer ${sysAdminToken}` };

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
      const tx = list[0];
      return {
        applicationId: String(app.id),
        displayName: app.display_name,
        transferId: String(tx.transfer_id),
        transactionReference: tx.transaction_reference,
        amount: Number(tx.amount),
      };
    }
  }

  // Nothing usable found locally — create a minimal transfer for the first
  // approved application (setup-only precondition, per task option 3).
  const first = apps[0];
  if (!first) {
    throw new Error(
      'setup: no APPROVED application exists locally to attach a test transfer to. ' +
      'Create at least one approved KYC/KYB application in the local DB first.',
    );
  }
  const amount = 250_000;
  const reference = `PW-E2E-TRF-${Date.now()}`;
  const createRes = await fetch(`${API_BASE_URL}/transfers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sysAdminToken}` },
    body: JSON.stringify({
      amount,
      beneficiary_relationship_to_sender: 'Lainnya',
      beneficiaryBankName: 'Bank Test E2E',
      sender_application_id: Number(first.id),
      beneficiaryAccountNumber: '1234567890',
      beneficiaryAccountName: 'E2E Penerima Refund',
      partner_reference_no: reference,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`setup: failed creating fallback transfer: ${createRes.status} ${await createRes.text()}`);
  }
  const created = await createRes.json();
  return {
    applicationId: String(first.id),
    displayName: first.display_name,
    transferId: String(created.id),
    transactionReference: created.partner_reference_no,
    amount,
  };
}

/** Throwaway refund used only by the FinanceManager negative check (D3/D4) — never touched by the FE. */
async function createThrowawayRefund(financeStaffToken: string, ts: string): Promise<{ id: string }> {
  const res = await fetch(`${API_BASE_URL}/statement-refunds`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${financeStaffToken}` },
    body: JSON.stringify({
      statement_date: new Date().toISOString().slice(0, 10),
      received_at: new Date().toISOString(),
      amount: 15_000,
      currency: 'IDR',
      bank_reference_no: `PW-E2E-NEG-${ts}`,
      statement_description: 'Throwaway refund for FinanceManager negative-permission check',
    }),
  });
  if (!res.ok) {
    throw new Error(`setup: failed creating throwaway refund: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

// ── FE-driven helpers (the actual tested interactions) ──────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

async function switchRole(page: Page, email: string, password: string) {
  // Sidebar's real logout control (src/components/sidebar.tsx) — a separate,
  // unused LogoutButton component elsewhere in the repo says "Logout" instead.
  const logoutButton = page.getByRole('button', { name: 'Keluar' });
  if (await logoutButton.count() > 0) {
    await logoutButton.click();
    await page.waitForURL('**/login');
  }
  await login(page, email, password);
}

/**
 * Value rendered next to a `Field` label — used to assert that actor fields show
 * a person's name and never the internal numeric user id.
 */
function actorField(page: Page, label: string) {
  return page.locator(`div:has(> div.text-xs:text-is("${label}")) > div.text-sm`).first();
}

/** Provision one internal admin user through the real Settings → "Buat Admin" form. */
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
    throw new Error(`setup: failed creating admin ${opts.email} (${opts.role}): ${res.status()} ${await res.text()}`);
  }
}

// ── Network guards (attached per-test) ──────────────────────────────────────

type NetworkGuards = {
  devtunnelHits: string[];
  nonLocalApiHits: string[];
  failedApiResponses: { url: string; status: number; body: string }[];
  complaintsListRequests: string[];
};

function attachNetworkGuards(page: Page): NetworkGuards {
  const guards: NetworkGuards = {
    devtunnelHits: [],
    nonLocalApiHits: [],
    failedApiResponses: [],
    complaintsListRequests: [],
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

    // Exact GET /api/complaints (list endpoint) — not the FE's own
    // /complaints page navigation, not /complaints/:id, not
    // /complaints/customers/search, etc.
    if (req.method() === 'GET' && pathname.includes('/api/') && /\/complaints$/.test(pathname)) {
      guards.complaintsListRequests.push(`${req.method()} ${url}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    const status = res.status();
    if (status >= 400) {
      res.text()
        .then((body) => { guards.failedApiResponses.push({ url: `${res.request().method()} ${url}`, status, body }); })
        .catch(() => { /* body unreadable — irrelevant to this check */ });
    }
  });

  return guards;
}

/**
 * `allowedStatuses` lets negative-permission tests acknowledge the exact 4xx
 * they intentionally trigger (e.g. FrontDesk's 403 on /complaints) without
 * masking genuinely unexpected failures.
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

test.describe('Complaint Handling + Statement Refund — FE-to-BE', () => {
  let ts: string;
  let testTransfer: TestTransfer;
  let users: Record<RoleName, Credential>;
  let negativeRefundId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();

    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    testTransfer = await resolveTestTransfer(sysAdminToken);

    users = {
      ComplaintHandling: { email: `e2e.ch.${ts}@test.local`, password: ROLE_PASSWORD },
      OperationSupervisor: { email: `e2e.os.${ts}@test.local`, password: ROLE_PASSWORD },
      FinanceStaff: { email: `e2e.fs.${ts}@test.local`, password: ROLE_PASSWORD },
      FinanceManager: { email: `e2e.fm.${ts}@test.local`, password: ROLE_PASSWORD },
      FrontDesk: { email: `e2e.fd.${ts}@test.local`, password: ROLE_PASSWORD },
    };

    // Provisioning the 5 role accounts through the real Settings UI — not a
    // backend shortcut, just setup that happens once ahead of the workflow tests.
    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    for (const role of Object.keys(users) as RoleName[]) {
      await createAdminViaFE(page, { email: users[role].email, fullName: `E2E ${role} ${ts}`, role });
    }
    await page.close();

    // Throwaway refund for the FinanceManager negative check only — the FE
    // never touches it in the happy path.
    const financeStaffToken = await apiLogin(users.FinanceStaff.email, users.FinanceStaff.password);
    const neg = await createThrowawayRefund(financeStaffToken, ts);
    negativeRefundId = String(neg.id);
  });

  test('Complaint Handling + Refund happy path', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    const description = `Dana belum masuk ke penerima (${ts})`;

    // 1–2. Login as ComplaintHandling.
    await login(page, users.ComplaintHandling.email, users.ComplaintHandling.password);

    // 3. Open /complaints.
    await page.goto('/complaints');
    await expect(page.getByRole('heading', { name: 'Pencatatan Pengaduan' })).toBeVisible();

    // 3. Click create complaint.
    await page.getByRole('link', { name: 'Catat Pengaduan' }).click();
    await page.waitForURL('**/complaints/new');

    // 4. Fill complaint form.
    await page.getByPlaceholder('Cari nama atau CIF customer…').fill(testTransfer.displayName);
    await page.getByRole('button', { name: new RegExp(escapeRegExp(testTransfer.displayName)) }).click();

    await page.getByPlaceholder('Cari nomor referensi transaksi…').fill(testTransfer.transactionReference);
    await page
      .getByRole('button', { name: new RegExp(escapeRegExp(testTransfer.transactionReference)) })
      .click();

    await page.getByLabel('Complaint Level').selectOption('LEVEL_2');
    await page.getByLabel('Jenis Pengaduan').selectOption('TRANSFER');
    await page.getByPlaceholder('Tuliskan kronologi dan detail keluhan customer.').fill(description);
    // No evidence upload UI exists on this form — skipped per task instructions.

    // 5. Submit.
    const createComplaintResponse = page.waitForResponse(
      (res) => res.url().endsWith('/complaints') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Catat Pengaduan' }).click();
    const createRes = await createComplaintResponse;
    expect(createRes.status(), await createRes.text().catch(() => '')).toBe(201);
    const complaint = await createRes.json();
    const complaintId = String(complaint.id);
    const complaintNo = String(complaint.complaint_no);
    // Newly generated: CMP-XXXXXXXX, exactly 12 characters.
    expect(complaintNo).toMatch(/^CMP-[A-HJ-NP-Z2-9]{8}$/);
    expect(complaintNo).toHaveLength(12);

    // 6. Assert complaint detail opens and status = OPEN.
    await page.waitForURL(`**/complaints/${complaintId}`);
    await expect(page.getByText('Open', { exact: true }).first()).toBeVisible();

    // 7. Verify data: COMPLETE + notes.
    await page.getByRole('combobox').selectOption('COMPLETE');
    await page.getByPlaceholder('Tuliskan catatan hasil pemeriksaan…').fill('Data pengaduan lengkap');
    const verifyResponse = page.waitForResponse(
      (res) => res.url().includes(`/complaints/${complaintId}/verify-data`) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan Verifikasi Data' }).click();
    const verifyRes = await verifyResponse;
    expect(verifyRes.status(), await verifyRes.text().catch(() => '')).toBe(201);

    // 8. Assert status becomes OPERATION_INVESTIGATION.
    await expect(page.getByText('Operation Investigation', { exact: true }).first()).toBeVisible();

    // 8a. The verify-data form is stage-bound: it disappears once the ticket
    // moved on, and the actor is named rather than numbered.
    await expect(page.getByRole('button', { name: 'Simpan Verifikasi Data' })).toHaveCount(0);
    await expect(
      actorField(page, 'Diverifikasi Oleh'),
    ).toHaveText(`E2E ComplaintHandling ${ts}`);
    await expect(actorField(page, 'Dibuat Oleh')).toHaveText(`E2E ComplaintHandling ${ts}`);

    // 9–10. Switch to OperationSupervisor, open the same complaint.
    await switchRole(page, users.OperationSupervisor.email, users.OperationSupervisor.password);
    await page.goto(`/complaints/${complaintId}`);

    // 11. Fill Operation Investigation: RETURNED.
    await page.getByRole('combobox').selectOption('RETURNED');
    await page
      .getByPlaceholder('Tuliskan catatan hasil pemeriksaan…')
      .fill('Dana terindikasi returned/refund berdasarkan pengecekan dashboard dan audit trail.');

    // 12. Submit.
    const investigationResponse = page.waitForResponse(
      (res) =>
        res.url().includes(`/complaints/${complaintId}/operation-investigation`) &&
        res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan Hasil Investigasi' }).click();
    const investigationRes = await investigationResponse;
    expect(investigationRes.status(), await investigationRes.text().catch(() => '')).toBe(201);

    // 13. Assert status becomes FINANCE_REVIEW.
    await expect(page.getByText('Finance Review', { exact: true }).first()).toBeVisible();

    // 13a. The ticket left OPERATION_INVESTIGATION, so OperationSupervisor keeps
    // the read-only investigation result but loses the editable form entirely.
    await expect(page.getByRole('button', { name: 'Simpan Hasil Investigasi' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Tuliskan catatan hasil pemeriksaan…')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await expect(actorField(page, 'Hasil Investigasi')).toHaveText('Returned');
    await expect(actorField(page, 'Investigasi Oleh')).toHaveText(`E2E OperationSupervisor ${ts}`);
    await expect(
      page.getByText('Anda memiliki akses baca saja pada pengaduan ini.'),
    ).toBeVisible();

    // 13b. Same lock after the ticket moves further, to REFUND_PROCESS — checked
    // at the end of the happy path via a revisit (see step 40a).

    // 14–15. Switch to FinanceStaff, open the same complaint.
    await switchRole(page, users.FinanceStaff.email, users.FinanceStaff.password);
    await page.goto(`/complaints/${complaintId}`);

    // 16. Fill Finance Review: REFUND_REQUIRED.
    await page.getByRole('combobox').selectOption('REFUND_REQUIRED');
    await page
      .getByPlaceholder('Tuliskan catatan hasil pemeriksaan…')
      .fill('Refund perlu diproses berdasarkan hasil investigasi.');

    // 17. Submit.
    const financeReviewResponse = page.waitForResponse(
      (res) => res.url().includes(`/complaints/${complaintId}/finance-review`) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan Keputusan Finance' }).click();
    const financeReviewRes = await financeReviewResponse;
    expect(financeReviewRes.status(), await financeReviewRes.text().catch(() => '')).toBe(201);

    // 18. Assert complaint status becomes REFUND_PROCESS.
    await expect(page.getByText('Refund Process', { exact: true }).first()).toBeVisible();

    // 19. Assert helper text.
    await expect(
      page.getByText('Proses refund dilakukan melalui menu Pencatatan Refund.'),
    ).toBeVisible();

    // 20. Open /statement-refunds/new (still FinanceStaff — the maker role).
    await page.goto('/statement-refunds/new');
    await expect(page.getByRole('heading', { name: 'Catat Refund Statement' })).toBeVisible();

    // 21. Create Statement Refund.
    const today = new Date().toISOString().slice(0, 10);
    const nowLocal = new Date().toISOString().slice(0, 16);
    const bankRefNo = `E2E-BANKREF-${ts}`;
    const bankAccountNo = `E2E-ACC-${ts}`;

    await page.locator('input[type="date"]').fill(today);
    await page.locator('input[type="datetime-local"]').fill(nowLocal);
    // Exact match to the transfer's amount so backend auto-matches (status MATCHED).
    await page.getByPlaceholder('100000').fill(String(testTransfer.amount));
    await page.getByPlaceholder('Bank KESH').fill('Bank Test E2E');
    await page.getByPlaceholder('1234567890').fill(bankAccountNo);
    await page.getByPlaceholder('Referensi mutasi dari rekening koran').fill(bankRefNo);
    await page.getByPlaceholder('Keterangan mutasi pada rekening koran…').fill('Refund test dari Playwright');
    // The form asks for the partner reference number, never the internal transfer ID.
    await page.getByLabel('Nomor Referensi Transaksi Awal').fill(testTransfer.transactionReference);
    // Linkage is by complaint number, never the internal complaint id.
    await page.getByLabel('Nomor Pengaduan').fill(complaintNo);
    await page
      .getByPlaceholder('Wajib diisi jika nominal refund berbeda dengan transaksi asal…')
      .fill('Refund matched dari complaint dana belum masuk.');

    // 22. Submit.
    const createRefundRequest = page.waitForRequest(
      (req) => req.url().endsWith('/statement-refunds') && req.method() === 'POST',
    );
    const createRefundResponse = page.waitForResponse(
      (res) => res.url().endsWith('/statement-refunds') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan Pencatatan Refund' }).click();

    // 22a. The payload carries the reference number, not the internal id.
    const createBody = (await createRefundRequest).postDataJSON();
    expect(createBody.original_transfer_reference_no).toBe(testTransfer.transactionReference);
    expect(createBody.original_transfer_id).toBeUndefined();
    expect(createBody.complaint_no).toBe(complaintNo);
    expect(createBody.complaint_id).toBeUndefined();

    const createRefundRes = await createRefundResponse;
    expect(createRefundRes.status(), await createRefundRes.text().catch(() => '')).toBe(201);
    const refund = await createRefundRes.json();
    const refundId = String(refund.id);

    // 23. Assert redirect to statement refund detail.
    await page.waitForURL(`**/statement-refunds/${refundId}`);

    // 23a. Detail shows the reference as the primary field; the internal id is
    // demoted to muted helper text and is no longer a primary label.
    await expect(page.getByText('Nomor Referensi Transaksi Awal')).toBeVisible();
    await expect(
      page.getByRole('link', { name: testTransfer.transactionReference }),
    ).toBeVisible();
    await expect(page.getByText(`Internal Transfer ID: ${testTransfer.transferId}`)).toBeVisible();
    await expect(page.getByText('ID Transaksi Asal')).toHaveCount(0);
    await expect(page.getByText('ID Transaksi Awal')).toHaveCount(0);

    // 23b. The linked complaint is shown by its number, not by "ID Pengaduan".
    await expect(page.getByText('Nomor Pengaduan')).toBeVisible();
    await expect(page.getByRole('link', { name: complaintNo })).toBeVisible();
    await expect(page.getByText('ID Pengaduan')).toHaveCount(0);

    // 23c. Actor fields carry names, not numeric ids.
    await expect(actorField(page, 'Dibuat Oleh')).toHaveText(`E2E FinanceStaff ${ts}`);
    await expect(actorField(page, 'Dibuat Oleh')).not.toHaveText(/^\d+$/);

    // 24. Assert refund status is MATCHED or UNMATCHED according to backend behavior.
    expect(['MATCHED', 'UNMATCHED', 'NEED_INVESTIGATION']).toContain(refund.status);

    if (refund.status === 'UNMATCHED') {
      // 25. Use the Match Refund modal.
      await page.getByRole('button', { name: 'Match ke Transaksi' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByLabel('Nomor Referensi Transaksi Awal').fill(testTransfer.transactionReference);
      await dialog.getByLabel('Nomor Pengaduan (opsional)').fill(complaintNo);
      await dialog.getByLabel('Catatan Investigasi').fill('Manual match test');

      // 26. Submit match.
      const matchResponse = page.waitForResponse(
        (res) => res.url().includes(`/statement-refunds/${refundId}/match`) && res.request().method() === 'POST',
      );
      await dialog.getByRole('button', { name: 'Cocokkan' }).click();
      const matchRes = await matchResponse;
      expect(matchRes.status(), await matchRes.text().catch(() => '')).toBe(201);

      // 27. Assert status becomes MATCHED or NEED_INVESTIGATION.
      await expect(
        page.getByText(/Sudah Dicocokkan|Perlu Investigasi/).first(),
      ).toBeVisible();
    } else {
      await expect(
        page.getByText(refund.status === 'MATCHED' ? 'Sudah Dicocokkan' : 'Perlu Investigasi', { exact: true }).first(),
      ).toBeVisible();
    }

    // 28. Click "Ajukan Approval".
    await page.getByRole('button', { name: 'Ajukan Approval' }).click();
    // 29. Confirm.
    const submitResponse = page.waitForResponse(
      (res) => res.url().includes(`/statement-refunds/${refundId}/submit`) && res.request().method() === 'POST',
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Ajukan' }).click();
    const submitRes = await submitResponse;
    expect(submitRes.status(), await submitRes.text().catch(() => '')).toBe(201);

    // 30. Assert status becomes PENDING_APPROVAL.
    await expect(page.getByText('Menunggu Approval Finance', { exact: true }).first()).toBeVisible();

    // 31–32. Switch to FinanceManager, open the same statement refund.
    await switchRole(page, users.FinanceManager.email, users.FinanceManager.password);
    await page.goto(`/statement-refunds/${refundId}`);

    // 33. Click "Setujui Refund".
    await page.getByRole('button', { name: 'Setujui Refund' }).click();
    // 34. Fill finance_notes.
    await page.getByRole('dialog').getByLabel('Catatan Finance (opsional)').fill('Refund telah diverifikasi dan disetujui.');
    // 35. Confirm approval.
    const decisionResponse = page.waitForResponse(
      (res) => res.url().includes(`/statement-refunds/${refundId}/decision`) && res.request().method() === 'POST',
    );
    await page.getByRole('dialog').getByRole('button', { name: 'Setujui' }).click();
    const decisionRes = await decisionResponse;
    expect(decisionRes.status(), await decisionRes.text().catch(() => '')).toBe(201);

    // 36. Assert refund status becomes APPROVED.
    await expect(page.getByText('Disetujui', { exact: true }).first()).toBeVisible();

    // 37. Assert balance posting message.
    await expect(
      page.getByText(
        'Refund sudah disetujui. Posting saldo partner menunggu integrasi/sistem balance eksternal.',
      ),
    ).toBeVisible();

    // 38. Open linked complaint detail.
    await page.goto(`/complaints/${complaintId}`);

    // 39. Assert complaint is not CLOSED automatically — still Refund Process.
    await expect(page.getByText('Refund Process', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Closed', { exact: true })).toHaveCount(0);

    // 40. Assert Refund Terkait section contains the statement refund.
    await expect(page.getByRole('heading', { name: 'Refund Terkait' })).toBeVisible();
    await expect(page.getByText(refund.refund_no)).toBeVisible();

    // 40a. Promised in 13b: at REFUND_PROCESS the OperationSupervisor still sees
    // the investigation result read-only, with no way to overwrite it.
    await switchRole(page, users.OperationSupervisor.email, users.OperationSupervisor.password);
    await page.goto(`/complaints/${complaintId}`);
    await expect(page.getByText('Refund Process', { exact: true }).first()).toBeVisible();
    await expect(actorField(page, 'Hasil Investigasi')).toHaveText('Returned');
    await expect(page.getByRole('button', { name: 'Simpan Hasil Investigasi' })).toHaveCount(0);
    await expect(page.getByPlaceholder('Tuliskan catatan hasil pemeriksaan…')).toHaveCount(0);
    await expect(page.getByRole('combobox')).toHaveCount(0);

    // 41–42. Switch to ComplaintHandling, open the same complaint.
    await switchRole(page, users.ComplaintHandling.email, users.ComplaintHandling.password);
    await page.goto(`/complaints/${complaintId}`);

    // 43. Click "Selesaikan Pengaduan" flow — fill then submit (no modal on this page).
    await page.getByPlaceholder('Ringkasan penyelesaian pengaduan…').fill('Refund telah disetujui oleh Finance Manager.');
    await page
      .getByPlaceholder('Isi komunikasi yang sudah disampaikan ke nasabah / merchant…')
      .fill('Pengguna telah diinformasikan terkait hasil penyelesaian.');

    // 45. Submit.
    const resolveResponse = page.waitForResponse(
      (res) => res.url().includes(`/complaints/${complaintId}/resolve`) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Selesaikan Pengaduan' }).click();
    const resolveRes = await resolveResponse;
    expect(resolveRes.status(), await resolveRes.text().catch(() => '')).toBe(201);

    // 46. Assert status becomes RESOLVED.
    await expect(page.getByText('Resolved', { exact: true }).first()).toBeVisible();

    // 47. Click "Tutup Pengaduan" flow.
    await page
      .getByPlaceholder('Alasan / ringkasan penutupan tiket…')
      .fill('Pengaduan ditutup setelah informasi penyelesaian disampaikan.');

    // 49. Submit.
    const closeResponse = page.waitForResponse(
      (res) => res.url().includes(`/complaints/${complaintId}/close`) && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Tutup Pengaduan' }).click();
    const closeRes = await closeResponse;
    expect(closeRes.status(), await closeRes.text().catch(() => '')).toBe(201);

    // 50. Assert status becomes CLOSED.
    await expect(page.getByText('Closed', { exact: true }).first()).toBeVisible();

    // 51. Assert no mutation buttons remain.
    await expect(page.getByRole('button', { name: 'Simpan Verifikasi Data' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Selesaikan Pengaduan' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tutup Pengaduan' })).toHaveCount(0);
    await expect(page.getByText('Pengaduan sudah ditutup — halaman ini hanya dapat dibaca.')).toBeVisible();

    await assertNoNetworkViolations(page, guards);
  });

  /** Fill the mandatory create-form fields, leaving the linkage section empty. */
  async function fillRefundBasics(page: Page, bankRefNo: string, amount: number) {
    await page.locator('input[type="date"]').fill(new Date().toISOString().slice(0, 10));
    await page.locator('input[type="datetime-local"]').fill(new Date().toISOString().slice(0, 16));
    await page.getByPlaceholder('100000').fill(String(amount));
    await page.getByPlaceholder('Bank KESH').fill('Bank Test E2E');
    await page.getByPlaceholder('1234567890').fill(`E2E-ACC-${bankRefNo}`);
    await page.getByPlaceholder('Referensi mutasi dari rekening koran').fill(bankRefNo);
  }

  test('unknown reference number shows the backend message', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    await login(page, users.FinanceStaff.email, users.FinanceStaff.password);
    await page.goto('/statement-refunds/new');

    await fillRefundBasics(page, `E2E-BADREF-${ts}`, 25_000);

    // The example shown is the new short format…
    const transferRefInput = page.getByLabel('Nomor Referensi Transaksi Awal');
    await expect(transferRefInput).toHaveAttribute('placeholder', 'TRF-A8K3P9Q2');
    // …but a legacy long reference must still go in whole, never truncated to 12.
    const legacyRef = `KESH-TRF-TIDAK-ADA-${ts}`;
    await transferRefInput.fill(legacyRef);
    await expect(transferRefInput).toHaveValue(legacyRef);

    await page.getByRole('button', { name: 'Simpan Pencatatan Refund' }).click();
    await expect(
      page.getByText('Nomor referensi transaksi awal tidak ditemukan.').first(),
    ).toBeVisible();
    // Nothing was created — still on the form.
    await expect(page).toHaveURL(/\/statement-refunds\/new$/);

    await assertNoNetworkViolations(page, guards, [400]);
  });

  test('unknown complaint number shows the backend message', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    await login(page, users.FinanceStaff.email, users.FinanceStaff.password);
    await page.goto('/statement-refunds/new');

    await fillRefundBasics(page, `E2E-BADCMP-${ts}`, 26_000);

    const complaintNoInput = page.getByLabel('Nomor Pengaduan');
    await expect(complaintNoInput).toHaveAttribute('placeholder', 'CMP-M4X7B2D9');
    const legacyNo = `KESH-CMP-TIDAK-ADA-${ts}`;
    await complaintNoInput.fill(legacyNo);
    await expect(complaintNoInput).toHaveValue(legacyNo);

    await page.getByRole('button', { name: 'Simpan Pencatatan Refund' }).click();
    await expect(page.getByText('Nomor pengaduan tidak ditemukan.').first()).toBeVisible();
    await expect(page).toHaveURL(/\/statement-refunds\/new$/);

    await assertNoNetworkViolations(page, guards, [400]);
  });

  test('unmatched refund can be matched by reference number', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    await login(page, users.FinanceStaff.email, users.FinanceStaff.password);
    await page.goto('/statement-refunds/new');

    // Created without any linkage → UNMATCHED.
    await fillRefundBasics(page, `E2E-MATCHREF-${ts}`, testTransfer.amount);
    const createResponse = page.waitForResponse(
      (res) => res.url().endsWith('/statement-refunds') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Simpan Pencatatan Refund' }).click();
    const created = await (await createResponse).json();
    expect(created.status).toBe('UNMATCHED');
    await page.waitForURL(`**/statement-refunds/${created.id}`);

    // Match through the modal, using the partner reference number.
    await page.getByRole('button', { name: 'Match ke Transaksi' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Nomor Referensi Transaksi Awal').fill(testTransfer.transactionReference);
    await dialog.getByLabel('Catatan Investigasi').fill('Match manual lewat nomor referensi.');

    const matchRequest = page.waitForRequest(
      (req) => req.url().includes(`/statement-refunds/${created.id}/match`) && req.method() === 'POST',
    );
    const matchResponse = page.waitForResponse(
      (res) => res.url().includes(`/statement-refunds/${created.id}/match`) && res.request().method() === 'POST',
    );
    await dialog.getByRole('button', { name: 'Cocokkan' }).click();

    const matchBody = (await matchRequest).postDataJSON();
    expect(matchBody.original_transfer_reference_no).toBe(testTransfer.transactionReference);
    expect(matchBody.original_transfer_id).toBeUndefined();

    const matchRes = await matchResponse;
    expect(matchRes.status(), await matchRes.text().catch(() => '')).toBe(201);

    await expect(page.getByText(/Sudah Dicocokkan|Perlu Investigasi/).first()).toBeVisible();
    await expect(
      page.getByRole('link', { name: testTransfer.transactionReference }),
    ).toBeVisible();

    // The list shows the reference, not the internal id.
    await page.goto('/statement-refunds');
    await expect(
      page.getByRole('link', { name: testTransfer.transactionReference }).first(),
    ).toBeVisible();

    await assertNoNetworkViolations(page, guards);
  });

  // ── D. Negative checks ─────────────────────────────────────────────────────

  test('FrontDesk cannot access /complaints', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    await login(page, users.FrontDesk.email, users.FrontDesk.password);
    await page.goto('/complaints');
    await expect(
      page.getByText('Anda tidak memiliki akses ke halaman Pencatatan Pengaduan.'),
    ).toBeVisible();

    // The list page's data-fetch effect is now gated by role, so an
    // unauthorized visit must never even call GET /api/complaints.
    await page.waitForTimeout(250); // give a stray fetch a moment to appear, if any
    expect(
      guards.complaintsListRequests,
      `FrontDesk must not trigger GET /api/complaints:\n${guards.complaintsListRequests.join('\n')}`,
    ).toHaveLength(0);

    await assertNoNetworkViolations(page, guards);
  });

  test('FinanceManager cannot create Statement Refund', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    await login(page, users.FinanceManager.email, users.FinanceManager.password);
    await page.goto('/statement-refunds/new');
    await expect(page.getByText('Akses ditolak')).toBeVisible();
    await expect(
      page.getByText(
        'Pencatatan refund hanya dapat dibuat oleh Finance Staff. Finance Manager berperan sebagai approver, bukan pembuat catatan.',
      ),
    ).toBeVisible();
    await assertNoNetworkViolations(page, guards);
  });

  test('FinanceManager sees no match/submit/approve actions outside PENDING_APPROVAL', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    await login(page, users.FinanceManager.email, users.FinanceManager.password);
    // Throwaway refund created in beforeAll — status UNMATCHED (no transfer linked).
    await page.goto(`/statement-refunds/${negativeRefundId}`);

    // D2/D3: cannot create/match/submit.
    await expect(page.getByRole('button', { name: 'Match ke Transaksi' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ajukan Approval' })).toHaveCount(0);
    // D4: approve/reject only appear once the refund reaches PENDING_APPROVAL.
    await expect(page.getByRole('button', { name: 'Setujui Refund' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Tolak Refund' })).toHaveCount(0);
    await expect(page.getByText('Anda memiliki akses baca saja pada refund ini.')).toBeVisible();

    await assertNoNetworkViolations(page, guards);
  });
});
