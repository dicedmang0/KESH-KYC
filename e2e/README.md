# Local FE-to-BE E2E (Playwright)

Drives the real browser UI against a real local backend — no direct API calls
in the test scenario itself. Currently one spec:

- `kyb-step2-cdd-regression.spec.ts` — regression test for the KYB bug where
  Step 2 "Pengurus & Pemegang Saham" → "Lanjut" incorrectly called the
  Individual-only `PATCH /api/applications/:id` CDD endpoint.

## Prerequisites

Local/dev database only. Do not point this at production.

1. Start the backend locally on port 4000 (from `kesh-kyb-kyc-be`), against your
   local/dev database.
2. Start this frontend with `NEXT_PUBLIC_API_BASE_URL` pointed at that local
   backend — **not** whatever `.env.local` currently has (it may point at a
   devtunnel):

   ```sh
   # Windows PowerShell
   $env:NEXT_PUBLIC_API_BASE_URL = "http://localhost:4000/api"
   npm run dev

   # bash
   NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api npm run dev
   ```

   Confirm it's serving on `http://localhost:3000`.
3. Make sure the seeded ComplianceLead account exists in that local DB:
   `admin@example.com` / `Admin123!` (same credentials the login page
   pre-fills, and the same ones backend's own `test/e2e/app.e2e-spec.ts` logs
   in with). Override via `E2E_EMAIL` / `E2E_PASSWORD` if your local seed uses
   different credentials, or `E2E_BASE_URL` if the FE isn't on `:3000`.

## Run

```sh
npx playwright test
# or
npm run test:e2e

# headed / debugging:
npx playwright test --headed
npx playwright show-report
```

On failure, trace/video/screenshot are written under `test-results/` — open
the trace with `npx playwright show-trace test-results/**/trace.zip`.
