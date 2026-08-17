import { test, expect, type Page } from '@playwright/test';

/**
 * FE-to-BE E2E: printable receipts for a successful transfer and for a
 * complaint intake.
 *
 * The tested workflow runs through the real frontend: open the detail page,
 * click the print button, and check what the receipt renders. Direct backend
 * calls appear only in beforeAll, to pick an existing COMPLETED transfer and an
 * existing complaint to print (test-data selection, not part of the workflow).
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';
const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

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

/** Value rendered next to a receipt row label. */
function row(page: Page, label: string) {
  return page.locator(`[data-receipt-row="${label}"] [data-receipt-value]`).first();
}

/** The 80mm thermal layout is a fixed character grid — nothing may exceed it. */
async function expectFitsThermalWidth(page: Page) {
  const overflow = await page.evaluate(() => {
    const receipt = document.querySelector('.receipt') as HTMLElement | null;
    if (!receipt) return 'no .receipt element';
    return receipt.scrollWidth > receipt.clientWidth
      ? `receipt overflows the grid: ${receipt.scrollWidth} > ${receipt.clientWidth}`
      : '';
  });
  expect(overflow).toBe('');
}

/**
 * The paper size must actually parse. An invalid `@page size` (e.g. `80mm auto`
 * — the grammar takes `auto` OR lengths, never a mix) is dropped silently, the
 * page falls back to the driver's default paper, and the printer scales the
 * whole receipt down to squeeze it onto 80mm. A dropped value reads back as ''.
 */
async function expectPageSizeParses(page: Page) {
  const size = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRule[];
      try {
        rules = Array.from(sheet.cssRules);
      } catch {
        continue; // cross-origin sheet
      }
      for (const rule of rules) {
        if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('print')) continue;
        for (const inner of Array.from(rule.cssRules)) {
          if (inner.constructor.name === 'CSSPageRule') {
            return (inner as CSSPageRule).style.getPropertyValue('size');
          }
        }
      }
    }
    return 'no @page rule found';
  });
  expect(size).toBe('80mm 210mm');
}

