import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Browser acceptance for #282: selectable standard-deviation or
 * percentage-of-VWAP Rolling VWAP bands.
 *
 * The backend is mocked with a deterministic 15m series and candles are painted
 * in the Cream page colour, so the only opaque ink on the chart is the Rolling
 * VWAP centre and its seeded red/green/blue band outlines. The spec then reads
 * the real lightweight-charts canvas: it checks which pairs are drawn, that the
 * active distance comes from the selected band type (2 % and 4 % of VWAP are
 * twice apart, far outside the 1σ band), that Save/reload/cancel/dismiss keep
 * the stored record and the rendered geometry in agreement, and that no history
 * request, canvas replacement or viewport reset happens on a settings save.
 */

/**
 * App entry for the spec. The local run uses `/`; the protected preview run
 * sets `OXDECK_E2E_APP_PATH=/previews/pr-<n>/` so `page.goto` opens the
 * preview artifact instead of the canonical root.
 */
const APP_PATH = process.env.OXDECK_E2E_APP_PATH ?? '/'
const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_ID = 'btc-perpetual-chart-rvwap282'
const PANEL_B = 'btc-perpetual-chart-rvwap282b'
const WORKSPACE_STORAGE_KEY = '0xdeck-workspace'
const THEME_STORAGE_KEY = '0xdeck-theme'
const CANDLE_COLORS_STORAGE_KEY = '0xdeck-candle-colors'
const ROLLING_VWAP_STORAGE_KEY = '0xdeck-widget-rolling-vwap-instances'
const BAND_RED = '#FF0000'
const BAND_GREEN = '#00FF00'
const BAND_BLUE = '#0000FF'
const CENTER_INK = '#111111'
const CREAM = '#FDF6E3'

type StoredInstance = {
  id: string
  enabled: boolean
  settings: Record<string, unknown>
  displaySequence: number
}

function candles(count: number, interval: string, beforeSeconds?: number) {
  const lastOpen = beforeSeconds === undefined ? NOW_SECONDS : beforeSeconds - BAR_SECONDS
  return Array.from({ length: count }, (_, index) => {
    const time = lastOpen - (count - 1 - index) * BAR_SECONDS
    const close = 80_000 + (index % 20) * 2
    const rising = index % 2 === 0
    const open = rising ? close - 12 : close + 12
    return {
      symbol: 'BTCUSDT',
      interval,
      time,
      open,
      high: Math.max(open, close) + 24,
      low: Math.min(open, close) - 24,
      close,
      volume: 12.5,
      closed: true,
    }
  })
}

async function mockMarket(page: Page, marketRequests: string[]) {
  await page.routeWebSocket(/\/api\/ws\//, () => {
    // Silent relay: candles come from the deterministic REST history below.
  })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const interval = url.searchParams.get('interval') ?? INTERVAL
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
    if (path.endsWith('/klines/daily-context')) {
      marketRequests.push(path)
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval,
        candles: candles(48, interval),
        available_from: null,
      })
    }
    if (path.endsWith('/klines/history')) {
      marketRequests.push(path)
      const before = Number(url.searchParams.get('before') ?? NOW_SECONDS)
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval,
        candles: candles(48, interval, before),
        available_from: null,
      })
    }
    if (path.endsWith('/klines')) {
      marketRequests.push(path)
      return json({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval,
        candles: candles(48, interval),
        available_from: null,
      })
    }
    return route.fulfill({ status: 503, body: 'not mocked' })
  })
}

function instance(
  id: string,
  displaySequence: number,
  colors: { band1: string; band2: string; band3: string },
  multipliers: [number, number, number],
  extra: Record<string, unknown> = {},
): StoredInstance {
  return {
    id,
    enabled: true,
    displaySequence,
    settings: {
      fixedTimePeriod: { useFixedTimePeriod: false, days: 1, hours: 0, minutes: 0 },
      minBars: 10,
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
      lineWidth: 2,
      lineColor: CENTER_INK,
      lineOpacity: 100,
      lineStyle: 'solid',
      ...extra,
    },
  }
}

type SeedPanel = { panelId: string; instances: StoredInstance[] }

