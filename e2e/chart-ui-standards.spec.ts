import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Minimal browser regression for the two confirmed chart-UI bugs.
 *
 * - #169 — pressing inside a chart settings dialog dismisses the color popover
 *   (and keeps the dialog + its unsaved draft), `Esc` closes the popover first,
 *   and a press on the transparent overlay still closes the dialog.
 * - #170 — the per-band solid/dotted style survives `Save`, the
 *   `0xdeck-widget-rolling-vwap-instances` payload and a page reload.
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

    // Band 1 → Dot; band 2 keeps its default Line.
    await page.locator('#rolling-vwap-band1-color').click()
    await expect(colorPopover(page)).toBeVisible()
    await colorPopover(page).getByRole('radio', { name: 'Dot' }).click()
    await expect(colorPopover(page).getByRole('radio', { name: 'Dot' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(colorPopover(page)).toHaveCount(0)

    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    const stored = await page.evaluate((storageKey) => {
      const raw = window.localStorage.getItem(storageKey)
      return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>)
    }, ROLLING_VWAP_STORAGE_KEY)

    expect(stored).not.toBeNull()
    const instances = Object.values(stored ?? {}).flatMap((value) =>
      Array.isArray(value) ? value : [],
    ) as {
      settings?: { bandLineStyles?: StoredBandStyles }
    }[]
    expect(instances).toHaveLength(1)
    expect(instances[0]?.settings?.bandLineStyles).toEqual({
      band1: 'dotted',
      band2: 'solid',
      band3: 'solid',
    })

    // Reload from localStorage and reopen the same instance's settings.
    await page.reload()
    await expect(indicatorsTrigger(page)).toBeVisible()
    await openRollingVwapSettings(page)

    await page.locator('#rolling-vwap-band1-color').click()
    await expect(colorPopover(page).getByRole('radio', { name: 'Dot' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(colorPopover(page)).toHaveCount(0)

    await page.locator('#rolling-vwap-band2-color').click()
    await expect(colorPopover(page).getByRole('radio', { name: 'Line' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})