/** The app shell must not render on a receipt page — not even on screen. */
async function expectNoAppShell(page: Page) {
  await expect(page.getByText('KESH Admin')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  await expect(page.getByText('Portal Kepatuhan Internal')).toHaveCount(0);
}

type Refund = { id: string; refund_no: string; status: string };

type Transfer = { id: string; partner_reference_no: string | null; status: string; result: string | null };
type Complaint = {
  id: string;
  complaint_no: string | null;
  transfer_id: string | null;
  customer_contact: string | null;
  transaction_amount: string | number | null;
  transaction_date: string | null;
  transaction_status: string | null;
  transaction_partner_reference_no: string | null;
  receipt_state: 'OPEN' | 'CLOSED' | null;
};

/** A complaint prints an intake slip while it runs, a settlement slip once done. */
const RECEIPT_COPY = {
  OPEN: {
    title: 'Bukti Penerimaan Pengaduan',
    footer: 'Nomor pengaduan ini dapat digunakan untuk pengecekan status.',
    officer: 'Petugas Penerima',
  },
  CLOSED: {
    title: 'Bukti Penyelesaian Pengaduan',
    footer: 'Simpan bukti ini sebagai arsip penyelesaian pengaduan.',
    officer: 'Petugas Penyelesaian',
  },
} as const;

/**
 * Setup-only: an APPROVED refund and a still-pending (MATCHED) one to print
 * against. SystemAdmin's RolesGuard bypass covers every stage here (create /
 * match built into create / submit / decision), so one token drives all of
 * it — this is precondition setup, not the tested workflow.
 */
async function createRefund(
  token: string,
  transferId: string,
  transferReference: string,
  amount: number,
  ts: string,
): Promise<Refund> {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const res = await fetch(`${API_BASE_URL}/statement-refunds`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      original_transfer_reference_no: transferReference,
      statement_date: new Date().toISOString().slice(0, 10),
      received_at: new Date().toISOString(),
      amount,
      currency: 'IDR',
      bank_name: 'Bank Test E2E',
      bank_account_no: '1234567890',
      bank_reference_no: `PW-E2E-RFD-${ts}`,
      statement_description: 'Refund receipt spec setup',
    }),
  });
  if (!res.ok) {
    throw new Error(`setup: failed creating refund: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

async function approveRefund(token: string, refund: Refund): Promise<Refund> {
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const submitRes = await fetch(`${API_BASE_URL}/statement-refunds/${refund.id}/submit`, {
    method: 'POST',
    headers,
  });
  if (!submitRes.ok) {
    throw new Error(`setup: failed submitting refund: ${submitRes.status} ${await submitRes.text()}`);
  }
  const decisionRes = await fetch(`${API_BASE_URL}/statement-refunds/${refund.id}/decision`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ decision: 'APPROVED', finance_notes: 'E2E receipt setup' }),
  });
  if (!decisionRes.ok) {
    throw new Error(`setup: failed approving refund: ${decisionRes.status} ${await decisionRes.text()}`);
  }
  return decisionRes.json();
}

test.describe('Printable receipts — FE-to-BE', () => {
  let transfer: Transfer;
  let draftTransferId: string;
  let complaint: Complaint;
  let approvedRefund: Refund;
  let pendingRefund: Refund;

  test.beforeAll(async () => {
    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    const headers = { Authorization: `Bearer ${sysAdminToken}` };

    const transfers: Transfer[] = await (
      await fetch(`${API_BASE_URL}/transfers?limit=500`, { headers })
    ).json();
    transfer = transfers.find((t) => t.status === 'COMPLETED' && t.result === 'SUCCESS');
    if (!transfer) {
      throw new Error('setup: no COMPLETED + SUCCESS transfer exists locally to print a receipt for.');
    }
    draftTransferId = String(transfers.find((t) => t.status === 'DRAFT')?.id ?? '');

    // The transaction_* / customer_contact fields only come back on the detail
    // endpoint (joined against transfers/persons), not the list — so pick a
    // candidate from the list, then fetch each one's detail to find one with a
    // linked transaction, exercising the receipt's transaction rows.
    const complaints = await (await fetch(`${API_BASE_URL}/complaints?limit=25`, { headers })).json();
    const withComplaintNo = (complaints.data ?? []).filter((c: Complaint) => c.complaint_no);
    if (withComplaintNo.length === 0) {
      throw new Error('setup: no complaint with a complaint_no exists locally to print a receipt for.');
    }
    const details: Complaint[] = await Promise.all(
      withComplaintNo.map((c: Complaint) =>
        fetch(`${API_BASE_URL}/complaints/${c.id}`, { headers }).then((r) => r.json()),
      ),
    );
    complaint = details.find((c) => c.transaction_partner_reference_no) ?? details[0];

    const ts = String(Date.now());
    const transferRef = transfer.partner_reference_no!;
    const approvedDraft = await createRefund(sysAdminToken, transfer.id, transferRef, 15_000, `A-${ts}`);
    approvedRefund = await approveRefund(sysAdminToken, approvedDraft);
    pendingRefund = await createRefund(sysAdminToken, transfer.id, transferRef, 15_001, `P-${ts}`);
  });

  test('transfer detail prints a receipt keyed by the transaction reference', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/transfers/${transfer.id}`);

    await page.getByRole('button', { name: 'Cetak Resi' }).click();
    await page.waitForURL(`**/transfers/${transfer.id}/receipt`);

    await expect(page.getByRole('heading', { name: 'Bukti Transaksi Transfer' })).toBeVisible();
    await expect(page.getByText('PT Radhana Solusi Indonesia', { exact: true })).toBeVisible();

    // The primary identifier is the reference the customer holds, never #id.
    const reference = transfer.partner_reference_no!;
    // Newly generated references are TRF-XXXXXXXX; rows created before the
    // short format still carry KESH-TRF-… and must print just the same.
    expect(reference).toMatch(/^(TRF-[A-HJ-NP-Z2-9]{8}|KESH-TRF-.+)$/);
    await expect(page.getByText(reference).first()).toBeVisible();
    await expect(row(page, 'No. Ref Transaksi')).toHaveText(reference);
    await expect(page.getByText(`Transfer #${transfer.id}`)).toHaveCount(0);

    // Officer rows carry names/emails; a bare number would mean the *_name
    // fields regressed back to raw user ids.
    for (const label of ['Dibuat Oleh', 'Diajukan Oleh', 'Disetujui Oleh']) {
      await expect(row(page, label)).not.toHaveText(/^\d+$/);
    }

    await expect(page.getByText('Simpan bukti ini sebagai referensi transaksi.')).toBeVisible();
    // Matches the Complaint receipt's structure — this used to be missing.
    await expect(page.locator('[data-receipt-signatures]')).toContainText('Petugas KESH');
    await expect(page.locator('[data-receipt-signatures]')).toContainText('Nasabah/Pengirim');
    await expectNoAppShell(page);
    await expectFitsThermalWidth(page);
    await expectPageSizeParses(page);

    // Kembali returns to the detail page it came from.
    await expect(page.getByRole('button', { name: 'Cetak' })).toBeVisible();
    await page.getByRole('button', { name: 'Kembali' }).click();
    await page.waitForURL(`**/transfers/${transfer.id}`);
  });

  test('complaint detail prints a receipt keyed by the complaint number', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/complaints/${complaint.id}`);

    await page.getByRole('link', { name: 'Cetak Resi Pengaduan' }).click();
    await page.waitForURL(`**/complaints/${complaint.id}/receipt`);

    // This spec takes whatever complaint the local DB offers, so the expected
    // copy follows that ticket's own receipt_state.
    const copy = RECEIPT_COPY[complaint.receipt_state ?? 'OPEN'];
    await expect(page.getByRole('heading', { name: copy.title })).toBeVisible();
    await expect(page.getByText('PT Radhana Solusi Indonesia', { exact: true })).toBeVisible();

    const complaintNo = complaint.complaint_no!;
    await expect(row(page, 'Nomor Pengaduan')).toHaveText(complaintNo);
    await expect(page.getByText(`Pengaduan #${complaint.id}`)).toHaveCount(0);
    await expect(row(page, 'Petugas Penerima')).not.toHaveText(/^\d+$/);

    if (complaint.customer_contact) {
      await expect(row(page, 'Kontak')).toHaveText(complaint.customer_contact);
    }

    if (complaint.transaction_partner_reference_no) {
      // The receipt must show the partner-facing reference, never the internal transfer id.
      await expect(row(page, 'No. Ref Transaksi')).toHaveText(
        complaint.transaction_partner_reference_no,
      );
      if (complaint.transfer_id) {
        await expect(row(page, 'No. Ref Transaksi')).not.toHaveText(String(complaint.transfer_id));
      }
    }
    if (complaint.transaction_amount != null) {
      await expect(row(page, 'Nominal')).not.toHaveText('-');
    }
    if (complaint.transaction_date) {
      await expect(row(page, 'Tanggal Transaksi')).not.toHaveText('-');
    }
    if (complaint.transaction_status) {
      await expect(row(page, 'Status Transaksi')).toHaveText(complaint.transaction_status);
    }

    await expect(page.getByText(copy.footer)).toBeVisible();
    await expect(page.locator('[data-receipt-signatures]')).toContainText(copy.officer);
    await expectNoAppShell(page);
    await expectFitsThermalWidth(page);
    await expectPageSizeParses(page);
  });

  test('a draft transfer offers no receipt', async ({ page }) => {
    test.skip(!draftTransferId, 'no DRAFT transfer available locally');
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/transfers/${draftTransferId}`);
    await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cetak Resi' })).toHaveCount(0);
  });

  test('an APPROVED refund prints a receipt keyed by the refund number, matching Complaint structure', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/statement-refunds/${approvedRefund.id}`);

    await page.getByRole('link', { name: 'Cetak Receipt' }).click();
    await page.waitForURL(`**/statement-refunds/${approvedRefund.id}/receipt`);

    await expect(page.getByRole('heading', { name: 'Bukti Refund' })).toBeVisible();
    await expect(page.getByText('PT Radhana Solusi Indonesia', { exact: true })).toBeVisible();

    await expect(row(page, 'Nomor Refund')).toHaveText(approvedRefund.refund_no);
    await expect(page.getByText(`Refund #${approvedRefund.id}`)).toHaveCount(0);
    await expect(row(page, 'Status')).toHaveText('APPROVED');

    // Officer row carries a name/email; a bare number would mean *_by_name regressed.
    await expect(row(page, 'Disetujui Oleh')).not.toHaveText(/^\d+$/);

    // Same visual system as Complaint: signatures block + no app shell + thermal-safe.
    await expect(page.locator('[data-receipt-signatures]')).toContainText('Petugas KESH');
    await expectNoAppShell(page);
    await expectFitsThermalWidth(page);
    await expectPageSizeParses(page);

    await page.getByRole('button', { name: 'Kembali' }).click();
    await page.waitForURL(`**/statement-refunds/${approvedRefund.id}`);
  });

  test('a pending (not yet APPROVED) refund offers no receipt', async ({ page }) => {
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto(`/statement-refunds/${pendingRefund.id}`);
    await expect(page.getByRole('link', { name: 'Cetak Receipt' })).toHaveCount(0);

    // Backend-enforced, not just hidden client-side: even a direct hit 400s.
    const res = await page.request.get(
      `${API_BASE_URL}/statement-refunds/${pendingRefund.id}/receipt`,
      { headers: { Authorization: `Bearer ${await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD)}` } },
    );
    expect(res.status()).toBe(400);
  });
});
