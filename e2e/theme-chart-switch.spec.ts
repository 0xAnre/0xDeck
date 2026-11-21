import { expect, test, type Page } from '@playwright/test'

/**
 * Browser regression for in-session theme switching on mounted BTC Perpetual charts (#248).
 *
 * The chart chrome is canvas-rendered by Lightweight Charts: axis text, crosshair, current-price
 * line and the chart background. Cream paints its chart pane with the darker shared
 * `--chart-background` token while the page/header keep the lighter reference cream; dark themes
 * keep the previous transparent canvas. This spec proves the mounted chart is restyled in place:
 *
 * - an empty plot-canvas pixel is exactly the Cream chart target RGB (not the page/card colour);
 * - the price/time axis text pixels switch from light to dark and back with the theme;
 * - the same canvas elements survive the switch (no chart re-creation);
 * - candle palette pixels, persisted viewport and kline request count are unchanged;
 * - Black/Neutral restore the transparent dark-theme canvas and body colours;
 * - Cream survives reload and applies to Binance, Hyperliquid and newly added charts.
 *
 * The backend is stubbed through the existing REST contract (`page.route`) and the WebSocket relay
 * is silenced. Evidence is read from rendered canvas pixels, not chart internals. Local-only: like
 * the other specs in this folder it is intentionally not wired into `.github/workflows/pr-checks.yml`.
 */

const WORKSPACE_KEY = '0xdeck-workspace'
const VIEWPORT_KEY = '0xdeck-widget-market-chart-viewports'
const PANEL_ID = 'btc-perpetual-chart-e2e'
const HYPERLIQUID_PANEL_ID = 'btc-perpetual-chart-e2e-hl'
const INTERVAL = '1m'
const T0 = 1_700_000_000
const CREAM_PAGE_RGB = 'rgb(253, 246, 228)'
const CREAM_CHART_PIXEL = [242, 230, 206, 255] as const
const BLACK_PAGE_RGB = 'rgb(0, 0, 0)'

type EmptyPixel = [number, number, number, number]

type CanvasStats = {
  opaque: number
  avg: number
  dark: number
  light: number
  minLuminance: number
  maxLuminance: number
}

type ChartStats = {
  containerTag: string | null
  canvasTags: (string | null)[]
  priceAxis: CanvasStats
  timeAxis: CanvasStats
  upCandlePixels: number
  downCandlePixels: number
  emptyPixel: EmptyPixel
  plotOpaque: number
}

type StoredRange = { from: number; to: number }

type StoredViewport = {
  visibleLogicalRange: StoredRange
  visibleTimeRange: StoredRange
  autoScale: boolean
  priceRange: StoredRange | null
}

function stubCandles() {
  return Array.from({ length: 300 }, (_, index) => {
    const base = 30_000 + Math.sin(index / 20) * 300
    const direction = index % 2 === 0 ? 1 : -1
    return {
      symbol: 'BTCUSDT',
      interval: INTERVAL,
      time: T0 + index * 60,
      open: base,
      close: base + direction * 10,
      high: base + 40,
      low: base - 40,
      volume: 10,
      closed: true,
    }
  })
}

function workspacePayload(panels: string[]) {
  return JSON.stringify({
    version: 2,
    activeWorkspaceId: 'ws-chart',
    workspaces: [
      {
        id: 'ws-chart',
        activePanels: panels,
        layout: panels.map((panelId, index) => ({
          i: panelId,
          x: index * 18,
          y: 0,
          w: 18,
          h: 14,
        })),
        gridVersion: 3,
      },
    ],
  })
}

async function mockMarket(page: Page) {
  await page.routeWebSocket('**/api/ws/**', () => {})
  await page.route('**/api/market/binance/usdm/btcusdt/klines**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        exchange: 'binance',
        symbol: 'BTCUSDT',
        interval: INTERVAL,
        candles: stubCandles(),
        available_from: T0 - 86_400,
      }),
    }),
  )
  await page.route('**/api/market/hyperliquid/btc/klines**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        exchange: 'hyperliquid',
        symbol: 'BTC',
        interval: INTERVAL,
        candles: stubCandles(),
        available_from: T0 - 86_400,
      }),
    }),
  )
}

