# Local FE-to-BE E2E (Playwright)

Drives the real browser UI against a real local backend — no direct API calls
for the workflow under test. Specs:

- `kyb-step2-cdd-regression.spec.ts` — regression test for the KYB bug where
  Step 2 "Pengurus & Pemegang Saham" → "Lanjut" incorrectly called the
  Individual-only `PATCH /api/applications/:id` CDD endpoint.
- `complaint-refund-flow.spec.ts` — Complaint Handling + Statement Refund
  happy path (create → verify data → operation investigation → finance
  review → statement refund → match → submit → approve → resolve → close),
  plus role-permission negative checks (FrontDesk, FinanceManager).
- `bulk-transfer-reference.spec.ts` — Bulk Transfer's batch-level "No.
  Referensi Bulk" (`bulk_reference_no`) field: required-field validation
  (submit button disabled while empty, no POST fired), successful submit
  (asserts the `POST /api/transfers/bulk` request payload and response body),
  list/detail display of `batch_no`/`bulk_reference_no`, and duplicate
  `bulk_reference_no` rejection (409 + friendly error message).
- `bulk-transfer-list-import.spec.ts` — Single/Bulk transfer list separation
  (Single tab calls `GET /transfers?transfer_mode=single`; Bulk tab calls
  `GET /transfers/bulk-batches`, one row per batch), bulk batch detail page
  (child transfer table + links to existing `/transfers/:id`), the Bulk
  Transfer Excel template download, and importing a generated `.xlsx` fixture
  to fill and submit bulk rows (including the B4 "No. Referensi Bulk"
  prefill), plus duplicate `bulk_reference_no` rejection in that same flow.

Default FE base URL for this suite is `http://localhost:3100` (not `:3000`) —
see "Why :3100" below.

## Prerequisites

Local/dev database only. Do not point this at production or a devtunnel.

1. **Backend** — start it locally against your local/dev database, with CORS
   opened for whichever FE origin you'll use:

   ```sh
   cd kesh-kyb-kyc-be
   CORS_ORIGIN=http://localhost:3100 node --enable-source-maps dist/main.js
   # or, if API_PORT/CORS_ORIGIN are already correct in your .env, just:
   npm run start
   ```

   Confirm it's serving on `http://localhost:4000/api`.

2. **Frontend** — build/start it with `NEXT_PUBLIC_API_BASE_URL` pointed at
   that local backend. `NEXT_PUBLIC_*` is inlined at build time, so this must
   be a build targeting the local backend — **not** whatever `.env.local` has
   day-to-day (it may point at a devtunnel):

   ```sh
   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api npm run build
   npx next start -p 3100
   ```

   Confirm it's serving on `http://localhost:3100`.

   ### Why `:3100`, and why a second backend/build
   If you already have your normal dev FE/BE running on `:3000`/`:4000`
   (pointed at the devtunnel per `.env.local`), don't reuse them — you'd
   silently test against the wrong backend. `next dev` also only allows one
   dev-mode instance per project directory, so a second instance needs
   `next build && next start` on its own port instead. `:3100` keeps this
   suite's instance clearly separate from whatever you're using day-to-day;
   any free port works as long as you pass it via `E2E_BASE_URL` and open
   backend CORS for it.

3. **Credentials** — the suite needs:
   - **Seeded** SystemAdmin: `sysadmin@kesh.local` / `SystemAdmin@123`
     (override via `E2E_SYSADMIN_EMAIL` / `E2E_SYSADMIN_PASSWORD`). Used only
     to provision the role accounts below through the real Settings →
     "Buat Admin" form — not used to drive the tested workflow itself.
   - **Seeded** ComplianceLead: `admin@example.com` / `Admin123!` — used by
     `kyb-step2-cdd-regression.spec.ts` only.
   - `complaint-refund-flow.spec.ts` **creates its own** ComplaintHandling,
     OperationSupervisor, FinanceStaff, FinanceManager, and FrontDesk accounts
     each run (unique timestamped emails, password `Test@12345`) — nothing
     extra to seed for it.
   - At least one `APPROVED` application should exist locally with a transfer
     attached, so `complaint-refund-flow.spec.ts` has something to reference.
     If none exists, the spec creates one itself via a direct backend call
     (test-data setup only, not part of the tested workflow) and says so if
     even that has nothing to attach to (no approved applications at all).
   - `bulk-transfer-reference.spec.ts` **creates its own** FrontDesk account
     each run (unique timestamped email, password `Test@12345`) through the
     real Settings → "Buat Admin" form. It does **not** create or approve a
     KYC/KYB application itself (out of scope for this spec) — it requires at
     least one `APPROVED` application to already exist locally (any type),
     since the bulk transfer sender picker only returns approved applications.
     If none exists, the spec fails in `beforeAll` with a message telling you
     to seed one.
   - `bulk-transfer-list-import.spec.ts` has the same requirements as
     `bulk-transfer-reference.spec.ts` above (own FrontDesk account, reuses an
     existing `APPROVED` application, never touches KYC/KYB itself). It builds
     its own `.xlsx` fixture file at run time (via the `xlsx` package, same as
     the FE) — nothing extra to prepare.

   Override the API target via `E2E_API_BASE_URL` if your local backend isn't
   on `http://localhost:4000/api`, or the FE via `E2E_BASE_URL` if it isn't on
   `:3100`.

## Run

```sh
npx playwright test                              # everything
npm run test:e2e                                 # everything (script alias)
npm run test:e2e:complaint-refund                 # complaint+refund spec only
npm run test:e2e:bulk-transfer                    # bulk transfer reference spec only
npm run test:e2e:bulk-transfer-list-import        # list split + Excel import spec only
npx playwright test e2e/complaint-refund-flow.spec.ts
npx playwright test e2e/bulk-transfer-reference.spec.ts
npx playwright test e2e/bulk-transfer-list-import.spec.ts

# headed / debugging:
npx playwright test --headed
npx playwright show-report
```

On failure, trace/video/screenshot are written under `test-results/` — open
the trace with `npx playwright show-trace test-results/**/trace.zip`.

## Accessibility fixes made to support these tests

A few form fields across the app had `<label>` text as an unassociated
sibling of their `<input>`/`<select>` (no `htmlFor`/`id`, no wrapping) — real
screen readers can't associate them either. Fixed with `htmlFor`/`id` pairs
(or, where there was no `<label>` at all, wrapping) — purely additive, no
behavior change: login page, `AdminManagementCard`'s create-admin form,
Complaint Level / Jenis Pengaduan on the new-complaint form, KYB's Bidang
Usaha field, and the Statement Refund detail page's match/approve/reject
modals (which also gained `role="dialog"` so their fields can be targeted
unambiguously from fields of the same name in the background page). Also
fixed for `bulk-transfer-reference.spec.ts`: the Bulk Transfer form's "No.
Referensi Bulk" field and per-row beneficiary fields (Nama Rekening, Bank
Penerima, Nomor Rekening, Nominal, Tujuan Transaksi, Hubungan dengan
Pengirim), and the transfer list's "Filter status" select. The Bulk
Transfer form's hidden `<input type="file">` (styled as an "Import Excel"
button) is likewise given a proper `htmlFor`/`id` pair so tests can target it
with `getByLabel('Import Excel').setInputFiles(...)`.
