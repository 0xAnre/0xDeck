import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Minimal browser regression for the two confirmed chart-UI bugs.
 *
 * - #169 — pressing inside a chart settings dialog dismisses the color popover
 *   (and keeps the dialog + its unsaved draft), `Esc` closes the popover first,
 *   and a press on the transparent overlay still closes the dialog.
 * - #170 — the per-band solid/dotted style survives `Save`, the
 *   `0xdeck-widget-rolling-vwap-instances` payload and a page reload, while
 *   `Cancel` leaves that payload untouched.
 *
 * Both bugs live in Radix layer stacking (popover over a non-modal dialog) and
 * in localStorage round-tripping, so no `node:test` module can reach them; only
 * a browser can. The chart body is a canvas, so nothing here asserts pixels.
 *
 * Setup stays deliberately small: the workspace is seeded with one BTC Perp
 * panel (the same `0xdeck-workspace` payload the app itself persists) instead of
 * dragging/closing the overlapping default panels, and no `/api` fixture is
 * needed — the Rolling VWAP settings dialog opens from the widget header whether
 * or not candles ever load.
 */

const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const ROLLING_VWAP_STORAGE_KEY = '0xdeck-widget-rolling-vwap-instances'

/** Fixed instance id: the rolling-VWAP storage map is keyed by panel id. */
const PANEL_ID = 'btc-perpetual-chart-e2e'

type StoredBandStyles = { band1: string; band2: string; band3: string }

function indicatorsTrigger(page: Page): Locator {
  return page.locator('#btc-perpetual-chart-e2e-indicators')
}

function colorPopover(page: Page): Locator {
  return page.locator('[data-slot="popover-content"]')
}

function settingsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Rolling VWAP settings' })
}

/** Starts on a workspace that only contains the BTC Perp widget. */
async function openBtcPerpWorkspace(page: Page) {
  await page.addInitScript(
    ([workspaceKey, panelId]) => {
      window.localStorage.setItem(
        workspaceKey,
        JSON.stringify({ activePanels: [panelId], layout: [], gridVersion: 3 }),
      )
    },
    [WORKSPACE_STORAGE_KEY, PANEL_ID] as const,
  )
  await page.goto('/')
  await expect(indicatorsTrigger(page)).toBeVisible()
}

/** Adds one Rolling VWAP overlay from the Indicators menu; leaves the menu open. */
async function addRollingVwapInstance(page: Page) {
  await indicatorsTrigger(page).click()
  await page.getByRole('button', { name: 'Add Rolling VWAP' }).click()
  await expect(page.getByRole('menuitem', { name: 'Rolling VWAP 1 settings' })).toBeVisible()
}

/** Opens the Rolling VWAP settings dialog through Indicators → per-object gear. */
async function openRollingVwapSettings(page: Page) {
  const addButton = page.getByRole('button', { name: 'Add Rolling VWAP' })
  // The dropdown content unmounts when closed, so its presence means "menu open".
  if (!(await addButton.isVisible())) {
    await indicatorsTrigger(page).click()
    await expect(addButton).toBeVisible()
  }
  await page.getByRole('menuitem', { name: 'Rolling VWAP 1 settings' }).click()
  await expect(settingsDialog(page)).toBeVisible()
}

/** Persisted band styles for the one seeded instance, or `null` before any save. */
async function readStoredBandLineStyles(page: Page): Promise<StoredBandStyles | null> {
  const stored = await page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey)
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>)
  }, ROLLING_VWAP_STORAGE_KEY)

  if (stored === null) return null
  const instances = Object.values(stored).flatMap((value) =>
    Array.isArray(value) ? value : [],
  ) as {
    settings?: { bandLineStyles?: StoredBandStyles }
  }[]
  expect(instances).toHaveLength(1)
  return instances[0]?.settings?.bandLineStyles ?? null
}

