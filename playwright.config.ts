import { defineConfig, devices } from '@playwright/test';

// Local FE-to-BE E2E config. This intentionally does NOT spin up dev servers:
// .env.local in this repo points NEXT_PUBLIC_API_BASE_URL at a devtunnel, and a
// Playwright-managed `next dev` would either fight that or silently reuse
// whatever server is already running on :3000 with the wrong backend target.
// Instead: start FE + BE yourself (see e2e/README.md), then run `npx playwright test`.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  timeout: 120_000,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
