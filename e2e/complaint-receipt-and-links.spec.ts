import { test, expect, type Page, type Browser } from '@playwright/test';

/**
 * FE-to-BE E2E: the complaint receipt prints two different documents depending
 * on `receipt_state`, and complaint detail carries its own linked customer /
 * linked transaction summaries.
 *
 * The summaries matter because ComplaintHandling is deliberately 403 on
 * /transfers/:id — it has to see the transaction from the complaint response
 * alone, and must not be offered a link it cannot follow.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

const ROLE_PASSWORD = 'Test@12345';

/** Newly generated references are short — legacy long ones still exist in the DB. */
const NEW_COMPLAINT_REF = /^CMP-[A-HJ-NP-Z2-9]{8}$/;

const OPEN_FOOTER =
  'Pengaduan telah diterima dan akan diproses sesuai prosedur internal KESH. ' +
  'Nomor pengaduan ini dapat digunakan untuk pengecekan status.';
const CLOSED_FOOTER =
  'Pengaduan telah diselesaikan/ditutup sesuai hasil penanganan. ' +
  'Simpan bukti ini sebagai arsip penyelesaian pengaduan.';

const CLOSED_STATUSES = ['RESOLVED', 'CLOSED', 'REJECTED'];

type ComplaintRow = {
  id: number | string;
  complaint_no?: string | null;
  status?: string | null;
  transfer_id?: number | string | null;
};

async function apiLogin(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`setup: login failed for ${email}: ${res.status}`);
  return (await res.json()).access_token;
}

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

/** The card body under a given section heading on the complaint detail page. */
function card(page: Page, title: string) {
  return page.locator('div.rounded-2xl').filter({ has: page.getByRole('heading', { name: title }) });
}

test.describe.configure({ mode: 'serial' });

