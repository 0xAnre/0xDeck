import { expect, test, type Page } from '@playwright/test'

/**
 * Real app UI coverage for the consolidated Rolling VWAP band primitive (#262).
 *
 * The band outlines are canvas geometry, so this spec finds a drawn band pixel
 * by color, clicks it like a user, and verifies the selection halo, the shared
 * settings dialog, `Esc` / outside-press dismissal, the header hide/show/delete
 * rows and settings persistence across reload — all through the normal app
 * shell. The Rolling instance is seeded with distinctive band colors so the
 * pixel scan cannot confuse a band with candles, markers or another series.
 */

const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const THEME_STORAGE_KEY = '0xdeck-theme'
const ROLLING_VWAP_STORAGE_KEY = '0xdeck-widget-rolling-vwap-instances'
const PANEL_ID = 'btc-perpetual-chart-e2e'
const BAND_RED = '#FF0000'
const BAND_GREEN = '#00FF00'
const BAND_BLUE = '#0000FF'

type StoredInstance = {
  id: string
  enabled: boolean
  settings: Record<string, unknown>
}

function instance(
  id: string,
  colors: { band1: string; band2: string; band3: string },
  multipliers: [number, number, number] = [1, 0, 0],
): StoredInstance {
  return {
    id,
    enabled: true,
    settings: {
      fixedTimePeriod: { useFixedTimePeriod: false, days: 1, hours: 0, minutes: 0 },
      minBars: 20,
      multipliers: {
        multiplier1: multipliers[0],
        multiplier2: multipliers[1],
        multiplier3: multipliers[2],
      },
      bandColors: colors,
      bandOpacities: { band1: 100, band2: 100, band3: 100 },
      bandLineWidths: { band1: 2, band2: 2, band3: 2 },
      bandLineStyles: { band1: 'solid', band2: 'solid', band3: 'solid' },
      fillColor: '#A3A3A3',
      fillOpacity: 0,
      lineWidth: 1,
      lineColor: '#111111',
      lineOpacity: 100,
      lineStyle: 'solid',
    },
  }
}

async function seedWorkspace(page: Page, instances: StoredInstance[]): Promise<void> {
  await page.addInitScript(
    ([workspaceKey, themeKey, instancesKey, panelId, seeded]) => {
      // Seed once per storage context: a reload must read the app's saved state,
      // not re-seed over it.
      if (window.localStorage.getItem(workspaceKey) === null) {
        window.localStorage.setItem(
          workspaceKey,
          JSON.stringify({ activePanels: [panelId], layout: [], gridVersion: 3 }),
        )
      }
      // The halo/ink probes rely on the light Cream surface (#FDF6E3).
      window.localStorage.setItem(themeKey, 'cream')
      if (window.localStorage.getItem(instancesKey) === null) {
        window.localStorage.setItem(
          instancesKey,
          JSON.stringify({ [panelId]: seeded }),
        )
      }
    },
    [
      WORKSPACE_STORAGE_KEY,
      THEME_STORAGE_KEY,
      ROLLING_VWAP_STORAGE_KEY,
      PANEL_ID,
      instances,
    ] as const,
  )
}

function indicatorsTrigger(page: Page) {
  return page.locator(`#${PANEL_ID}-indicators`)
}

function settingsDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Rolling VWAP settings' })
}

type BandPixel = { cssX: number; cssY: number; bitmapX: number; bitmapY: number }

