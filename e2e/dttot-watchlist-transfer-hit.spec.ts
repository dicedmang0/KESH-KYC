import { test, expect, type Page, type Browser } from '@playwright/test';
import * as XLSX from 'xlsx';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * FE-to-BE E2E: DTTOT watchlist upload → transfer against a DTTOT name.
 *
 * The tested WORKFLOW (login → Daftar Pengawasan → upload DTTOT file → confirm
 * upload result → search the stored entry → login as FrontDesk → create a
 * transfer whose beneficiary name is the uploaded DTTOT name) runs entirely
 * through the real frontend. Direct backend calls are used only for test-data
 * setup and post-hoc verification, never for the workflow itself.
 *
 * Beneficiary screening runs on SUBMIT, not on create: `TransfersService.submit`
 * trigram-matches `beneficiary_account_name` against `watchlist_entries` (same
 * algorithm and threshold as the KYC/KYB application screening), and on a hit
 * routes the transfer to PENDING_COMPLIANCE_REVIEW, opens a compliance review
 * carrying the WATCHLIST_HIT / DTTOT_HIT red flags, and lets monitoring raise
 * LTKM_SANCTION_RELATED. The second test drives exactly that path through the UI.
 *
 * Requires FE + BE running locally — see e2e/README.md.
 */

// ── Config ─────────────────────────────────────────────────────────────────

const API_BASE_URL = process.env.E2E_API_BASE_URL || 'http://localhost:4000/api';

const SYSADMIN_EMAIL = process.env.E2E_SYSADMIN_EMAIL || 'sysadmin@kesh.local';
const SYSADMIN_PASSWORD = process.env.E2E_SYSADMIN_PASSWORD || 'SystemAdmin@123';

// Seeded ComplianceLead — the only role the backend lets upload watchlist data
// (@Roles("ComplianceLead") on POST /watchlist/upload).
const COMPLIANCE_EMAIL = process.env.E2E_COMPLIANCE_EMAIL || 'admin@example.com';
const COMPLIANCE_PASSWORD = process.env.E2E_COMPLIANCE_PASSWORD || 'Admin123!';

const ROLE_PASSWORD = 'Test@12345';

const LIST_SOURCE = 'PPATK';
const SOURCE_FILE = path.join(__dirname, 'fixtures', 'watchlist', '20260617043405.xlsx');
const TMP_DIR = path.join(__dirname, '.tmp');
const UPLOAD_FILE = path.join(TMP_DIR, 'dttot-watchlist-upload.xlsx');
const DUPLICATE_FILE = path.join(TMP_DIR, 'dttot-watchlist-duplicate.xlsx');

/** How many DTTOT source rows the generated upload file carries. */
const FIXTURE_ROW_COUNT = 5;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ── DTTOT source → KESH watchlist template conversion ──────────────────────
// The PPATK export uses Indonesian headers ("Nama", "Deskripsi", "Terduga",
// "Kode Densus", …) that the KESH ingester does not recognise — only "Terduga",
// "Tempat Lahir", "Alamat" and "Deskripsi" are accepted aliases. The identity
// name in particular ("Nama") has no alias, so every row would be rejected with
// "Baris tanpa Full_Name/Entity_Name ditolak". Hence this conversion.

type SourceRow = {
  Nama?: string;
  Deskripsi?: string;
  Terduga?: string;
  'Kode Densus'?: string;
  'Tempat Lahir'?: string;
  'Tanggal Lahir'?: string;
  'WN/Asal Negara'?: string;
  Alamat?: string;
};

type Candidate = {
  uniqueId: string;
  name: string;
  aliases: string;
  subjectType: 'Orang' | 'Korporasi';
  dateOfBirth: string;
  rawDateOfBirth: string;
  nationalId: string;
  sourceRow: SourceRow;
};

/** "A alias B alias C" → { name: 'A', aliases: 'B;C' } (the ingester splits aliases on ;,|). */
function splitAliases(nama: string): { name: string; aliases: string } {
  const parts = nama.split(/\s+alias\s+/i).map((s) => s.trim()).filter(Boolean);
  return { name: parts[0] ?? '', aliases: parts.slice(1).join(';') };
}

/**
 * "dd/mm/yyyy" → ISO for the `date_of_birth` DATE column. 82 of the 531 source
 * rows hold free text instead ("01/07/1974 atau 01/01/1973", "-", multi-line
 * lists); those return '' here and survive in Raw_Date_of_Birth, which is
 * exactly what the KESH template's Raw_Date_of_Birth column is for.
 */