async function openCharts(page: Page, panels: string[], exchanges: Record<string, string> = {}) {
  await page.addInitScript(
    ([workspaceKey, workspace, exchangeKey, exchangeMap]) => {
      window.localStorage.setItem(workspaceKey, workspace)
      if (Object.keys(exchangeMap).length > 0) {
        window.localStorage.setItem(exchangeKey, JSON.stringify(exchangeMap))
      }
    },
    [WORKSPACE_KEY, workspacePayload(panels), '0xdeck-widget-market-exchanges', exchanges] as const,
  )
  await mockMarket(page)
  // Set OXDECK_E2E_URL to a path-prefixed absolute URL (e.g. the isolated preview) so this
  // committed spec can also verify the built artifact instead of only the dev server.
  await page.goto(process.env.OXDECK_E2E_URL ?? '/')
  const containers = page.locator('[data-testid="btc-perp-chart"]')
  await expect(containers).toHaveCount(panels.length)
  for (let index = 0; index < panels.length; index += 1) {
    await expect(containers.nth(index)).toHaveAttribute('aria-hidden', 'false', {
      timeout: 60_000,
    })
    await expect(containers.nth(index).locator('canvas').first()).toBeVisible()
  }
  await page.waitForTimeout(1_500)
  return containers
}

/**
 * Tags every mounted chart host and canvas once. A chart re-creation (remove + createChart)
 * replaces the canvases, so surviving tags prove the theme refresh reused the mounted chart.
 */
async function tagMountedCharts(page: Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="btc-perp-chart"]').forEach((container, panelIndex) => {
      container.setAttribute('data-e2e-chart-host', `mounted-${panelIndex}`)
      container.querySelectorAll('canvas').forEach((canvas, canvasIndex) => {
        canvas.setAttribute(
          'data-e2e-chart-canvas',
          `panel-${panelIndex}-canvas-${canvasIndex}`,
        )
      })
    })
  })
}

/**
 * Reads rendered pixels for one chart. Axis canvases have a transparent background, so their
 * opaque-pixel average is the axis text colour. `emptyPixel` is the top-left plot-canvas pixel,
 * an area with no candles/grid lines, and therefore the actual painted chart background.
 */
async function readChartStats(page: Page, panelIndex = 0): Promise<ChartStats> {
  return page.evaluate((index) => {
    const container = document.querySelectorAll('[data-testid="btc-perp-chart"]')[index]
    if (!(container instanceof HTMLElement)) throw new Error(`chart ${index} missing`)
    const canvases = Array.from(container.querySelectorAll('canvas')) as HTMLCanvasElement[]

    const statsFor = (canvas: HTMLCanvasElement) => {
      const context = canvas.getContext('2d')
      if (!context) throw new Error('2d context unavailable')
      const data = context.getImageData(0, 0, canvas.width, canvas.height).data
      let opaque = 0
      let sum = 0
      let dark = 0
      let light = 0
      let upCandlePixels = 0
      let downCandlePixels = 0
      let minLuminance = Number.POSITIVE_INFINITY
      let maxLuminance = Number.NEGATIVE_INFINITY
      for (let offset = 0; offset < data.length; offset += 4) {
        if (data[offset + 3] === 0) continue
        opaque += 1
        const red = data[offset]
        const green = data[offset + 1]
        const blue = data[offset + 2]
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        sum += luminance
        if (luminance < 100) dark += 1
        if (luminance > 160) light += 1
        if (luminance < minLuminance) minLuminance = luminance
        if (luminance > maxLuminance) maxLuminance = luminance
        if (red === 219 && green === 219 && blue === 219) upCandlePixels += 1
        if (red === 128 && green === 128 && blue === 128) downCandlePixels += 1
      }
      return {
        stats: {
          opaque,
          avg: opaque > 0 ? sum / opaque : 0,
          dark,
          light,
          minLuminance: opaque > 0 ? minLuminance : 0,
          maxLuminance: opaque > 0 ? maxLuminance : 0,
        },
        upCandlePixels,
        downCandlePixels,
      }
    }

    const entries = canvases.map((canvas) => {
      const rect = canvas.getBoundingClientRect()
      return { canvas, rect, ...statsFor(canvas) }
    })
    const axisStats = (predicate: (rect: DOMRect) => boolean) => {
      const candidates = entries
        .filter((entry) => predicate(entry.rect) && entry.stats.opaque > 0)
        .sort((left, right) => right.stats.opaque - left.stats.opaque)
      if (candidates.length === 0) throw new Error('axis canvas not found')
      return candidates[0].stats
    }
    const plot = entries
      .filter((entry) => entry.stats.opaque > 0)
      .sort(
        (left, right) =>
          right.rect.width * right.rect.height - left.rect.width * left.rect.height,
      )[0]
    const plotContext = plot.canvas.getContext('2d')
    if (!plotContext) throw new Error('plot context unavailable')
    const image = plotContext.getImageData(0, 0, plot.canvas.width, plot.canvas.height)
    const offset = (5 * plot.canvas.width + 5) * 4
    const emptyPixel: EmptyPixel = [
      image.data[offset],
      image.data[offset + 1],
      image.data[offset + 2],
      image.data[offset + 3],
    ]

    return {
      containerTag: container.getAttribute('data-e2e-chart-host'),
      canvasTags: canvases.map((canvas) => canvas.getAttribute('data-e2e-chart-canvas')),
      priceAxis: axisStats((rect) => rect.width <= 120 && rect.height >= 100),
      timeAxis: axisStats((rect) => rect.height <= 44 && rect.width >= 100),
      upCandlePixels: plot.upCandlePixels,
      downCandlePixels: plot.downCandlePixels,
      emptyPixel,
      plotOpaque: plot.stats.opaque,
    }
  }, panelIndex)
}