async function seedApp(page: Page, panels: SeedPanel[]) {
  await page.addInitScript(
    ({ workspaceKey, themeKey, colorsKey, rollingKey, panels: seeded }) => {
      if (window.localStorage.getItem(workspaceKey) === null) {
        window.localStorage.setItem(
          workspaceKey,
          JSON.stringify({
            activePanels: seeded.map((panel) => panel.panelId),
            layout: seeded.map((panel, index) => ({
              i: panel.panelId,
              x: index * 18,
              y: 0,
              w: 18,
              h: 18,
            })),
            gridVersion: 3,
          }),
        )
        window.localStorage.setItem(
          '0xdeck-widget-market-intervals',
          JSON.stringify(
            Object.fromEntries(seeded.map((panel) => [panel.panelId, '15m'])),
          ),
        )
        window.localStorage.setItem(
          '0xdeck-widget-market-exchanges',
          JSON.stringify(
            Object.fromEntries(seeded.map((panel) => [panel.panelId, 'binance'])),
          ),
        )
      }
      window.localStorage.setItem(themeKey, 'cream')
      // Candles are painted in the page colour: the canvas then carries only
      // the Rolling VWAP centre and band ink, so exact-colour probes are stable.
      if (window.localStorage.getItem(colorsKey) === null) {
        window.localStorage.setItem(
          colorsKey,
          JSON.stringify({ rising: '#FDF6E3', falling: '#FDF6E3' }),
        )
      }
      if (window.localStorage.getItem(rollingKey) === null) {
        window.localStorage.setItem(
          rollingKey,
          JSON.stringify(
            Object.fromEntries(
              seeded.map((panel) => [panel.panelId, panel.instances]),
            ),
          ),
        )
      }
    },
    {
      workspaceKey: WORKSPACE_STORAGE_KEY,
      themeKey: THEME_STORAGE_KEY,
      colorsKey: CANDLE_COLORS_STORAGE_KEY,
      rollingKey: ROLLING_VWAP_STORAGE_KEY,
      panels,
    },
  )
}

function chart(page: Page, panelId = PANEL_ID): Locator {
  return page.locator(`[data-testid="btc-perp-chart"][data-panel-id="${panelId}"]`)
}

function indicatorsTrigger(page: Page, panelId = PANEL_ID): Locator {
  return page.locator(`#${panelId}-indicators`)
}

function settingsDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: 'Rolling VWAP settings' })
}

async function openSettings(page: Page, label = 'Rolling VWAP 1', panelId = PANEL_ID) {
  await indicatorsTrigger(page, panelId).click()
  await page.getByRole('menuitem', { name: `${label} settings` }).click()
  await expect(settingsDialog(page)).toBeVisible()
}

async function closeIndicatorsMenu(page: Page) {
  if (await page.getByRole('button', { name: 'Add Rolling VWAP' }).isVisible()) {
    await page.keyboard.press('Escape')
  }
}

type BandProbe = {
  dpr: number
  bitmapRatio: number
  width: number
  height: number
  cssX: number
  cssTop: number
  cssLeft: number
  centerY: number | null
  bands: Record<string, { upperY: number | null; lowerY: number | null; count: number }>
}