/** Finds the top-most core pixel of a band line by its exact RGB color. */
async function findBandPixel(page: Page, hex: string): Promise<BandPixel> {
  const rgb = [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
  return page.evaluate((target) => {
    const container = document.querySelector('[data-testid="btc-perp-chart"]')
    if (!(container instanceof HTMLElement)) throw new Error('chart container missing')
    const composed = document.createElement('canvas')
    composed.width = container.clientWidth
    composed.height = container.clientHeight
    const context = composed.getContext('2d')
    if (!context) throw new Error('2d context missing')
    context.fillStyle = '#FDF6E3'
    context.fillRect(0, 0, composed.width, composed.height)
    const containerRect = container.getBoundingClientRect()
    for (const canvas of container.querySelectorAll('canvas')) {
      const rect = canvas.getBoundingClientRect()
      context.drawImage(
        canvas,
        Math.round(rect.left - containerRect.left),
        Math.round(rect.top - containerRect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      )
    }
    const data = context.getImageData(0, 0, composed.width, composed.height).data
    // Scan downwards from the top: the first hit is the upper band line, which
    // is farthest from the native centre line and cannot be confused with a
    // centre-line selection (the centre hit deliberately wins when it is near).
    for (let y = 0; y < Math.floor(composed.height * 0.85); y += 1) {
      for (let x = Math.floor(composed.width * 0.1); x < Math.floor(composed.width * 0.75); x += 1) {
        const index = (y * composed.width + x) * 4
        if (
          Math.abs(data[index] - target[0]) <= 2 &&
          Math.abs(data[index + 1] - target[1]) <= 2 &&
          Math.abs(data[index + 2] - target[2]) <= 2
        ) {
          const rect = container.getBoundingClientRect()
          return {
            cssX: rect.left + x,
            cssY: rect.top + y,
            bitmapX: x,
            bitmapY: y,
          }
        }
      }
    }
    throw new Error(`band color ${target.join(',')} not found`)
  }, rgb)
}

async function waitForBandPixel(page: Page, hex: string, timeout = 45_000): Promise<BandPixel> {
  await expect
    .poll(
      async () => {
        try {
          return (await findBandPixel(page, hex)).bitmapX
        } catch {
          return null
        }
      },
      { timeout },
    )
    .not.toBeNull()
  return findBandPixel(page, hex)
}

/**
 * Counts the band's own color in two short vertical columns either side of the
 * line. The selected band gains a `width + 5px` halo in the same color at 30%
 * alpha, so the count grows from the bare 2px stroke to the halo stroke. The
 * columns avoid the crosshair's vertical line at the clicked x, and the count
 * is channel-dominant (red band -> red channel), which excludes grey candles,
 * the blue-grey crosshair and the cream background.
 */
async function bandColumnInk(page: Page, pixel: BandPixel, hex: string): Promise<number> {
  const channel = hex === BAND_RED ? 0 : hex === BAND_GREEN ? 1 : 2
  return page.evaluate(
    (target) => {
      const container = document.querySelector('[data-testid="btc-perp-chart"]')
      if (!(container instanceof HTMLElement)) throw new Error('chart container missing')
      const composed = document.createElement('canvas')
      composed.width = container.clientWidth
      composed.height = container.clientHeight
      const context = composed.getContext('2d')
      if (!context) throw new Error('2d context missing')
      context.fillStyle = '#FDF6E3'
      context.fillRect(0, 0, composed.width, composed.height)
      const containerRect = container.getBoundingClientRect()
      for (const canvas of container.querySelectorAll('canvas')) {
        const rect = canvas.getBoundingClientRect()
        context.drawImage(
          canvas,
          Math.round(rect.left - containerRect.left),
          Math.round(rect.top - containerRect.top),
          Math.round(rect.width),
          Math.round(rect.height),
        )
      }
      const half = 14
      const y0 = Math.max(0, target.bitmapY - half)
      const height = Math.min(composed.height - y0, half * 2 + 1)
      let ink = 0
      for (const offset of [-8, 8]) {
        const x = target.bitmapX + offset
        if (x < 0 || x >= composed.width) continue
        const data = context.getImageData(x, y0, 1, height).data
        for (let index = 0; index < data.length; index += 4) {
          const channels = [data[index], data[index + 1], data[index + 2]]
          const value = channels[target.channel]
          const others = channels.filter((_, position) => position !== target.channel)
          if (value > 120 && value - Math.max(...others) > 25) ink += 1
        }
      }
      return ink
    },
    { bitmapX: pixel.bitmapX, bitmapY: pixel.bitmapY, channel },
  )
}

async function pixelCount(page: Page, hex: string): Promise<number> {
  const rgb = [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ]
  return page.evaluate((target) => {
    const container = document.querySelector('[data-testid="btc-perp-chart"]')
    if (!(container instanceof HTMLElement)) throw new Error('chart container missing')
    const composed = document.createElement('canvas')
    composed.width = container.clientWidth
    composed.height = container.clientHeight
    const context = composed.getContext('2d')
    if (!context) throw new Error('2d context missing')
    context.fillStyle = '#FDF6E3'
    context.fillRect(0, 0, composed.width, composed.height)
    const containerRect = container.getBoundingClientRect()
    for (const canvas of container.querySelectorAll('canvas')) {
      const rect = canvas.getBoundingClientRect()
      context.drawImage(
        canvas,
        Math.round(rect.left - containerRect.left),
        Math.round(rect.top - containerRect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      )
    }
    const data = context.getImageData(0, 0, composed.width, composed.height).data
    let count = 0
    for (let index = 0; index < data.length; index += 4) {
      if (
        Math.abs(data[index] - target[0]) <= 2 &&
        Math.abs(data[index + 1] - target[1]) <= 2 &&
        Math.abs(data[index + 2] - target[2]) <= 2
      ) {
        count += 1
      }
    }
    return count
  }, rgb)
}

async function openIndicators(page: Page): Promise<void> {
  await indicatorsTrigger(page).click()
  await expect(page.getByRole('button', { name: 'Add Rolling VWAP' })).toBeVisible()
}

async function closeMenu(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Add Rolling VWAP' })).toHaveCount(0)
}

async function readStoredInstances(page: Page): Promise<StoredInstance[]> {
  return page.evaluate((storageKey) => {
    const raw = window.localStorage.getItem(storageKey)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as Record<string, StoredInstance[]>
    return Object.values(parsed).flat()
  }, ROLLING_VWAP_STORAGE_KEY)
}

test.describe('Rolling VWAP band primitive interaction', () => {
  test('click selects a band with its own halo, double click opens settings, Esc/outside clear it', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedWorkspace(page, [instance('rv-1', { band1: BAND_RED, band2: BAND_GREEN, band3: BAND_BLUE })])
    await page.goto('/')
    await expect(indicatorsTrigger(page)).toBeVisible()

    const redPixel = await waitForBandPixel(page, BAND_RED)
    expect(await pixelCount(page, BAND_RED)).toBeGreaterThan(0)
    const bareInk = await bandColumnInk(page, redPixel, BAND_RED)

    await page.mouse.click(redPixel.cssX, redPixel.cssY)
    await page.waitForTimeout(250)
    const selectedInk = await bandColumnInk(page, redPixel, BAND_RED)
    expect(selectedInk, `band 1 halo (${bareInk} -> ${selectedInk})`).toBeGreaterThan(
      bareInk + 2,
    )

    // Esc clears the transient selection without opening any dialog.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
    expect(await bandColumnInk(page, redPixel, BAND_RED)).toBeLessThanOrEqual(bareInk + 1)

    // Single click again, then a press elsewhere on the pane releases it.
    await page.mouse.click(redPixel.cssX, redPixel.cssY)
    await page.waitForTimeout(250)
    expect(await bandColumnInk(page, redPixel, BAND_RED)).toBeGreaterThan(bareInk + 2)
    const chartBox = await page.locator('[data-testid="btc-perp-chart"]').boundingBox()
    if (!chartBox) throw new Error('chart box missing')
    await page.mouse.click(chartBox.x + 12, chartBox.y + 20)
    await page.waitForTimeout(250)
    expect(await bandColumnInk(page, redPixel, BAND_RED)).toBeLessThanOrEqual(bareInk + 1)
    await expect(settingsDialog(page)).toHaveCount(0)

    // Double click the same band opens the shared per-instance dialog.
    await page.mouse.dblclick(redPixel.cssX, redPixel.cssY)
    await expect(settingsDialog(page)).toBeVisible()
    await expect(settingsDialog(page)).toContainText('Rolling VWAP 1')
    await page.keyboard.press('Escape')
    await expect(settingsDialog(page)).toHaveCount(0)
    // Closing the dialog is not a deselect: the object stays selected until a
    // press elsewhere on the pane.
    expect(await bandColumnInk(page, redPixel, BAND_RED)).toBeGreaterThan(bareInk + 2)
    const emptyBox = await page.locator('[data-testid="btc-perp-chart"]').boundingBox()
    if (!emptyBox) throw new Error('chart box missing')
    await page.mouse.click(emptyBox.x + 12, emptyBox.y + 20)
    await expect
      .poll(() => bandColumnInk(page, redPixel, BAND_RED))
      .toBeLessThanOrEqual(bareInk + 1)
  })

  test('the band part is per band and per instance, not a whole-object halo', async ({ page }) => {
    test.setTimeout(120_000)
    const outer = instance('rv-2', {
      band1: BAND_GREEN,
      band2: BAND_GREEN,
      band3: BAND_GREEN,
    })
    // Separate the two instances geometrically so a click can only resolve one
    // of them; identical multipliers would overlap and the topmost wins.
    outer.settings.multipliers = { multiplier1: 9, multiplier2: 0, multiplier3: 0 }
    const inner = instance('rv-1', {
      band1: BAND_RED,
      band2: BAND_RED,
      band3: BAND_RED,
    })
    inner.settings.multipliers = { multiplier1: 4, multiplier2: 0, multiplier3: 0 }
    await seedWorkspace(page, [inner, outer])
    await page.goto('/')
    await expect(indicatorsTrigger(page)).toBeVisible()

    const red = await waitForBandPixel(page, BAND_RED)
    const green = await waitForBandPixel(page, BAND_GREEN)
    const redBare = await bandColumnInk(page, red, BAND_RED)
    const greenBare = await bandColumnInk(page, green, BAND_GREEN)

    await page.mouse.click(red.cssX, red.cssY)
    await page.waitForTimeout(250)
    expect(await bandColumnInk(page, red, BAND_RED)).toBeGreaterThan(redBare + 2)
    expect(await bandColumnInk(page, green, BAND_GREEN)).toBeLessThanOrEqual(greenBare + 1)

    await page.mouse.click(green.cssX, green.cssY)
    await page.waitForTimeout(250)
    expect(await bandColumnInk(page, green, BAND_GREEN)).toBeGreaterThan(greenBare + 2)
    expect(await bandColumnInk(page, red, BAND_RED)).toBeLessThanOrEqual(redBare + 1)

    // Double click the green instance opens Rolling VWAP 2, not 1.
    await page.mouse.dblclick(green.cssX, green.cssY)
    await expect(settingsDialog(page)).toBeVisible()
    await expect(settingsDialog(page)).toContainText('Rolling VWAP 2')
    await page.keyboard.press('Escape')
    await expect(settingsDialog(page)).toHaveCount(0)
  })

  test('header hide/show/delete and settings persistence go through the same object', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedWorkspace(page, [instance('rv-1', { band1: BAND_RED, band2: BAND_GREEN, band3: BAND_BLUE })])
    await page.goto('/')
    await expect(indicatorsTrigger(page)).toBeVisible()

    const red = await waitForBandPixel(page, BAND_RED)
    expect(await pixelCount(page, BAND_RED)).toBeGreaterThan(0)

    // Hide through the header object row: bands and halo leave the chart.
    await openIndicators(page)
    const rollingRow = page
      .getByRole('menuitem', { name: 'Rolling VWAP 1 settings' })
      .locator('..')
    await rollingRow.getByRole('menuitem', { name: 'Hide object' }).click()
    await closeMenu(page)
    await expect.poll(() => pixelCount(page, BAND_RED)).toBe(0)
    await page.mouse.click(red.cssX, red.cssY)
    await page.waitForTimeout(250)
    expect(await bandColumnInk(page, red, BAND_RED)).toBe(0)
    await page.mouse.dblclick(red.cssX, red.cssY)
    await page.waitForTimeout(250)
    await expect(settingsDialog(page)).toHaveCount(0)

    // Show again restores the band and keeps the same instance.
    await openIndicators(page)
    await page
      .getByRole('menuitem', { name: 'Rolling VWAP 1 settings' })
      .locator('..')
      .getByRole('menuitem', { name: 'Show object' })
      .click()
    await closeMenu(page)
    await expect.poll(() => pixelCount(page, BAND_RED)).toBeGreaterThan(0)

    // Settings still open from the header gear and save through the dialog.
    await openIndicators(page)
    await page.getByRole('menuitem', { name: 'Rolling VWAP 1 settings' }).click()
    await expect(settingsDialog(page)).toBeVisible()
    await page.locator('#rolling-vwap-band1-multiplier').fill('3')
    await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)

    const stored = await readStoredInstances(page)
    expect(stored).toHaveLength(1)
    expect(
      (stored[0].settings.multipliers as Record<string, number>).multiplier1,
    ).toBe(3)

    await page.reload()
    await expect(indicatorsTrigger(page)).toBeVisible()
    await waitForBandPixel(page, BAND_RED)
    await openIndicators(page)
    await page.getByRole('menuitem', { name: 'Rolling VWAP 1 settings' }).click()
    await expect(settingsDialog(page)).toBeVisible()
    await expect(page.locator('#rolling-vwap-band1-multiplier')).toHaveValue('3')
    await page.keyboard.press('Escape')
    await expect(settingsDialog(page)).toHaveCount(0)

    // Delete through the same row removes the object and its geometry.
    await openIndicators(page)
    await page.getByRole('menuitem', { name: 'Delete Rolling VWAP 1' }).click()
    await closeMenu(page)
    await expect.poll(() => pixelCount(page, BAND_RED)).toBe(0)
    expect(await readStoredInstances(page)).toHaveLength(0)
  })
})