async function bodyColor(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor)
}

/**
 * Captures the viewport through the app's own per-widget capture (written on pointer-up). The
 * synthetic pointer-up only schedules that existing capture; the wait clears its debounce.
 */
async function captureViewport(page: Page): Promise<StoredViewport> {
  await page.locator('[data-testid="btc-perp-chart"]').first().dispatchEvent('pointerup')
  await page.waitForTimeout(400)
  const viewport = await page.evaluate(
    ([viewportKey, panelId, interval]) => {
      const raw = window.localStorage.getItem(viewportKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Record<string, Record<string, StoredViewport>>
      return parsed[panelId]?.[interval] ?? null
    },
    [VIEWPORT_KEY, PANEL_ID, INTERVAL] as const,
  )
  if (!viewport) throw new Error('chart viewport was not captured')
  return viewport
}

function viewportShape(viewport: StoredViewport) {
  return {
    visibleLogicalRange: viewport.visibleLogicalRange,
    visibleTimeRange: viewport.visibleTimeRange,
    autoScale: viewport.autoScale,
    priceRange: viewport.priceRange,
  }
}

async function selectTheme(page: Page, label: 'Cream' | 'Neutral' | 'Black') {
  await page.getByRole('button', { name: 'Tema seç' }).click()
  await page.getByRole('menuitemradio', { name: label }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', label.toLowerCase())
}

test('switching themes repaints the mounted BTC chart canvas and chrome in place', async ({
  page,
}) => {
  test.setTimeout(150_000)
  const klineRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/market/') && url.includes('/klines/')) klineRequests.push(url)
  })

  const containers = await openCharts(page, [PANEL_ID])
  await tagMountedCharts(page)

  const baseline = await readChartStats(page)
  const neutralBody = await bodyColor(page)
  expect(baseline.containerTag).toBe('mounted-0')
  expect(baseline.canvasTags.length).toBeGreaterThan(0)
  expect(baseline.canvasTags.every((tag) => tag !== null)).toBe(true)
  // Neutral is dark: the canvas stays transparent (card shows through), axis text is light.
  expect(baseline.emptyPixel[3]).toBe(0)
  expect(baseline.priceAxis.opaque).toBeGreaterThan(1000)
  expect(baseline.priceAxis.avg).toBeGreaterThan(180)
  expect(baseline.priceAxis.light).toBeGreaterThan(baseline.priceAxis.dark)
  expect(baseline.timeAxis.avg).toBeGreaterThan(200)
  expect(baseline.upCandlePixels).toBeGreaterThan(1000)
  expect(baseline.downCandlePixels).toBeGreaterThan(1000)
  expect(neutralBody).not.toBe(CREAM_PAGE_RGB)

  const baselineViewport = viewportShape(await captureViewport(page))
  await expect(containers).toHaveCount(1)
  const baselineKlineRequests = klineRequests.length

  await selectTheme(page, 'Cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  // The Cream chart background is opaque, so axis canvases now contain a cream field plus dark
  // label pixels. Assert the labels themselves, not the background-dominated average.
  await expect
    .poll(async () => (await readChartStats(page)).priceAxis.dark)
    .toBeGreaterThan(50)
  const cream = await readChartStats(page)
  expect(cream.containerTag).toBe('mounted-0')
  expect(cream.canvasTags).toEqual(baseline.canvasTags)
  // Actual empty plot-canvas pixel: darker cream chart pane, not the page/card colour.
  expect(cream.emptyPixel).toEqual([...CREAM_CHART_PIXEL])
  expect(await bodyColor(page)).toBe(CREAM_PAGE_RGB)
  expect(cream.priceAxis.dark).toBeGreaterThan(50)
  expect(cream.timeAxis.dark).toBeGreaterThan(50)
  expect(cream.priceAxis.minLuminance).toBeLessThan(60)
  expect(cream.timeAxis.minLuminance).toBeLessThan(60)
  // Candle palette pixels and rendered data are identical: no chart rebuild, no candle recolour.
  expect(cream.upCandlePixels).toBe(baseline.upCandlePixels)
  expect(cream.downCandlePixels).toBe(baseline.downCandlePixels)
  expect(viewportShape(await captureViewport(page))).toEqual(baselineViewport)
  expect(klineRequests.length).toBe(baselineKlineRequests)

  // Black restores the previous dark-theme transparent canvas and body colour.
  await selectTheme(page, 'Black')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect.poll(async () => (await readChartStats(page)).priceAxis.avg).toBeGreaterThan(180)
  const black = await readChartStats(page)
  expect(black.emptyPixel[3]).toBe(0)
  expect(await bodyColor(page)).toBe(BLACK_PAGE_RGB)
  expect(black.canvasTags).toEqual(baseline.canvasTags)
  expect(black.upCandlePixels).toBe(baseline.upCandlePixels)
  expect(black.downCandlePixels).toBe(baseline.downCandlePixels)
  expect(viewportShape(await captureViewport(page))).toEqual(baselineViewport)
  expect(klineRequests.length).toBe(baselineKlineRequests)

  await selectTheme(page, 'Neutral')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect.poll(async () => (await readChartStats(page)).priceAxis.avg).toBeGreaterThan(180)
  const restored = await readChartStats(page)
  expect(restored.emptyPixel[3]).toBe(0)
  expect(await bodyColor(page)).toBe(neutralBody)
  expect(restored.containerTag).toBe('mounted-0')
  expect(restored.canvasTags).toEqual(baseline.canvasTags)
  expect(Math.abs(restored.priceAxis.avg - baseline.priceAxis.avg)).toBeLessThanOrEqual(5)
  expect(Math.abs(restored.timeAxis.avg - baseline.timeAxis.avg)).toBeLessThanOrEqual(5)
  expect(restored.upCandlePixels).toBe(baseline.upCandlePixels)
  expect(restored.downCandlePixels).toBe(baseline.downCandlePixels)
  expect(viewportShape(await captureViewport(page))).toEqual(baselineViewport)
  expect(klineRequests.length).toBe(baselineKlineRequests)

  // Cream persists across reload and the rebuilt chart still paints the darker cream pane.
  await selectTheme(page, 'Cream')
  const beforeReload = await readChartStats(page)
  expect(beforeReload.emptyPixel).toEqual([...CREAM_CHART_PIXEL])
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'cream')
  await expect(containers).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await page.waitForTimeout(1_500)
  const reloaded = await readChartStats(page)
  expect(reloaded.emptyPixel).toEqual([...CREAM_CHART_PIXEL])
  expect(await bodyColor(page)).toBe(CREAM_PAGE_RGB)
})