/** Opens one band's color popover, picks a line style and closes the popover. */
async function selectBandLineStyle(page: Page, band: 1 | 2 | 3, name: 'Line' | 'Dot') {
  await page.locator(`#rolling-vwap-band${band}-color`).click()
  await expect(colorPopover(page)).toBeVisible()
  const toggle = colorPopover(page).getByRole('radio', { name })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')
  await page.keyboard.press('Escape')
  await expect(colorPopover(page)).toHaveCount(0)
}

/** Asserts a band's popover currently shows the expected saved style. */
async function expectBandLineStyle(page: Page, band: 1 | 2 | 3, name: 'Line' | 'Dot') {
  await page.locator(`#rolling-vwap-band${band}-color`).click()
  await expect(colorPopover(page)).toBeVisible()
  await expect(colorPopover(page).getByRole('radio', { name })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')
  await expect(colorPopover(page)).toHaveCount(0)
}

test.describe('chart settings color picker', () => {
  test('#169 dismisses the popover inside the dialog and keeps the dialog draft', async ({
    page,
  }) => {
    await openBtcPerpWorkspace(page)
    await addRollingVwapInstance(page)
    await openRollingVwapSettings(page)
    const dialog = settingsDialog(page)

    // Open the centre-line color popover and pick the dotted style in it.
    await page.locator('#rolling-vwap-line-color').click()
    await expect(colorPopover(page)).toBeVisible()
    const dotToggle = colorPopover(page).getByRole('radio', { name: 'Dot' })
    await dotToggle.click()
    await expect(dotToggle).toHaveAttribute('aria-checked', 'true')

    // A press on the dialog body (its title) dismisses the popover only.
    await dialog.getByRole('heading', { name: 'Rolling VWAP settings' }).click()
    await expect(colorPopover(page)).toHaveCount(0)
    await expect(dialog).toBeVisible()

    // The unsaved draft survived that dismissal, not just the popover state.
    await page.locator('#rolling-vwap-line-color').click()
    await expect(colorPopover(page)).toBeVisible()
    await expect(colorPopover(page).getByRole('radio', { name: 'Dot' })).toHaveAttribute(
      'aria-checked',
      'true',
    )

    // Esc closes the popover first, then the dialog itself.
    await page.keyboard.press('Escape')
    await expect(colorPopover(page)).toHaveCount(0)
    await expect(dialog).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // Reopen and dismiss through the transparent overlay outside the panel.
    await openRollingVwapSettings(page)
    await page.locator('#rolling-vwap-line-color').click()
    await expect(colorPopover(page)).toBeVisible()
    await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 20, y: 20 } })
    await expect(dialog).toHaveCount(0)
    await expect(colorPopover(page)).toHaveCount(0)
  })

  test('#170 persists independent band line styles across save and reload', async ({ page }) => {
    await openBtcPerpWorkspace(page)
    await addRollingVwapInstance(page)
    await openRollingVwapSettings(page)
    const dialog = settingsDialog(page)

    // Issue scenario: band 1 Dot, band 2 Line, band 3 Dot.
    await selectBandLineStyle(page, 1, 'Dot')
    await expectBandLineStyle(page, 2, 'Line')
    await selectBandLineStyle(page, 3, 'Dot')

    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    expect(await readStoredBandLineStyles(page)).toEqual({
      band1: 'dotted',
      band2: 'solid',
      band3: 'dotted',
    })

    // Reload from localStorage and reopen the same instance's settings.
    await page.reload()
    await expect(indicatorsTrigger(page)).toBeVisible()
    await openRollingVwapSettings(page)

    await expectBandLineStyle(page, 1, 'Dot')
    await expectBandLineStyle(page, 2, 'Line')
    await expectBandLineStyle(page, 3, 'Dot')

    // Cancel discards a draft edit without writing the saved payload.
    await selectBandLineStyle(page, 2, 'Dot')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)

    expect(await readStoredBandLineStyles(page)).toEqual({
      band1: 'dotted',
      band2: 'solid',
      band3: 'dotted',
    })
  })
})