test.describe('Complaint receipt state & linked summaries', () => {
  let sysAdminToken: string;
  let complaintHandling: { email: string; password: string };
  let openComplaint: ComplaintRow | undefined;
  let closedComplaint: ComplaintRow | undefined;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    const ts = Date.now().toString();
    sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);

    // Picking existing complaints is test-data selection, not the tested flow.
    const body = await (
      await fetch(`${API_BASE_URL}/complaints?limit=200`, {
        headers: { Authorization: `Bearer ${sysAdminToken}` },
      })
    ).json();
    const rows: ComplaintRow[] = body.data ?? (Array.isArray(body) ? body : []);
    // Prefer one linked to a transfer, so the transaction card has content.
    openComplaint =
      rows.find((c) => c.complaint_no && !CLOSED_STATUSES.includes(c.status ?? '') && c.transfer_id) ??
      rows.find((c) => c.complaint_no && !CLOSED_STATUSES.includes(c.status ?? ''));
    closedComplaint = rows.find((c) => c.complaint_no && CLOSED_STATUSES.includes(c.status ?? ''));

    complaintHandling = { email: `e2e.cmp.link.${ts}@test.local`, password: ROLE_PASSWORD };
    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await page.getByLabel('Email').fill(complaintHandling.email);
    await page.getByLabel('Nama').fill(`E2E ComplaintHandling Link ${ts}`);
    await page.getByLabel('Role').selectOption('ComplaintHandling');
    await page.getByLabel('Password awal').fill(ROLE_PASSWORD);
    const created = page.waitForResponse(
      (res) => res.url().includes('/users/admins') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Buat Admin' }).click();
    const res = await created;
    if (res.status() !== 201) {
      throw new Error(`setup: failed creating ComplaintHandling: ${res.status()} ${await res.text()}`);
    }
    await page.close();
  });

  test('an open complaint prints the intake receipt', async ({ page }) => {
    test.skip(!openComplaint, 'no open complaint with a complaint_no exists locally');

    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/complaints/${openComplaint!.id}/receipt`);

    await expect(page.getByRole('heading', { name: 'Bukti Penerimaan Pengaduan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bukti Penyelesaian Pengaduan' })).toHaveCount(0);
    await expect(page.getByText(OPEN_FOOTER)).toBeVisible();
    await expect(page.getByText(CLOSED_FOOTER)).toHaveCount(0);

    const signatures = page.locator('[data-receipt-signatures]');
    await expect(signatures).toContainText('Petugas Penerima');
    await expect(signatures).toContainText('Pelapor/Customer');
    await expect(signatures).not.toContainText('Petugas Penyelesaian');
  });

  test('a resolved/closed/rejected complaint prints the settlement receipt', async ({ page }) => {
    test.skip(!closedComplaint, 'no RESOLVED/CLOSED/REJECTED complaint exists locally');

    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/complaints/${closedComplaint!.id}/receipt`);

    await expect(page.getByRole('heading', { name: 'Bukti Penyelesaian Pengaduan' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Bukti Penerimaan Pengaduan' })).toHaveCount(0);
    await expect(page.getByText(CLOSED_FOOTER)).toBeVisible();
    await expect(page.getByText(OPEN_FOOTER)).toHaveCount(0);

    const signatures = page.locator('[data-receipt-signatures]');
    await expect(signatures).toContainText('Petugas Penyelesaian');
    await expect(signatures).toContainText('Pelapor/Customer');

    // The settlement copy still has to fit the same 80mm grid.
    const overflow = await page.evaluate(() => {
      const r = document.querySelector('.receipt') as HTMLElement | null;
      return r ? r.scrollWidth - r.clientWidth : -1;
    });
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('ComplaintHandling reads customer and transaction from the complaint itself', async ({ page }) => {
    test.skip(!openComplaint, 'no open complaint with a complaint_no exists locally');

    // The detail response is what the cards render — assert it actually carries
    // the summaries, so a passing UI check cannot be a false positive.
    const detail = await (
      await fetch(`${API_BASE_URL}/complaints/${openComplaint!.id}`, {
        headers: { Authorization: `Bearer ${sysAdminToken}` },
      })
    ).json();
    expect(detail.receipt_state).toBe('OPEN');
    expect(detail.linked_customer, JSON.stringify(detail).slice(0, 300)).toBeTruthy();

    await login(page, complaintHandling.email, complaintHandling.password);
    await page.goto(`/complaints/${openComplaint!.id}`);

    const customerCard = card(page, 'Data Pengguna Jasa');
    await expect(customerCard).toBeVisible();
    await expect(customerCard).toContainText(String(detail.linked_customer.customer_name));

    const transactionCard = card(page, 'Data Transaksi Terkait');
    await expect(transactionCard).toBeVisible();
    if (detail.linked_transfer) {
      await expect(transactionCard).toContainText(String(detail.linked_transfer.partner_reference_no));
      // Reference, never the internal numeric transfer id.
      await expect(transactionCard).not.toContainText(`#${detail.linked_transfer.transfer_id}`);
      // No link is offered — ComplaintHandling is 403 on that route.
      await expect(transactionCard.getByRole('link')).toHaveCount(0);
    } else {
      await expect(transactionCard).toContainText('tidak tertaut ke transaksi');
    }

    // Confirm the 403 the FE is avoiding is real, not a guess.
    const forbidden = await fetch(`${API_BASE_URL}/transfers/${openComplaint!.transfer_id ?? 1}`, {
      headers: { Authorization: `Bearer ${await apiLogin(complaintHandling.email, ROLE_PASSWORD)}` },
    });
    expect(forbidden.status).toBe(403);
  });

  test('ComplaintHandling opens full customer data from the complaint', async ({ page }) => {
    test.skip(!openComplaint, 'no open complaint with a complaint_no exists locally');

    await login(page, complaintHandling.email, complaintHandling.password);
    await page.goto(`/complaints/${openComplaint!.id}`);

    const customerCard = card(page, 'Data Pengguna Jasa');
    // The detail call must be the one ComplaintHandling is actually allowed to
    // make — /applications/:id carries no @Roles, unlike /transfers/:id.
    const detailCall = page.waitForResponse(
      (r) => /\/applications\/\d+$/.test(new URL(r.url()).pathname) && r.request().method() === 'GET',
    );
    await customerCard.getByRole('button').first().click();
    const detailRes = await detailCall;
    expect(detailRes.status(), await detailRes.text().catch(() => '')).toBe(200);

    const modal = page.getByRole('dialog', { name: 'Data Pengguna Jasa' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('Memuat data pengguna jasa…')).toHaveCount(0);
    await expect(modal).toContainText('Identitas Pengajuan');
    await expect(modal).toContainText('Alamat');
    // Real content, not an empty shell of em dashes.
    const detail = await detailRes.json();
    const name = detail.person?.full_name ?? detail.business?.legal_name;
    if (name) await expect(modal).toContainText(String(name));

    await modal.getByRole('button', { name: 'Tutup' }).click();
    await expect(modal).toHaveCount(0);
  });

  test('a role that may open transfers still gets the link', async ({ page }) => {
    test.skip(!openComplaint?.transfer_id, 'no open complaint linked to a transfer exists locally');

    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/complaints/${openComplaint!.id}`);

    await expect(
      card(page, 'Data Transaksi Terkait').getByRole('link', { name: /TRF-|KESH-TRF-/ }),
    ).toBeVisible();
  });

  test('newly created complaints get a short reference', async ({ page }) => {
    // Created through the API: this asserts the generated format, and the
    // create-through-the-UI path is already covered by complaint-refund-flow.
    const customers = await (
      await fetch(`${API_BASE_URL}/applications?status=APPROVED&limit=5`, {
        headers: { Authorization: `Bearer ${sysAdminToken}` },
      })
    ).json();
    const apps = customers.data ?? (Array.isArray(customers) ? customers : []);
    test.skip(apps.length === 0, 'no APPROVED application exists locally to attach a complaint to');

    const res = await fetch(`${API_BASE_URL}/complaints`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sysAdminToken}` },
      body: JSON.stringify({
        customer_application_id: Number(apps[0].id),
        transaction_reference: `E2E-REF-${Date.now()}`,
        category: 'SERVICE',
        channel: 'WALK_IN',
        priority: 'LOW',
        complaint_level: 'LEVEL_1',
        complaint_notes: 'E2E short reference format check.',
      }),
    });
    const rawBody = await res.text();
    expect(res.status, rawBody).toBe(201);
    const created = JSON.parse(rawBody);
    expect(created.complaint_no).toMatch(NEW_COMPLAINT_REF);
    expect(String(created.complaint_no)).toHaveLength(12);

    // And it renders as-is on the detail page.
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/complaints/${created.id}`);
    await expect(page.getByRole('heading', { name: created.complaint_no })).toBeVisible();
  });
});
