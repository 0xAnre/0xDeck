import { expect, test, type Page } from '@playwright/test'

/**
 * Workspace screen restore across a browser refresh (#216).
 *
 * The workspace scroller is an inner `overflow:auto` element, so the browser never restores its
 * offset on reload (verified: Chromium restores the document viewport only). The app therefore
 * stores the active screen index per tab in `sessionStorage` and restores it once, after the
 * viewport measurement produced the virtual 9-screen extent.
 *
 * Covered here:
 * - `m` + `5` → reload → still Screen 5, and Screen Lock ON afterwards holds Screen 5 (not Screen 1);
 * - a screen reached by manual wheel scrolling → reload → same screen;
 * - the stored screen is per tab: a new tab opens on Screen 1;
 * - an invalid stored value falls back to Screen 1 without an uncaught error.
 *
 * Local-only, like the rest of the suite: this spec is intentionally **not** wired into
 * `.github/workflows/pr-checks.yml`. No backend is required — the workspace is seeded with a Notes
 * panel, which needs no data.
 */

const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const SCREEN_STORAGE_KEY = '0xdeck-workspace-screen'
const SCREEN_COUNT = 9

// A dev-server reload is slow in the first run of the suite (Vite re-optimizes dependencies), so a
// multi-reload spec would otherwise spend its whole budget on navigation before reaching its asserts.
test.setTimeout(90_000)

/** One workspace with a Notes panel: no backend, but the full grid shell and scroller. */
function notesWorkspacePayload(): string {
  return JSON.stringify({
    version: 2,
    activeWorkspaceId: 'ws-1',
    workspaces: [
      {
        id: 'ws-1',
        activePanels: ['notes-e2e'],
        layout: [{ i: 'notes-e2e', x: 0, y: 0, w: 18, h: 12 }],
        gridVersion: 3,
      },
    ],
  })
}

type ScreenMetrics = {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
}

function readScreenMetrics(page: Page): Promise<ScreenMetrics | null> {
  return page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('main.workspace-scroller')
    if (!scroller) return null
    return {
      scrollTop: scroller.scrollTop,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
    }
  })
}

/** Zero-based screen index the workspace currently shows. */
async function currentScreenIndex(page: Page): Promise<number | null> {
  const metrics = await readScreenMetrics(page)
  if (!metrics || metrics.clientHeight === 0) return null
  return Math.round(metrics.scrollTop / metrics.clientHeight)
}

/** Waits until the virtual 9-screen extent exists, so screen jumps and restores are reachable. */
async function expectWorkspaceScreensReady(page: Page): Promise<void> {
  await expect(page.locator('main.workspace-scroller')).toBeVisible()
  await expect
    .poll(async () => {
      const metrics = await readScreenMetrics(page)
      return metrics ? metrics.scrollHeight >= metrics.clientHeight * SCREEN_COUNT : false
    })
    .toBe(true)
}

async function expectScreen(page: Page, screenIndex: number): Promise<void> {
  await expect.poll(() => currentScreenIndex(page)).toBe(screenIndex)
}

/**
 * Seeds the workspace payload once per browser context. `addInitScript` runs on every navigation,
 * so an existing key is left untouched: a reload must observe what the app itself persisted.
 */
async function seedWorkspace(page: Page): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (window.localStorage.getItem(key) === null) window.localStorage.setItem(key, value)
    },
    { key: WORKSPACE_STORAGE_KEY, value: notesWorkspacePayload() },
  )
}

async function openWorkspace(page: Page): Promise<void> {
  await seedWorkspace(page)
  await page.goto('/')
  await expectWorkspaceScreensReady(page)
}

test('reopens on the screen the tab was on after a refresh', async ({ page }) => {
  await openWorkspace(page)
  await expectScreen(page, 0)

  await page.keyboard.press('m')
  await page.keyboard.press('5')
  await expectScreen(page, 4)
  await expect
    .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), SCREEN_STORAGE_KEY))
    .toBe('4')

  await page.reload()
  await expectWorkspaceScreensReady(page)
  await expectScreen(page, 4)

  // Screen Lock ON must pin the restored screen instead of snapping back to Screen 1.
  const screenLockButton = page.getByRole('button', { name: /Screen Lock/ })
  await screenLockButton.click()
  await expect(screenLockButton).toHaveAttribute('aria-pressed', 'true')
  await expectScreen(page, 4)
  const metrics = await readScreenMetrics(page)
  expect(metrics?.scrollTop).toBe((metrics?.clientHeight ?? 0) * 4)
})

test('reopens on a screen that was reached by manual wheel scrolling', async ({ page }) => {
  await openWorkspace(page)
  await expectScreen(page, 0)

  await page.mouse.move(720, 600)
  for (let step = 0; step < 12; step += 1) {
    await page.mouse.wheel(0, 300)
    await page.waitForTimeout(30)
  }
  await expect.poll(() => currentScreenIndex(page)).not.toBe(0)
  const scrolledScreenIndex = await currentScreenIndex(page)
  expect(scrolledScreenIndex).not.toBeNull()

  await page.reload()
  await expectWorkspaceScreensReady(page)
  await expectScreen(page, scrolledScreenIndex!)
})

test('keeps the stored screen per tab: a new tab opens on Screen 1', async ({ page, context }) => {
  await openWorkspace(page)
  await page.keyboard.press('m')
  await page.keyboard.press('5')
  await expectScreen(page, 4)

  const secondTab = await context.newPage()
  try {
    await secondTab.goto('/')
    await expectWorkspaceScreensReady(secondTab)
    await expectScreen(secondTab, 0)
  } finally {
    await secondTab.close()
  }
})

test('falls back to Screen 1 for an invalid stored screen index without an uncaught error', async ({
  page,
}) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(String(error)))

  await openWorkspace(page)
  await expectScreen(page, 0)

  for (const invalid of ['42', 'abc']) {
    await page.evaluate(
      ({ key, value }) => window.sessionStorage.setItem(key, value),
      { key: SCREEN_STORAGE_KEY, value: invalid },
    )
    await page.reload()
    await expectWorkspaceScreensReady(page)
    await expectScreen(page, 0)
  }

  expect(pageErrors).toEqual([])
})
