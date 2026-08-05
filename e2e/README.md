# Local FE-to-BE E2E (Playwright)

Drives the real browser UI against a real local backend — no direct API calls
for the workflow under test. Specs:

- `kyb-step2-cdd-regression.spec.ts` — regression test for the KYB bug where
  Step 2 "Pengurus & Pemegang Saham" → "Lanjut" incorrectly called the
  Individual-only `PATCH /api/applications/:id` CDD endpoint.
- `receipts.spec.ts` — printable receipts: `/transfers/:id/receipt` and
  `/complaints/:id/receipt` render outside the app shell, are keyed by the
  customer-facing reference (`KESH-TRF-…` / `KESH-CMP-…`) rather than an
  internal id, show officer names instead of numeric user ids, and the "Cetak
  Resi" button stays hidden on a draft transfer. Picks an existing COMPLETED
  transfer and an existing complaint from the local DB.
- `complaint-refund-flow.spec.ts` — Complaint Handling + Statement Refund
  happy path (create → verify data → operation investigation → finance
  review → statement refund → match → submit → approve → resolve → close),
  plus role-permission negative checks (FrontDesk, FinanceManager). Also
  covers linking a refund to its original transfer by
  `original_transfer_reference_no` (the `KESH-TRF-…` partner reference) on both
  the create form and the match modal, the friendly "nomor referensi … tidak
  ditemukan" error, and the reference-first detail/list display. Same for the
  complaint linkage by `complaint_no`, plus the stage lock (Ops SPV loses the
  investigation form once the ticket leaves OPERATION_INVESTIGATION) and the
  actor-name fields (names, never numeric user ids).
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
- `dttot-watchlist-transfer-hit.spec.ts` — DTTOT watchlist upload through
  Daftar Pengawasan (ComplianceLead), then a FrontDesk transfer whose
  beneficiary name is one of the uploaded DTTOT names. Converts the PPATK
  DTTOT export at `e2e/fixtures/watchlist/20260617043405.xlsx` into the KESH
  watchlist template at run time (see "DTTOT fixture" below). The second test
  then submits that transfer through the UI and asserts the screening result:
  status `PENDING_COMPLIANCE_REVIEW`, the "Hasil Screening Watchlist" section
  with the DTTOT hit rows and warning, the "Watchlist Hit"/`DTTOT` badges on
  the transfer list, and a sanction-related monitoring case. Screening runs on
  **submit**, not create — the draft is still clean immediately after "Buat
  Draft". A third test uploads a one-row file carrying the same name/DOB/
  nationality under a *different* `Unique_ID` and asserts the upload stays
  `SUCCESS` while the "Peringatan Kemungkinan Duplikat" panel lists the row.
  That row is deliberately inserted with a run-unique `E2E-DUP-<ts>` id (a
  reused id would dedupe and produce no warning) and removed again in
  `afterAll` — see "Duplicate-fixture cleanup" below.
  Also covers `POST /transfers/:id/rescreen-watchlist`: on the DTTOT-hit
  transfer created above (still `PENDING_COMPLIANCE_REVIEW`, so the backend
  takes its "live" branch — full refreshed transfer at the top level, stats
  nested under `rescreen`), FrontDesk sees no "Rescreen Watchlist" button (the
  same role guard as `canDecideTransferComplianceReview` —
  ComplianceLead/SystemAdmin/Director only), ComplianceLead does, the confirm
  dialog gates the call, the request body carries no `force`, and the
  screening section's hit table/empty-state and can-continue/still-matched
  banners reflect whatever `rescreen` actually reports for this beneficiary
  under current rules.

- `kyc-watchlist-screening.spec.ts` — application detail (`/users/:id`)
  watchlist screening: the Screening section renders every stored hit from the
  detail response (`screening[]` + `watchlist_summary`, no separate
  `GET /applications/:id/screening`), the DTTOT/PPPSPM compliance-blocking
  banner is shown, ComplianceLead can run "Re-screen Watchlist" and the risk
  level refreshes to HIGH, and FrontDesk sees the section but not the button.
  Targets application `13686` (Mira Ariani) by default — override with
  `E2E_WATCHLIST_APP_ID`.

