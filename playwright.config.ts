import { defineConfig, devices } from '@playwright/test'

/**
 * Minimal browser regression harness for the BTC Perp chart UI (#169, #170).
 *
 * Local-only command: `npm run test:e2e`. It is intentionally **not** wired into
 * `.github/workflows/pr-checks.yml`, so required checks stay stable while the
 * two specs below pin the interactions that `node:test` cannot reach
 * (Radix popover/dialog dismissal and the band-style draft round-trip).
 *
 * The app is served by the normal Vite dev server (no backend needed: the specs
 * open the Rolling VWAP dialog from the widget header and never depend on
 * backend data, and no `page.route` mocking is used). One chromium project and
 * a fixed viewport keep the geometry deterministic, which matters because the
 * specs assert that an overlay press lands outside the dialog panel.
 *
 * The default port is a dedicated e2e port, overridable via `OXDECK_E2E_PORT`
 * for another checkout. `reuseExistingServer` stays off so a stale dev server
 * is never adopted (the dev server uses `strictPort`).
 */
const PORT = Number(process.env.OXDECK_E2E_PORT ?? 57421)
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list']],
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