/** Exact-colour probe of the real chart canvas at one mid-chart column. */
async function probeBands(
  page: Page,
  targets: Record<string, string>,
  panelId = PANEL_ID,
): Promise<BandProbe> {
  const lookup = Object.fromEntries(
    Object.entries(targets).map(([name, hex]) => [
      name,
      [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16)),
    ]),
  )
  return page.evaluate(
    (input) => {
      const container = document.querySelector(
        `[data-testid="btc-perp-chart"][data-panel-id="${input.panelId}"]`,
      )
      if (!(container instanceof HTMLElement)) throw new Error('chart container missing')
      const composed = document.createElement('canvas')
      composed.width = container.clientWidth
      composed.height = container.clientHeight
      const context = composed.getContext('2d')
      if (!context) throw new Error('2d context missing')
      context.fillStyle = input.cream
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
      const x = Math.floor(composed.width * 0.55)
      const column = context.getImageData(x, 0, 1, composed.height).data
      const matches = (index: number, rgb: number[]) =>
        Math.abs(column[index] - rgb[0]) <= 2 &&
        Math.abs(column[index + 1] - rgb[1]) <= 2 &&
        Math.abs(column[index + 2] - rgb[2]) <= 2
      const rowsFor = (rgb: number[]) => {
        const rows: number[] = []
        for (let y = 0; y < composed.height; y += 1) {
          if (matches(y * 4, rgb)) rows.push(y)
        }
        return rows
      }
      const bands: Record<
        string,
        { upperY: number | null; lowerY: number | null; count: number }
      > = {}
      const all = context.getImageData(0, 0, composed.width, composed.height).data
      const countOf = (rgb: number[]) => {
        let count = 0
        for (let index = 0; index < all.length; index += 4) {
          if (
            Math.abs(all[index] - rgb[0]) <= 2 &&
            Math.abs(all[index + 1] - rgb[1]) <= 2 &&
            Math.abs(all[index + 2] - rgb[2]) <= 2
          ) {
            count += 1
          }
        }
        return count
      }
      for (const [name, rgb] of Object.entries(input.targets)) {
        const rows = rowsFor(rgb)
        bands[name] = {
          upperY: rows.length > 0 ? Math.min(...rows) : null,
          lowerY: rows.length > 0 ? Math.max(...rows) : null,
          count: countOf(rgb),
        }
      }
      const centerRows = rowsFor(input.center)
      const centerY =
        centerRows.length > 0
          ? (Math.min(...centerRows) + Math.max(...centerRows)) / 2
          : null
      const canvas = container.querySelector('canvas')
      return {
        dpr: window.devicePixelRatio,
        bitmapRatio: canvas instanceof HTMLCanvasElement ? canvas.width / container.clientWidth : 0,
        width: composed.width,
        height: composed.height,
        cssX: containerRect.left + x,
        cssTop: containerRect.top,
        cssLeft: containerRect.left,
        centerY,
        bands,
      }
    },
    {
      panelId,
      targets: lookup,
      center: [17, 17, 17],
      cream: CREAM,
    },
  )
}

function distanceFromCenter(probe: BandProbe, y: number | null): number | null {
  if (y === null || probe.centerY === null) return null
  return Math.abs(probe.centerY - y)
}

/**
 * The mocked infinite-history pipeline can still append older bars right after
 * the first paint, which rescales the price axis by a few pixels without any
 * user action. Cross-draft comparisons therefore allow that settle tolerance
 * while the guarded unit tests pin exact values.
 */
function expectNear(actual: number | null, expected: number | null, tolerance = 8) {
  expect(actual).not.toBeNull()
  expect(expected).not.toBeNull()
  expect(Math.abs((actual as number) - (expected as number))).toBeLessThanOrEqual(tolerance)
}

/** Channel-dominant ink around a clicked band pixel; the halo adds same-colour ink. */
async function bandColumnInk(
  page: Page,
  pixel: { cssX: number; y: number },
  channel: number,
  panelId = PANEL_ID,
): Promise<number> {
  return page.evaluate(
    (input) => {
      const container = document.querySelector(
        `[data-testid="btc-perp-chart"][data-panel-id="${input.panelId}"]`,
      )
      if (!(container instanceof HTMLElement)) throw new Error('chart container missing')
      const containerRect = container.getBoundingClientRect()
      const bitmapX = Math.round(input.cssX - containerRect.left)
      const composed = document.createElement('canvas')
      composed.width = container.clientWidth
      composed.height = container.clientHeight
      const context = composed.getContext('2d')
      if (!context) throw new Error('2d context missing')
      context.fillStyle = input.cream
      context.fillRect(0, 0, composed.width, composed.height)
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
      let ink = 0
      for (const offset of [-8, 8]) {
        const columnX = bitmapX + offset
        if (columnX < 0 || columnX >= composed.width) continue
        const data = context.getImageData(columnX, 0, 1, composed.height).data
        for (let index = 0; index < data.length; index += 4) {
          const channels = [data[index], data[index + 1], data[index + 2]]
          const value = channels[input.channel]
          const others = channels.filter((_, position) => position !== input.channel)
          if (value > 120 && value - Math.max(...others) > 25) ink += 1
        }
      }
      return ink
    },
    { panelId, cssX: pixel.cssX, channel, cream: CREAM },
  )
}

async function readStoredRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), ROLLING_VWAP_STORAGE_KEY)
}