- `transfer-finance-return.spec.ts` — FinanceStaff returning a transfer for
  correction. Walks a transfer through the UI to
  `PENDING_FINANCE_STAFF_REVIEW` (FrontDesk create+submit →
  OperationSupervisor layer 1), then: "Kembalikan Transaksi" without a reason
  is blocked client-side (no request fired), with a reason it posts
  `{ action: "RETURN", notes }` and the transfer becomes `REVISION_REQUIRED` /
  "Dikembalikan" on both detail and list; FinanceManager gets no final
  approve/reject action on it; FrontDesk edits the amount (`PATCH
  /transfers/:id`) and resubmits, landing back at the *start* of the normal
  flow (`SUBMITTED`), not back at FinanceStaff.
- `kyb-deed-split.spec.ts` — KYB Business Identity's split deed fields: PT
  cannot be saved without "No. Akta Pendirian" (validation fires, no POST),
  "No. Akta Perubahan Terakhir" is optional (sent as `null`, detail shows
  "—"), both values round-trip to the business detail, and a pre-split record
  still shows its deprecated `deed_number` under No. Akta Pendirian. The
  legacy check auto-detects a suitable old application and skips with an
  explanation if none exists — pin one with `E2E_LEGACY_DEED_APP_ID`.
- `kyb-documents-and-revision.spec.ts` — KYB Step 3 document cards and the
  returned-application flow: an uploaded document immediately shows "Berhasil
  Terupload" + filename + "Lihat", survives a page reload (the wizard resumes
  via `?app_id=`), and satisfies "Simpan & Lanjut" without re-selecting files;
  then SystemAdmin returns the application, FrontDesk replaces a
  `BUSINESS_NPWP` document, edits the business identity (`PATCH
  /applications/:id/business` — asserts the payload carries only the two
  touched fields and that no second application is created) and resubmits out
  of `REVISION_REQUIRED` with no approve/reject affordance, while Auditor,
  FinanceStaff and OperationSupervisor see nothing writable. Creates its own
  FrontDesk/Auditor/OperationSupervisor/FinanceStaff users via Settings —
  needs the seeded **SystemAdmin** (`E2E_SYSADMIN_EMAIL` /
  `E2E_SYSADMIN_PASSWORD`).

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
   - `dttot-watchlist-transfer-hit.spec.ts` needs the seeded **ComplianceLead**
     (`admin@example.com` / `Admin123!`, override via `E2E_COMPLIANCE_EMAIL` /
     `E2E_COMPLIANCE_PASSWORD`) — the backend restricts
     `POST /watchlist/upload` to that role. It creates its own FrontDesk
     account and reuses an existing `APPROVED` application, same as the bulk
     specs. Uploads are idempotent: `Unique_ID` is derived from the DTTOT
     "Kode Densus", so re-runs upsert the same 5 rows.
   - `kyc-watchlist-screening.spec.ts` needs the seeded **ComplianceLead** (it
     drives the page and the re-screen action) and the **SystemAdmin** (to
     create the FrontDesk account used for the negative check), plus a local
     application whose customer name already matches an uploaded watchlist
     entry. `13686` (Mira Ariani) is the default; run
     `dttot-watchlist-transfer-hit.spec.ts` first if the DTTOT data is not
     loaded yet, or set `E2E_WATCHLIST_APP_ID`. Note the backend appends a new
     `screening_results` row per re-screen, so the hit count grows between runs
     — the spec reads the expected count from the API each run instead of
     hardcoding it.
   - `transfer-finance-return.spec.ts` **creates its own** FrontDesk,
     OperationSupervisor, FinanceStaff and FinanceManager accounts each run
     (unique timestamped emails, password `Test@12345`) and reuses an existing
     `APPROVED` application as the sender, same as the bulk specs. The
     beneficiary name it types is deliberately not a watchlist name, so the
     transfer takes the clean `SUBMITTED` path rather than compliance review.
   - `kyb-deed-split.spec.ts` needs the seeded **ComplianceLead**
     (`admin@example.com` / `Admin123!`, override via `E2E_EMAIL` /
     `E2E_PASSWORD`) — it creates its own Business/KYB applications through the
     wizard. The legacy-fallback test additionally needs a pre-split business
     record (one with `deed_number` but no `deed_establishment_number`); it
     scans for one and skips if the local DB has none.
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
npx playwright test e2e/dttot-watchlist-transfer-hit.spec.ts
npx playwright test e2e/kyc-watchlist-screening.spec.ts
npx playwright test e2e/transfer-finance-return.spec.ts
npx playwright test e2e/kyb-deed-split.spec.ts
npx playwright test e2e/kyb-documents-and-revision.spec.ts

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