test('Cream chart canvas covers Binance, Hyperliquid and newly added charts', async ({ page }) => {
  test.setTimeout(150_000)
  const containers = await openCharts(page, [PANEL_ID, HYPERLIQUID_PANEL_ID], {
    [HYPERLIQUID_PANEL_ID]: 'hyperliquid',
  })
  await tagMountedCharts(page)
  await selectTheme(page, 'Cream')

  for (const [index, exchange] of ['binance', 'hyperliquid'].entries()) {
    const stats = await readChartStats(page, index)
    expect(stats.containerTag).toBe(`mounted-${index}`)
    expect(stats.emptyPixel, `${exchange} chart background`).toEqual([...CREAM_CHART_PIXEL])
  }
  expect(await bodyColor(page)).toBe(CREAM_PAGE_RGB)

  // A widget added after Cream has been selected reads the same shared token at creation.
  await page.getByRole('button', { name: 'Widget ekle' }).click()
  await page.getByRole('menuitem', { name: 'BTC Perp', exact: true }).click()
  await expect(containers).toHaveCount(3)
  await expect(containers.nth(2)).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await page.waitForTimeout(1_500)
  await tagMountedCharts(page)
  const added = await readChartStats(page, 2)
  expect(added.emptyPixel).toEqual([...CREAM_CHART_PIXEL])

  await selectTheme(page, 'Neutral')
  for (let index = 0; index < 3; index += 1) {
    expect((await readChartStats(page, index)).emptyPixel[3]).toBe(0)
  }
})