async function readStoredInstances(page: Page): Promise<StoredInstance[]> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return []
    const parsed = JSON.parse(raw) as Record<string, StoredInstance[]>
    return Object.values(parsed).flat()
  }, ROLLING_VWAP_STORAGE_KEY)
}

async function tagChartCanvases(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const tags: string[] = []
    document.querySelectorAll('[data-testid="btc-perp-chart"] canvas').forEach((canvas, index) => {
      const tag = `canvas-${index}`
      canvas.setAttribute('data-e2e-canvas', tag)
      tags.push(tag)
    })
    return tags
  })
}

async function readChartCanvasTags(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-e2e-canvas]')).map(
      (canvas) => canvas.getAttribute('data-e2e-canvas') ?? '',
    ),
  )
}

/** The time-axis strip is unaffected by band offsets; a viewport reset changes it. */
async function timeAxisScreenshot(page: Page, panelId = PANEL_ID): Promise<Buffer> {
  const box = await chart(page, panelId).boundingBox()
  if (!box) throw new Error('chart has no bounding box')
  await page.mouse.move(2, 2)
  await page.waitForTimeout(150)
  return page.screenshot({
    clip: {
      x: Math.round(box.x),
      y: Math.round(box.y + box.height - 24),
      width: Math.round(box.width),
      height: 24,
    },
  })
}

async function selectBandType(page: Page, name: 'Standard deviation' | 'Percentage of VWAP') {
  await settingsDialog(page).locator('#rolling-vwap-band-type').click()
  await page.getByRole('option', { name, exact: true }).click()
}

async function chooseDismissal(page: Page, dismissal: 'cancel' | 'close' | 'escape' | 'outside') {
  if (dismissal === 'cancel') {
    await settingsDialog(page).getByRole('button', { name: 'Cancel' }).click()
  } else if (dismissal === 'close') {
    await settingsDialog(page).getByRole('button', { name: 'Close' }).click()
  } else if (dismissal === 'escape') {
    await page.keyboard.press('Escape')
  } else {
    await page.mouse.click(5, 5)
  }
  await expect(settingsDialog(page)).toHaveCount(0)
}

async function waitForBand(page: Page, hex: string, panelId = PANEL_ID): Promise<BandProbe> {
  await expect
    .poll(
      async () => {
        const probe = await probeBands(page, { band: hex }, panelId)
        return probe.bands.band.count
      },
      { timeout: 45_000 },
    )
    .toBeGreaterThan(0)
  return probeBands(page, { band: hex }, panelId)
}