Same fix for `dttot-watchlist-transfer-hit.spec.ts`: the Watchlist upload
card's "Jenis list", "Sumber list" and "File Excel/CSV" fields, and the single
Transfer form's Nominal, Bank Penerima, Nomor Rekening, Nama Rekening,
Hubungan dengan Pengirim and Tujuan Transaksi fields.

## DTTOT fixture

`e2e/fixtures/watchlist/20260617043405.xlsx` is the raw PPATK DTTOT export
(531 rows, sheet "Export", Indonesian headers: `Nama`, `Deskripsi`, `Terduga`,
`Kode Densus`, `Tempat Lahir`, `Tanggal Lahir`, `WN/Asal Negara`, `Alamat`).
The KESH ingester does not accept it as-is — `Nama` has no recognised alias,
so every row would fail with "Baris tanpa Full_Name/Entity_Name ditolak".

The spec converts it at run time into the KESH watchlist template at
`e2e/.tmp/dttot-watchlist-upload.xlsx` (gitignored — do not commit), taking 5
rows: 4 people with a full identity set plus 1 `Korporasi` to exercise the
`Entity_Name` branch. Mapping:

| DTTOT source     | KESH template                                            |
| ---------------- | -------------------------------------------------------- |
| `Nama`           | `Full_Name` / `Entity_Name` (first segment), `Alias_Name` (remaining `alias …` segments, `;`-joined) |
| `Terduga`        | `Subject_Type` (`Orang`/`Korporasi` — accepted verbatim) |
| `Kode Densus`    | `Unique_ID` (`DTTOT-<kode>`) and `Sanction_Number`        |
| `Tanggal Lahir`  | `Date_of_Birth` (dd/mm/yyyy → ISO) + `Raw_Date_of_Birth`  |
| `Tempat Lahir`   | `Place_of_Birth`                                          |
| `WN/Asal Negara` | `Nationality`                                             |
| `Alamat`         | `Address`                                                 |
| `Deskripsi`      | `Description`, plus `National_ID_Number` (NIK parsed out) |

`Watchlist_Type` is written as `DTTOT` on every row so the per-row vs.
upload-`list_type` match policy is exercised rather than inferred.

### Duplicate-fixture cleanup

The duplicate-warning test must *insert* a watchlist entry (the backend only
warns on insert, never on an update), so it writes one row with a run-unique
`E2E-DUP-<timestamp>` Unique ID. `afterAll` deletes every
`unique_id LIKE 'E2E-DUP-%'` row plus the screening/transfer hits it produced —
real DTTOT rows are keyed by their PPATK "Kode Densus" (`DTTOT-…`) and never
match that prefix.

There is no delete endpoint for watchlist entries, so cleanup shells out to
`psql` and takes its connection from libpq's own `PG*` environment variables
(no credentials in the repo). Set `E2E_PSQL` if `psql` is not on `PATH`:

```sh
E2E_PSQL="/c/Program Files/PostgreSQL/16/bin/psql.exe" \
PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=… PGDATABASE=kesh_internal \
npx playwright test e2e/dttot-watchlist-transfer-hit.spec.ts
```

Without those, the run logs `cleanup skipped — could not run psql (…)` and
still passes; the leftover rows are inert test data.

Read the source with `raw: false`: 82 of the 531 DOB values are free text
("01/07/1974 atau 01/01/1973", "-", multi-line lists) and only survive in
`Raw_Date_of_Birth`, and xlsx's serial→`Date` conversion lands ~12s before
midnight, which would shift every parseable DOB back one day.