function toIsoDate(v: string | undefined): string {
  const m = String(v ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

/** DTTOT descriptions embed the NIK as free text ("- NIK 64020U205820003"). */
function extractNik(deskripsi: string | undefined): string {
  return String(deskripsi ?? '').match(/NIK\s*:?\s*([0-9A-Za-z]{10,20})/i)?.[1] ?? '';
}

function toCandidate(row: SourceRow): Candidate {
  const { name, aliases } = splitAliases(String(row.Nama ?? ''));
  return {
    // Kode Densus is the PPATK per-subject code — a stable natural key, so
    // re-running this spec upserts the same rows instead of duplicating them.
    uniqueId: `DTTOT-${String(row['Kode Densus'] ?? '').trim()}`,
    name,
    aliases,
    subjectType: String(row.Terduga ?? '').trim() === 'Korporasi' ? 'Korporasi' : 'Orang',
    dateOfBirth: toIsoDate(row['Tanggal Lahir']),
    rawDateOfBirth: String(row['Tanggal Lahir'] ?? '').trim(),
    nationalId: extractNik(row.Deskripsi),
    sourceRow: row,
  };
}

/**
 * Build the KESH-template upload file from the DTTOT source. Returns the picked
 * rows; the first is the hit candidate used by the transfer test.
 */
function buildKeshUploadFile(): Candidate[] {
  const wb = XLSX.readFile(SOURCE_FILE);
  // raw:false → cells come through as their *formatted* text. Needed for the
  // DOB column: xlsx's serial→Date conversion lands ~12s before midnight, so
  // a Date would yield the previous day (02/05/1982 → 1982-05-01).
  const rows = XLSX.utils.sheet_to_json<SourceRow>(wb.Sheets[wb.SheetNames[0]], {
    defval: '',
    raw: false,
  });

  // Hit candidate first: a natural person with a full identity set (DOB, place
  // of birth, nationality, NIK) so the row exercises every mapped column.
  const people = rows.filter(
    (r) =>
      String(r.Terduga).trim() === 'Orang' &&
      String(r.Nama ?? '').trim() &&
      toIsoDate(r['Tanggal Lahir']) &&
      String(r['Tempat Lahir'] ?? '').trim() &&
      extractNik(r.Deskripsi),
  );
  const corp = rows.find((r) => String(r.Terduga).trim() === 'Korporasi' && String(r.Nama ?? '').trim());
  if (people.length === 0 || !corp) {
    throw new Error(`fixture: ${SOURCE_FILE} has no usable person/entity rows`);
  }

  // One entity row proves the Entity_Name branch; the rest are people.
  const picked = [...people.slice(0, FIXTURE_ROW_COUNT - 1), corp].map(toCandidate);

  const sheet = picked.map((c) => ({
    Unique_ID: c.uniqueId,
    Watchlist_Type: 'DTTOT',
    Subject_Type: c.subjectType,
    Full_Name: c.subjectType === 'Orang' ? c.name : '',
    Entity_Name: c.subjectType === 'Korporasi' ? c.name : '',
    Alias_Name: c.aliases,
    Date_of_Birth: c.dateOfBirth,
    Raw_Date_of_Birth: c.rawDateOfBirth,
    Place_of_Birth: String(c.sourceRow['Tempat Lahir'] ?? '').trim(),
    Nationality: String(c.sourceRow['WN/Asal Negara'] ?? '').trim(),
    National_ID_Number: c.nationalId,
    Address: String(c.sourceRow.Alamat ?? '').trim(),
    Sanction_Number: String(c.sourceRow['Kode Densus'] ?? '').trim(),
    Source_URL: 'https://www.ppatk.go.id/link/read/23/dttot.html',
    Description: String(c.sourceRow.Deskripsi ?? '').trim(),
  }));

  writeSheet(sheet, UPLOAD_FILE);
  return picked;
}

function writeSheet(sheet: Record<string, string>[], file: string) {
  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, XLSX.utils.json_to_sheet(sheet), 'DTTOT');
  fs.mkdirSync(TMP_DIR, { recursive: true });
  XLSX.writeFile(outWb, file);
}

/**
 * One row carrying the same list type, name, DOB and nationality as `base` but
 * a different Unique_ID and Sanction_Number — neither dedupe key matches, so
 * the backend inserts it and returns a duplicate-name warning.
 *
 * The Unique_ID is timestamped: reusing it would dedupe on the second run and
 * the row would be *updated* instead of inserted, producing no warning.
 */
function buildDuplicateUploadFile(base: Candidate, runId: string): string {
  // Deliberately unrelated to the base Unique_ID: other assertions locate rows
  // by `hit.uniqueId` as a substring, and a `<base>-DUP` id would match those too.
  const dupUniqueId = `${DUP_ID_PREFIX}${runId}`;
  writeSheet(
    [
      {
        Unique_ID: dupUniqueId,
        Watchlist_Type: 'DTTOT',
        Subject_Type: base.subjectType,
        Full_Name: base.subjectType === 'Orang' ? base.name : '',
        Entity_Name: base.subjectType === 'Korporasi' ? base.name : '',
        Date_of_Birth: base.dateOfBirth,
        Raw_Date_of_Birth: base.rawDateOfBirth,
        Place_of_Birth: String(base.sourceRow['Tempat Lahir'] ?? '').trim(),
        Nationality: String(base.sourceRow['WN/Asal Negara'] ?? '').trim(),
        Sanction_Number: dupUniqueId,
        Description: 'E2E duplicate-name warning fixture',
      },
    ],
    DUPLICATE_FILE,
  );
  return dupUniqueId;
}

// ── Setup / verification-only backend calls (not the tested workflow) ───────

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
async function resolveApprovedSender(token: string): Promise<ApprovedSender> {
  const res = await fetch(`${API_BASE_URL}/applications?status=APPROVED&limit=25`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

// ── FE-driven helpers ──────────────────────────────────────────────────────

async function login(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Masuk' }).click();
  await page.waitForURL('**/dashboard');
}

/** Log out through the sidebar's real "Keluar" control, then log in as someone else. */
async function switchRole(page: Page, email: string, password: string) {
  const logoutButton = page.getByRole('button', { name: 'Keluar' });
  if ((await logoutButton.count()) > 0) {
    await logoutButton.click();
    await page.waitForURL('**/login');
  }
  await login(page, email, password);
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

// ── Test-data cleanup ──────────────────────────────────────────────────────

/** Prefix of the throwaway entries the duplicate-warning test has to insert. */
const DUP_ID_PREFIX = 'E2E-DUP-';

/**
 * Drop the throwaway watchlist entries this spec inserts (`E2E-DUP-<ts>`) plus
 * the screening/transfer hits they produced. Real DTTOT rows are keyed by their
 * PPATK "Kode Densus" (`DTTOT-…`) and never match the prefix.
 *
 * There is no delete endpoint for watchlist entries, so this shells out to
 * `psql` using libpq's own PG* environment variables (no credentials in the
 * repo). Best effort: if psql is unavailable the leftovers are harmless, so the
 * run logs a note instead of failing. Point `E2E_PSQL` at the binary if it is
 * not on PATH.
 */
function cleanupDuplicateFixtureRows(): string {
  const targets = `SELECT id FROM watchlist_entries WHERE unique_id LIKE '${DUP_ID_PREFIX}%'`;
  const sql = `
    DELETE FROM screening_results
     WHERE hit_entry_id IN (${targets}) OR watchlist_id IN (${targets});
    DELETE FROM transfer_watchlist_hits WHERE watchlist_entry_id IN (${targets});
    WITH deleted AS (
      DELETE FROM watchlist_entries WHERE unique_id LIKE '${DUP_ID_PREFIX}%' RETURNING 1
    )
    SELECT count(*) FROM deleted;`;
  // -q suppresses the per-statement DELETE tags so only the final count prints.
  return execFileSync(process.env.E2E_PSQL || 'psql', ['-v', 'ON_ERROR_STOP=1', '-qAt', '-c', sql], {
    encoding: 'utf8',
  }).trim();
}

// ── Network guards ─────────────────────────────────────────────────────────

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
    let hostname = '';
    try {
      const u = new URL(url);
      pathname = u.pathname;
      hostname = u.hostname;
    } catch { /* ignore */ }
    if (pathname.includes('/api/') && hostname !== 'localhost' && hostname !== '127.0.0.1') {
      guards.nonLocalApiHits.push(`${req.method()} ${url}`);
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/') || res.status() < 400) return;
    const status = res.status();
    res.text()
      .then((body) => {
        guards.failedApiResponses.push({ url: `${res.request().method()} ${url}`, status, body });
        console.log(`[e2e] failed API response: ${res.request().method()} ${url} -> ${status}\n${body}`);
      })
      .catch(() => { /* body unreadable — irrelevant to this check */ });
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

// ── Suite ──────────────────────────────────────────────────────────────────

test.describe.configure({ mode: 'serial' });

test.describe('DTTOT watchlist upload → transfer screening — FE-to-BE', () => {
  let ts: string;
  let candidates: Candidate[];
  let hit: Candidate;
  let sender: ApprovedSender;
  let frontDesk: { email: string; password: string };
  let complianceToken: string;

  test.beforeAll(async ({ browser }: { browser: Browser }) => {
    ts = Date.now().toString();

    candidates = buildKeshUploadFile();
    hit = candidates[0];
    console.log(
      `[e2e] DTTOT hit candidate: "${hit.name}" (${hit.uniqueId}, DOB ${hit.dateOfBirth || '-'}, NIK ${hit.nationalId || '-'})`,
    );

    const sysAdminToken = await apiLogin(SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    sender = await resolveApprovedSender(sysAdminToken);
    complianceToken = await apiLogin(COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);

    frontDesk = { email: `e2e.fd.dttot.${ts}@test.local`, password: ROLE_PASSWORD };

    const page = await browser.newPage();
    await login(page, SYSADMIN_EMAIL, SYSADMIN_PASSWORD);
    await page.goto('/settings');
    await createFrontDeskViaFE(page, { email: frontDesk.email, fullName: `E2E FrontDesk DTTOT ${ts}` });
    await page.close();
  });

  test.afterAll(() => {
    try {
      console.log(`[e2e] cleanup: removed ${cleanupDuplicateFixtureRows()} ${DUP_ID_PREFIX}* watchlist entries`);
    } catch (e) {
      console.warn(
        `[e2e] cleanup skipped — could not run psql (${e instanceof Error ? e.message.split('\n')[0] : e}). ` +
          `Leftover ${DUP_ID_PREFIX}* watchlist entries are harmless; set E2E_PSQL and the PG* env vars to clean them up.`,
      );
    }
  });

  test('ComplianceLead uploads the converted DTTOT file and the entries become searchable', async ({ page }) => {
    const guards = attachNetworkGuards(page);

    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto('/watchlist');
    await expect(page.getByRole('heading', { name: 'Daftar Pengawasan' })).toBeVisible();

    await page.getByLabel('Jenis list').selectOption('DTTOT');
    await page.getByLabel('Sumber list').fill(LIST_SOURCE);
    await page.getByLabel('File Excel/CSV').setInputFiles(UPLOAD_FILE);

    const uploadResponse = page.waitForResponse(
      (res) => res.url().includes('/watchlist/upload') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Upload' }).click();
    const res = await uploadResponse;
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();

    // Every converted row must land — a PARTIAL means the mapping regressed.
    const body = (await res.json()) as {
      status: string; total: number; success: number; error_count: number;
      inserted_count: number; updated_count: number; skipped_count: number;
    };
    expect(body, JSON.stringify(body)).toMatchObject({
      status: 'SUCCESS',
      total: FIXTURE_ROW_COUNT,
      success: FIXTURE_ROW_COUNT,
      error_count: 0,
      skipped_count: 0,
    });
    // Unique_ID is the DTTOT "Kode Densus", so a re-run updates instead of inserting.
    expect(body.inserted_count + body.updated_count).toBe(FIXTURE_ROW_COUNT);

    await expect(
      page.getByText(`Upload DTTOT (${LIST_SOURCE}) berhasil. ${FIXTURE_ROW_COUNT} dari ${FIXTURE_ROW_COUNT} baris berhasil diproses.`),
    ).toBeVisible();

    // Counts summary renders alongside the existing success message.
    const summary = page.locator('dl').filter({ hasText: 'Total baris' }).first();
    await expect(summary).toBeVisible();
    for (const label of ['Total baris', 'Berhasil', 'Data baru', 'Diperbarui', 'Gagal/dilewati', 'Peringatan']) {
      await expect(summary.getByText(label, { exact: true })).toBeVisible();
    }

    // Upload history picked it up.
    const historyRow = page.locator('tr', { hasText: LIST_SOURCE }).filter({ hasText: 'DTTOT' }).first();
    await expect(historyRow).toBeVisible();
    await expect(historyRow.getByText('Berhasil')).toBeVisible();

    // Stored entries are searchable by the DTTOT name.
    await page.getByPlaceholder('Cari nama, ID, NIK, jabatan, instansi, atau nomor sanksi').fill(hit.name);
    await page.getByRole('button', { name: 'Cari' }).click();

    // Match the Unique ID cell exactly — other local rows may carry it as a prefix.
    const entryRow = page
      .locator('tr')
      .filter({ has: page.getByRole('cell', { name: hit.uniqueId, exact: true }) });
    await expect(entryRow).toHaveCount(1);
    await expect(entryRow.getByText(hit.name, { exact: true })).toBeVisible();
    await expect(entryRow.getByText('DTTOT', { exact: true })).toBeVisible();

    await assertNoNetworkViolations(page, guards);
  });

  test('FrontDesk transfer to the DTTOT name is screened on submit and routed to compliance review', async ({ page }) => {
    const guards = attachNetworkGuards(page);

    await login(page, frontDesk.email, frontDesk.password);
    await page.goto('/transfers/new');

    await page.getByPlaceholder('Cari nama atau CIF pengirim…').fill(sender.displayName);
    await page.getByRole('button', { name: new RegExp(escapeRegExp(sender.displayName)) }).click();

    await page.locator('#transfer-amount').fill('25000000');
    await page.locator('#transfer-bank').selectOption({ index: 1 });
    await page.locator('#transfer-account-number').fill('1234509876');
    await page.locator('#transfer-account-name').fill(hit.name);
    await page.locator('#transfer-relationship').selectOption('Lainnya');
    await page.locator('#transfer-purpose').fill(`Pembayaran vendor ${ts}`);

    const createResponse = page.waitForResponse(
      (r) => /\/api\/transfers$/.test(new URL(r.url()).pathname) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Buat Draft' }).click();
    const created = await createResponse;
    expect(created.ok(), await created.text().catch(() => '')).toBeTruthy();
    const transferId = String(((await created.json()) as { id: number | string }).id);

    await page.waitForURL(`**/transfers/${transferId}`);
    await expect(page.getByRole('heading', { name: `Transfer #${transferId}` })).toBeVisible();

    // Screening runs on SUBMIT, not create — the draft is still clean here.
    await expect(page.getByText('Draft', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Hasil Screening Watchlist' })).toHaveCount(0);

    // ── Submit through the FE → beneficiary screening fires ─────────────────
    const submitResponse = page.waitForResponse(
      (r) => new URL(r.url()).pathname.endsWith(`/transfers/${transferId}/submit`) && r.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Ajukan Transaksi' }).click();
    const submitted = await submitResponse;
    expect(submitted.ok(), await submitted.text().catch(() => '')).toBeTruthy();
    expect((await submitted.json()).status).toBe('PENDING_COMPLIANCE_REVIEW');

    // The detail page redirects to the list after submit (existing behaviour).
    await page.waitForURL('**/transfers');

    // 6. Transfer list shows the compact badges on the beneficiary cell.
    const listRow = page.locator('div.border-t').filter({ hasText: `#${transferId}` }).first();
    await expect(listRow).toBeVisible();
    await expect(listRow.getByText('Watchlist Hit')).toBeVisible();
    await expect(listRow.getByText('DTTOT', { exact: true })).toBeVisible();
    await expect(listRow.getByText('Menunggu Review Compliance')).toBeVisible();

    // 4. Back on detail: routed to compliance review, not the clean SUBMITTED
    // path. Scope to the Ringkasan card — the same label also exists as a hidden
    // <option> in the list page's status filter.
    await page.goto(`/transfers/${transferId}`);
    const summary = page
      .locator('div.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Ringkasan' }) });
    await expect(summary.getByText('Menunggu Review Compliance')).toBeVisible();

    // 5. Detail shows the screening section, the DTTOT hit and the warning.
    const screening = page
      .locator('div.rounded-2xl')
      .filter({ has: page.getByRole('heading', { name: 'Hasil Screening Watchlist' }) });
    await expect(screening).toBeVisible();
    await expect(
      screening.getByText('Beneficiary terindikasi masuk daftar DTTOT. Transfer memerlukan review Compliance.'),
    ).toBeVisible();

    // The local watchlist may hold several entries for this name (the uploaded
    // row plus pre-existing seed data), so assert "at least one" rather than an
    // exact count — every row must still be a DTTOT match on the typed name.
    const hitRows = screening.locator('tbody tr');
    const hitCount = await hitRows.count();
    expect(hitCount).toBeGreaterThan(0);
    await expect(screening.getByText('DTTOT', { exact: true }).first()).toBeVisible();
    await expect(hitRows.filter({ hasText: hit.name })).toHaveCount(hitCount);
    // Our uploaded entry specifically must be among the matches (exact cell —
    // other local entries may carry this Unique ID as a prefix).
    await expect(
      hitRows.filter({ has: page.getByRole('cell', { name: hit.uniqueId, exact: true }) }),
    ).toHaveCount(1);
    // Match score column renders as a percentage (exact name → 100.0%).
    await expect(screening.getByText('100.0%').first()).toBeVisible();

    // 7. Monitoring — ComplianceLead sees a sanction-related case for it.
    // The case id is resolved via the API (locating only); the assertions below
    // are on the rendered FE page.
    const casesRes = await fetch(`${API_BASE_URL}/monitoring/cases?limit=100`, {
      headers: { Authorization: `Bearer ${complianceToken}` },
    });
    expect(casesRes.ok, `verification: GET /monitoring/cases -> ${casesRes.status}`).toBeTruthy();
    const own = ((await casesRes.json()).data ?? []).filter(
      (c: { transfer_id?: number | string | null }) => String(c.transfer_id ?? '') === transferId,
    ) as Array<{ id: number | string; case_type?: string; trigger_summary?: string | null }>;
    expect(own, `no monitoring case was opened for transfer ${transferId}`).not.toHaveLength(0);
    expect(own.some((c) => /SANCTION|DTTOT|sanksi/i.test(String(c.trigger_summary ?? '')))).toBeTruthy();

    await switchRole(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto(`/monitoring/${own[0].id}`);
    // The trigger list shows the alert name ("Transaksi Wajib EDD") with the
    // rule code underneath, so assert on the rule code and the rule's own text.
    await expect(page.getByText('LTKM_SANCTION_RELATED').first()).toBeVisible();
    await expect(page.getByText(/Penerima transfer terkait DTTOT\/PPPSPM/).first()).toBeVisible();

    await assertNoNetworkViolations(page, guards);
  });

  test('Duplicate name under a different Unique ID uploads with a warning, not a failure', async ({ page }) => {
    const guards = attachNetworkGuards(page);
    const dupUniqueId = buildDuplicateUploadFile(hit, ts);

    await login(page, COMPLIANCE_EMAIL, COMPLIANCE_PASSWORD);
    await page.goto('/watchlist');

    await page.getByLabel('Jenis list').selectOption('DTTOT');
    await page.getByLabel('Sumber list').fill(LIST_SOURCE);
    await page.getByLabel('File Excel/CSV').setInputFiles(DUPLICATE_FILE);

    const uploadResponse = page.waitForResponse(
      (res) => res.url().includes('/watchlist/upload') && res.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Upload' }).click();
    const res = await uploadResponse;
    expect(res.ok(), await res.text().catch(() => '')).toBeTruthy();

    // A duplicate-name warning must not degrade the upload status.
    const body = (await res.json()) as {
      status: string;
      inserted_count: number;
      updated_count: number;
      warning_count: number;
      duplicate_warnings: Array<{ name: string; unique_id: string; existing_unique_ids: string[] }>;
    };
    expect(body, JSON.stringify(body)).toMatchObject({ status: 'SUCCESS', inserted_count: 1, updated_count: 0 });
    expect(body.warning_count).toBeGreaterThan(0);

    // Success box + counts summary.
    await expect(
      page.getByText(`Upload DTTOT (${LIST_SOURCE}) berhasil. 1 dari 1 baris berhasil diproses.`),
    ).toBeVisible();
    const summary = page.locator('dl').filter({ hasText: 'Total baris' }).first();
    await expect(summary.getByText('Data baru')).toBeVisible();
    await expect(summary.getByText('Peringatan')).toBeVisible();

    // Warning panel.
    const panel = page.locator('div').filter({ hasText: /^Peringatan Kemungkinan Duplikat/ }).last();
    await expect(page.getByText(/^Peringatan Kemungkinan Duplikat \(\d+\)$/)).toBeVisible();
    const warnRow = panel.locator('tr', { hasText: dupUniqueId });
    await expect(warnRow).toHaveCount(1);
    await expect(warnRow.getByText(hit.name, { exact: true })).toBeVisible();
    await expect(warnRow.getByText('DTTOT', { exact: true })).toBeVisible();
    await expect(warnRow.getByText('Kemungkinan duplikat nama ditemukan, perlu review manual.')).toBeVisible();
    // The already-stored entry it collides with is listed in the "Unique ID
    // Terdaftar" cell (comma-joined when several entries collide).
    await expect(warnRow.getByRole('cell', { name: hit.uniqueId })).toBeVisible();

    await assertNoNetworkViolations(page, guards);
  });
});