test.describe('Rolling VWAP percentage bands (#282)', () => {
  test('legacy stdev record loads untouched; Percentage positions, saves, reloads and keeps the viewport', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const legacy = instance('rv-legacy', 1, {
      band1: BAND_RED,
      band2: BAND_GREEN,
      band3: BAND_BLUE,
    }, [1, 5, 9])
    await seedApp(page, [{ panelId: PANEL_ID, instances: [legacy] }])
    const requests: string[] = []
    await mockMarket(page, requests)
    await page.goto(APP_PATH)
    await expect(indicatorsTrigger(page)).toBeVisible()
    const seededRaw = await readStoredRaw(page)
    expect(seededRaw).not.toBeNull()

    const initial = await waitForBand(page, BAND_RED)
    expect(initial.centerY).not.toBeNull()
    // Legacy standard-deviation record is rendered as-is and never rewritten on load.
    expect(await readStoredRaw(page)).toBe(seededRaw)
    expect(initial.bands.band.count).toBeGreaterThan(0)
    const stdevProbe = await probeBands(page, {
      red: BAND_RED,
      green: BAND_GREEN,
      blue: BAND_BLUE,
    })
    expect(stdevProbe.bands.green.count).toBeGreaterThan(0)
    expect(stdevProbe.bands.blue.count).toBeGreaterThan(0)
    const stdevRedDistance = distanceFromCenter(stdevProbe, stdevProbe.bands.red.upperY)
    expect(stdevRedDistance).not.toBeNull()

    // Zoom so a recreated chart or a reset viewport is observable in the time axis.
    const box = await chart(page).boundingBox()
    if (!box) throw new Error('chart has no bounding box')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.wheel(0, -320)
    await page.waitForTimeout(600)
    const tagsBefore = await tagChartCanvases(page)
    const axisBefore = await timeAxisScreenshot(page)
    await page.waitForTimeout(400)
    const requestsBefore = requests.length

    await openSettings(page)
    await expect(settingsDialog(page)).toContainText('Standard deviation')
    for (const [index, value] of [1, 5, 9].entries()) {
      await expect(
        settingsDialog(page).locator(`#rolling-vwap-band${index + 1}-multiplier`),
      ).toHaveValue(String(value))
    }
    // Draft mode switch keeps the standard-deviation values: switch back and
    // read them again before selecting Percentage for real.
    await selectBandType(page, 'Percentage of VWAP')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-percentage')).toHaveValue('0')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-percentage')).toHaveAttribute(
      'max',
      '100',
    )
    await selectBandType(page, 'Standard deviation')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-multiplier')).toHaveValue('1')
    await selectBandType(page, 'Percentage of VWAP')
    await settingsDialog(page).locator('#rolling-vwap-band1-percentage').fill('2')
    await settingsDialog(page).locator('#rolling-vwap-band2-percentage').fill('4')
    await settingsDialog(page).locator('#rolling-vwap-band3-percentage').fill('0')
    await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)

    await expect.poll(async () => (await probeBands(page, { green: BAND_GREEN })).bands.green.count)
      .toBeGreaterThan(0)
    const percentageProbe = await probeBands(page, {
      red: BAND_RED,
      green: BAND_GREEN,
      blue: BAND_BLUE,
    })
    expect(percentageProbe.centerY).not.toBeNull()
    expect(percentageProbe.bands.red.count).toBeGreaterThan(0)
    expect(percentageProbe.bands.green.count).toBeGreaterThan(0)
    // p3 = 0 hides band 3 even though its stdev multiplier (9) is non-zero.
    expect(percentageProbe.bands.blue.count).toBe(0)
    const redUpper = distanceFromCenter(percentageProbe, percentageProbe.bands.red.upperY)
    const greenUpper = distanceFromCenter(percentageProbe, percentageProbe.bands.green.upperY)
    const redLower = distanceFromCenter(percentageProbe, percentageProbe.bands.red.lowerY)
    const greenLower = distanceFromCenter(percentageProbe, percentageProbe.bands.green.lowerY)
    expect(redUpper).not.toBeNull()
    expect(greenUpper).not.toBeNull()
    // A 2 % distance is far outside the 1σ band this instance had before.
    expect(redUpper!).toBeGreaterThan(stdevRedDistance! * 2)
    // 2 % vs 4 % of the same VWAP: the pixel distances are in a 1:2 ratio on the
    // linear price scale, above and below the unchanged centre.
    expect(redUpper! / greenUpper!).toBeGreaterThan(0.47)
    expect(redUpper! / greenUpper!).toBeLessThan(0.53)
    expect(redLower! / greenLower!).toBeGreaterThan(0.47)
    expect(redLower! / greenLower!).toBeLessThan(0.53)
    console.log(
      `#282 probe dpr=${percentageProbe.dpr} bitmapRatio=${percentageProbe.bitmapRatio.toFixed(3)} ` +
        `centerY=${percentageProbe.centerY} redUpper=${redUpper} greenUpper=${greenUpper} ` +
        `stdevRedDistance=${stdevRedDistance}`,
    )

    // Save applies the selected mode and its values together; both parameter
    // sets stay in the record.
    const stored = await readStoredInstances(page)
    expect(stored).toHaveLength(1)
    expect(stored[0].settings.bandType).toBe('percentage')
    expect(stored[0].settings.bandPercentages).toEqual({ band1: 2, band2: 4, band3: 0 })
    expect(stored[0].settings.multipliers).toEqual({
      multiplier1: 1,
      multiplier2: 5,
      multiplier3: 9,
    })

    // No history refetch, canvas replacement or viewport reset from the save.
    await page.waitForTimeout(600)
    expect(requests.length).toBe(requestsBefore)
    expect((await readChartCanvasTags(page)).sort()).toEqual([...tagsBefore].sort())
    expect((await timeAxisScreenshot(page)).equals(axisBefore)).toBe(true)

    // Reload restores the selected mode and the percentage values.
    await page.reload()
    await expect(indicatorsTrigger(page)).toBeVisible()
    await waitForBand(page, BAND_RED)
    const reloaded = await probeBands(page, {
      red: BAND_RED,
      green: BAND_GREEN,
      blue: BAND_BLUE,
    })
    expect(reloaded.bands.green.count).toBeGreaterThan(0)
    expect(reloaded.bands.blue.count).toBe(0)
    await openSettings(page)
    await expect(settingsDialog(page)).toContainText('Percentage of VWAP')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-percentage')).toHaveValue('2')
    await expect(settingsDialog(page).locator('#rolling-vwap-band2-percentage')).toHaveValue('4')

    // Switching back to Standard deviation restores all three stdev pairs and
    // keeps the stored percentages.
    await selectBandType(page, 'Standard deviation')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-multiplier')).toHaveValue('1')
    await expect(settingsDialog(page).locator('#rolling-vwap-band3-multiplier')).toHaveValue('9')
    await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    await expect.poll(async () => (await probeBands(page, { blue: BAND_BLUE })).bands.blue.count)
      .toBeGreaterThan(0)
    const backToStdev = await probeBands(page, { red: BAND_RED })
    const stdevAgain = distanceFromCenter(backToStdev, backToStdev.bands.red.upperY)
    expect(stdevAgain).not.toBeNull()
    expect(stdevAgain! / redUpper!).toBeLessThan(0.5)
    const storedAfterSwitch = await readStoredInstances(page)
    expect(storedAfterSwitch[0].settings.bandType).toBe('stdev')
    expect(storedAfterSwitch[0].settings.bandPercentages).toEqual({
      band1: 2,
      band2: 4,
      band3: 0,
    })
  })

  test('Cancel, X, Esc and outside press discard a percentage draft', async ({ page }) => {
    test.setTimeout(180_000)
    const percentage = instance(
      'rv-percent',
      1,
      { band1: BAND_RED, band2: BAND_GREEN, band3: BAND_BLUE },
      [1, 5, 9],
      { bandType: 'percentage', bandPercentages: { band1: 2, band2: 4, band3: 0 } },
    )
    await seedApp(page, [{ panelId: PANEL_ID, instances: [percentage] }])
    await mockMarket(page, [])
    await page.goto(APP_PATH)
    await expect(indicatorsTrigger(page)).toBeVisible()
    await waitForBand(page, BAND_RED)
    await page.waitForTimeout(1_500)
    const rawBefore = await readStoredRaw(page)
    const probeBefore = await probeBands(page, { red: BAND_RED, green: BAND_GREEN })
    expect(probeBefore.bands.green.count).toBeGreaterThan(0)

    for (const dismissal of ['cancel', 'close', 'escape', 'outside'] as const) {
      await openSettings(page)
      await expect(settingsDialog(page)).toContainText('Percentage of VWAP')
      await settingsDialog(page).locator('#rolling-vwap-band1-percentage').fill('8')
      await chooseDismissal(page, dismissal)
      // Cancel/dismissal leaves storage and rendering untouched.
      expect(await readStoredRaw(page)).toBe(rawBefore)
      const probeAfter = await probeBands(page, { red: BAND_RED })
      expectNear(probeAfter.bands.red.upperY, probeBefore.bands.red.upperY)
    }

    // Reopening shows the saved value, and a no-op Save keeps it.
    await openSettings(page)
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-percentage')).toHaveValue('2')
    const beforeNoop = JSON.parse((await readStoredRaw(page)) ?? '{}')
    await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    expect(JSON.parse((await readStoredRaw(page)) ?? '{}')).toEqual(beforeNoop)
    const probeNoop = await probeBands(page, { red: BAND_RED })
    expectNear(probeNoop.bands.red.upperY, probeBefore.bands.red.upperY)
  })

  test('percentage bands keep halo, hit, settings, zero opacity, hide/show/delete', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const percentage = instance(
      'rv-interaction',
      1,
      { band1: BAND_RED, band2: BAND_GREEN, band3: BAND_BLUE },
      [1, 5, 9],
      { bandType: 'percentage', bandPercentages: { band1: 2, band2: 4, band3: 0 } },
    )
    await seedApp(page, [{ panelId: PANEL_ID, instances: [percentage] }])
    await mockMarket(page, [])
    await page.goto(APP_PATH)
    await expect(indicatorsTrigger(page)).toBeVisible()
    await waitForBand(page, BAND_RED)
    await page.waitForTimeout(1_500)
    const probe = await probeBands(page, { red: BAND_RED })
    expect(probe.bands.red.upperY).not.toBeNull()
    const cssY = probe.cssTop + (probe.bands.red.upperY as number)
    const bareInk = await bandColumnInk(page, { cssX: probe.cssX, y: cssY }, 0)

    await page.mouse.click(probe.cssX, cssY)
    await page.waitForTimeout(250)
    expect(await bandColumnInk(page, { cssX: probe.cssX, y: cssY }, 0)).toBeGreaterThan(
      bareInk + 2,
    )
    await page.mouse.dblclick(probe.cssX, cssY)
    await expect(settingsDialog(page)).toBeVisible()
    await expect(settingsDialog(page)).toContainText('Rolling VWAP 1')
    await expect(settingsDialog(page)).toContainText('Percentage of VWAP')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-percentage')).toHaveValue('2')

    // 0 % opacity hides the selected pair without losing its distance.
    await settingsDialog(page).locator('#rolling-vwap-band1-color').click()
    const opacitySlider = page.locator('#rolling-vwap-band1-color-opacity')
    await expect(opacitySlider).toBeVisible()
    await opacitySlider.focus()
    await opacitySlider.press('Home')
    await expect(opacitySlider).toHaveAttribute('aria-valuenow', '0')
    await page.keyboard.press('Escape')
    await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    await expect.poll(async () => (await probeBands(page, { red: BAND_RED })).bands.red.count).toBe(0)
    expect((await readStoredInstances(page))[0].settings.bandPercentages).toEqual({
      band1: 2,
      band2: 4,
      band3: 0,
    })

    // Restore 100 % opacity: the same percentage distance is painted again.
    await openSettings(page)
    await settingsDialog(page).locator('#rolling-vwap-band1-color').click()
    const restoreSlider = page.locator('#rolling-vwap-band1-color-opacity')
    await restoreSlider.focus()
    await restoreSlider.press('End')
    await expect(restoreSlider).toHaveAttribute('aria-valuenow', '100')
    await page.keyboard.press('Escape')
    await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    await expect.poll(async () => (await probeBands(page, { red: BAND_RED })).bands.red.count)
      .toBeGreaterThan(0)
    const restored = await probeBands(page, { red: BAND_RED })
    expectNear(restored.bands.red.upperY, probe.bands.red.upperY)

    // Header hide keeps the percentage instance and hides both pairs; show restores it.
    await indicatorsTrigger(page).click()
    const row = page.getByRole('menuitem', { name: 'Rolling VWAP 1 settings' }).locator('..')
    await row.getByRole('menuitem', { name: 'Hide object' }).click()
    await closeIndicatorsMenu(page)
    await expect.poll(async () => (await probeBands(page, { red: BAND_RED })).bands.red.count).toBe(0)
    await indicatorsTrigger(page).click()
    await page
      .getByRole('menuitem', { name: 'Rolling VWAP 1 settings' })
      .locator('..')
      .getByRole('menuitem', { name: 'Show object' })
      .click()
    await closeIndicatorsMenu(page)
    await expect.poll(async () => (await probeBands(page, { red: BAND_RED })).bands.red.count)
      .toBeGreaterThan(0)

    // Delete removes the object and its geometry.
    await indicatorsTrigger(page).click()
    await page.getByRole('menuitem', { name: 'Delete Rolling VWAP 1' }).click()
    await closeIndicatorsMenu(page)
    await expect.poll(async () => (await probeBands(page, { red: BAND_RED })).bands.red.count).toBe(0)
    expect(await readStoredInstances(page)).toHaveLength(0)
  })

  test('band type and values stay isolated per panel', async ({ page }) => {
    test.setTimeout(180_000)
    const percentage = instance(
      'rv-panel-a',
      1,
      { band1: BAND_RED, band2: BAND_GREEN, band3: BAND_BLUE },
      [1, 0, 0],
      { bandType: 'percentage', bandPercentages: { band1: 2, band2: 0, band3: 0 } },
    )
    const stdev = instance(
      'rv-panel-b',
      1,
      { band1: BAND_GREEN, band2: BAND_RED, band3: BAND_BLUE },
      [1, 0, 0],
    )
    await seedApp(page, [
      { panelId: PANEL_ID, instances: [percentage] },
      { panelId: PANEL_B, instances: [stdev] },
    ])
    await mockMarket(page, [])
    await page.goto(APP_PATH)
    await expect(indicatorsTrigger(page)).toBeVisible()
    await expect(indicatorsTrigger(page, PANEL_B)).toBeVisible()
    await waitForBand(page, BAND_RED)
    await expect
      .poll(async () => (await probeBands(page, { band: BAND_GREEN }, PANEL_B)).bands.band.count)
      .toBeGreaterThan(0)

    const panelA = await probeBands(page, { red: BAND_RED, green: BAND_GREEN })
    const panelB = await probeBands(page, { red: BAND_RED, green: BAND_GREEN }, PANEL_B)
    expect(panelA.bands.red.count).toBeGreaterThan(0)
    expect(panelA.bands.green.count).toBe(0)
    expect(panelB.bands.green.count).toBeGreaterThan(0)
    expect(panelB.bands.red.count).toBe(0)
    const panelBGreenBefore = panelB.bands.green.upperY

    // Hiding panel A's pair through its own percentage distance must not touch
    // panel B's standard-deviation band or stored record.
    await openSettings(page, 'Rolling VWAP 1', PANEL_ID)
    await settingsDialog(page).locator('#rolling-vwap-band1-percentage').fill('0')
    await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    await expect.poll(async () => (await probeBands(page, { red: BAND_RED })).bands.red.count).toBe(0)
    const panelBAfter = await probeBands(page, { green: BAND_GREEN }, PANEL_B)
    expect(panelBAfter.bands.green.count).toBeGreaterThan(0)
    // A workspace re-render may resize the neighbouring panel, so compare the
    // band's position as a fraction of the chart instead of absolute pixels.
    expect(
      Math.abs(
        (panelBAfter.bands.green.upperY as number) / panelBAfter.height -
          (panelBGreenBefore as number) / panelB.height,
      ),
    ).toBeLessThan(0.03)

    const stored = await page.evaluate((key) => {
      const raw = window.localStorage.getItem(key)
      return raw === null ? {} : (JSON.parse(raw) as Record<string, StoredInstance[]>)
    }, ROLLING_VWAP_STORAGE_KEY)
    expect(stored[PANEL_ID][0].settings.bandType).toBe('percentage')
    expect(stored[PANEL_ID][0].settings.bandPercentages).toEqual({
      band1: 0,
      band2: 0,
      band3: 0,
    })
    expect(stored[PANEL_B][0].settings.multipliers).toEqual({
      multiplier1: 1,
      multiplier2: 0,
      multiplier3: 0,
    })
    // The untouched panel B record is not rewritten at all: its pre-#282 shape
    // has no band type field and still renders standard deviation by default.
    expect(stored[PANEL_B][0].settings.bandType).toBeUndefined()
    expect(stored[PANEL_B][0].settings.bandPercentages).toBeUndefined()

    // Reload keeps both panels' independent modes.
    await page.reload()
    await expect(indicatorsTrigger(page)).toBeVisible()
    await expect(indicatorsTrigger(page, PANEL_B)).toBeVisible()
    // Panel A keeps its 0 % distance (hidden pair) while panel B still draws
    // its standard-deviation band.
    await expect
      .poll(async () => (await probeBands(page, { band: BAND_GREEN }, PANEL_B)).bands.band.count)
      .toBeGreaterThan(0)
    expect((await probeBands(page, { red: BAND_RED })).bands.red.count).toBe(0)
    await openSettings(page, 'Rolling VWAP 1', PANEL_ID)
    await expect(settingsDialog(page)).toContainText('Percentage of VWAP')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-percentage')).toHaveValue('0')
    await chooseDismissal(page, 'escape')
    await openSettings(page, 'Rolling VWAP 1', PANEL_B)
    await expect(settingsDialog(page)).toContainText('Standard deviation')
    await expect(settingsDialog(page).locator('#rolling-vwap-band1-multiplier')).toHaveValue('1')
  })
})
