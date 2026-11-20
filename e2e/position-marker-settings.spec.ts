import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Browser regression for #242 (review follow-up F2): the Position Markers size
 * setting must actually reach storage and the panel must re-read it after a
 * reload, while `Cancel` must leave the stored record untouched.
 *
 * The two silent regressions this guards against are invisible to
 * `node:test`: dropping the size argument from
 * `hyperliquidFillGroupsToMarkers(...)` and dropping
 * `positionMarkerSettings.size` from the markers effect dependency array both
 * left `npm run lint`, `npm run test:market` and `npm run test:ui` green (the
 * second one only produced an eslint *warning*, exit 0). The source guard in
 * `src/market/positionMarkers.test.ts` pins the wiring; this spec pins the
 * user-visible round-trip.
 *
 * Deliberately independent of live Hyperliquid fills: the assertions are the
 * stored record and the dialog state, never marker pixels. The panel is seeded
 * with `enabled: false` (the stored default) so the toggle never has to load
 * account fills, and `enabled` must stay unchanged while only the size moves.
 */

const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const EXCHANGE_STORAGE_KEY = '0xdeck-widget-market-exchanges'
const POSITION_MARKERS_STORAGE_KEY = '0xdeck-widget-market-position-markers'

/** Fixed panel id: the settings record is keyed by panel id. */
const PANEL_ID = 'btc-perpetual-chart-e2e'
/** Slider step is 0.25 from a 0.5 minimum, so 6 presses land exactly on 2. */
const STEP_PRESSES_TO_2 = 6
const STEP_PRESSES_TO_2_5 = 8

type StoredSettings = { enabled: boolean; size: number }

function indicatorsTrigger(page: Page): Locator {
  return page.locator(`#${PANEL_ID}-indicators`)
}

function settingsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Position Markers settings' })
}

function sizeSlider(page: Page): Locator {
  return page.locator(`#${PANEL_ID}-position-marker-size`)
}

/**
 * Starts on a workspace that only contains the BTC Perp widget, switched to
 * Hyperliquid — the Position Markers row (and its gear) is Hyperliquid-only.
 */
async function openBtcPerpWorkspace(page: Page) {
  await page.addInitScript(
    ([workspaceKey, exchangeKey, panelId]) => {
      window.localStorage.setItem(
        workspaceKey,
        JSON.stringify({ activePanels: [panelId], layout: [], gridVersion: 3 }),
      )
      window.localStorage.setItem(
        exchangeKey,
        JSON.stringify({ [panelId]: 'hyperliquid' }),
      )
    },
    [WORKSPACE_STORAGE_KEY, EXCHANGE_STORAGE_KEY, PANEL_ID] as const,
  )
  await page.goto('/')
  await expect(indicatorsTrigger(page)).toBeVisible()
}

/** Opens the dialog through Indicators → Position Markers gear. */
async function openPositionMarkerSettings(page: Page) {
  await indicatorsTrigger(page).click()
  await page.getByRole('menuitem', { name: 'Position Markers settings' }).click()
  await expect(settingsDialog(page)).toBeVisible()
}

/** Drives the thumb to `min + steps * 0.25` through the keyboard. */
async function stepSizeSlider(page: Page, steps: number) {
  const slider = sizeSlider(page)
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < steps; step += 1) {
    await slider.press('ArrowRight')
  }
}

/** Stored settings for the seeded panel, or `null` before any save. */
async function readStoredSettings(page: Page): Promise<StoredSettings | null> {
  return page.evaluate(
    ([storageKey, panelId]) => {
      const raw = window.localStorage.getItem(storageKey)
      if (raw === null) return null
      const map = JSON.parse(raw) as Record<string, unknown>
      return (map[panelId] ?? null) as StoredSettings | null
    },
    [POSITION_MARKERS_STORAGE_KEY, PANEL_ID] as [string, string],
  )
}

test.describe('position markers size setting', () => {
  test('#242 saves the marker size, survives a reload and never writes on Cancel', async ({
    page,
  }) => {
    await openBtcPerpWorkspace(page)
    await openPositionMarkerSettings(page)
    const dialog = settingsDialog(page)

    // The panel-scoped ids from the plate: the label names the slider.
    await expect(page.getByRole('slider', { name: 'Marker Size' })).toHaveId(
      `${PANEL_ID}-position-marker-size`,
    )
    // Nothing is stored before the first Save; the dialog shows the default.
    expect(await readStoredSettings(page)).toBeNull()
    await expect(sizeSlider(page)).toHaveAttribute('aria-valuenow', '1')

    // Move the draft to 2× and commit it.
    await stepSizeSlider(page, STEP_PRESSES_TO_2)
    await expect(sizeSlider(page)).toHaveAttribute('aria-valuenow', '2')
    await expect(dialog.getByText('2×')).toBeVisible()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    // The size reached storage; `enabled` stayed at its unchanged default.
    expect(await readStoredSettings(page)).toEqual({ enabled: false, size: 2 })

    // Reload: the panel reads the stored size back, not the module default.
    await page.reload()
    await openPositionMarkerSettings(page)
    await expect(settingsDialog(page)).toBeVisible()
    await expect(sizeSlider(page)).toHaveAttribute('aria-valuenow', '2')
    await expect(settingsDialog(page).getByText('2×')).toBeVisible()

    // A cancelled edit changes neither the dialog value nor the stored record.
    await stepSizeSlider(page, STEP_PRESSES_TO_2_5)
    await expect(sizeSlider(page)).toHaveAttribute('aria-valuenow', '2.5')
    await settingsDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    expect(await readStoredSettings(page)).toEqual({ enabled: false, size: 2 })

    // Reopening proves the discard: the draft is gone, storage governs.
    await openPositionMarkerSettings(page)
    await expect(sizeSlider(page)).toHaveAttribute('aria-valuenow', '2')
  })
})
