import { expect, test, type Page } from '@playwright/test'

/**
 * Browser regression for in-session theme switching on a mounted BTC Perpetual chart (#248).
 *
 * The chart chrome (axis text, pane separators, crosshair, current-price line) is canvas-rendered
 * by Lightweight Charts and is read from the theme foreground when the chart is created. Without a
 * refresh, switching to the light Cream palette leaves the labels at their dark-theme color on a
 * light surface. This spec proves the mounted chart is restyled in place:
 *
 * - the price/time axis text pixels change from light to dark and back with the theme;
 * - the same canvas elements (and container) survive the switch, i.e. no chart re-creation;
 * - candle palette pixels and persisted viewport are unchanged, and no kline request is repeated;
 * - the previous dark palette restores the original chrome.
 *
 * The backend is stubbed through the existing REST contract (`page.route`) and the WebSocket relay
 * is silenced, matching the other local chart specs. The chart plot is a canvas, so evidence is read
 * from the rendered canvas pixels rather than chart internals. Local-only: like the other specs in
 * this folder it is intentionally not wired into `.github/workflows/pr-checks.yml`.
 */

const WORKSPACE_KEY = '0xdeck-workspace'
const VIEWPORT_KEY = '0xdeck-widget-market-chart-viewports'
const PANEL_ID = 'btc-perpetual-chart-e2e'
const INTERVAL = '1m'
const T0 = 1_700_000_000

type CanvasStats = { opaque: number; avg: number; dark: number; light: number }

type ChartStats = {
  containerTag: string | null
  canvasTags: (string | null)[]
  priceAxis: CanvasStats
  timeAxis: CanvasStats
  upCandlePixels: number
  downCandlePixels: number
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

async function openBtcPerpChart(page: Page) {
  await page.addInitScript(
    ([workspaceKey, panelId]) => {
      window.localStorage.setItem(
        workspaceKey,
        JSON.stringify({ activePanels: [panelId], layout: [], gridVersion: 3 }),
      )
    },
    [WORKSPACE_KEY, PANEL_ID] as const,
  )
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
  // Set OXDECK_E2E_URL to a path-prefixed absolute URL (e.g. the isolated preview) so this
  // committed spec can also verify the built artifact instead of only the dev server.
  await page.goto(process.env.OXDECK_E2E_URL ?? '/')
  const container = page.locator('[data-testid="btc-perp-chart"]')
  await expect(container).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await expect(container.locator('canvas').first()).toBeVisible()
  await page.waitForTimeout(1_500)
  return container
}

/**
 * Tags the chart host and every canvas once. A chart re-creation (remove + createChart) replaces
 * the canvases, so a surviving tag proves the theme refresh reused the mounted chart.
 */
async function tagMountedChart(page: Page) {
  await page.evaluate(() => {
    const container = document.querySelector('[data-testid="btc-perp-chart"]')
    if (!container) throw new Error('chart container missing')
    container.setAttribute('data-e2e-chart-host', 'mounted')
    container.querySelectorAll('canvas').forEach((canvas, index) => {
      canvas.setAttribute('data-e2e-chart-canvas', `canvas-${index}`)
    })
  })
}

/**
 * Reads the rendered chrome pixels. Axis labels are painted on their own canvases with a
 * transparent background, so the average luminance of their opaque pixels is the axis text color.
 * Candle palette pixels are counted exactly to prove the candle colors/data are untouched.
 */
async function readChartStats(page: Page): Promise<ChartStats> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid="btc-perp-chart"]')
    if (!container) throw new Error('chart container missing')
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
      for (let index = 0; index < data.length; index += 4) {
        if (data[index + 3] === 0) continue
        opaque += 1
        const red = data[index]
        const green = data[index + 1]
        const blue = data[index + 2]
        const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue
        sum += luminance
        if (luminance < 100) dark += 1
        if (luminance > 160) light += 1
        if (red === 219 && green === 219 && blue === 219) upCandlePixels += 1
        if (red === 128 && green === 128 && blue === 128) downCandlePixels += 1
      }
      return {
        stats: { opaque, avg: opaque > 0 ? sum / opaque : 0, dark, light },
        upCandlePixels,
        downCandlePixels,
      }
    }

    const entries = canvases.map((canvas) => {
      const rect = canvas.getBoundingClientRect()
      return {
        canvas,
        rect,
        ...statsFor(canvas),
      }
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

    return {
      containerTag: container.getAttribute('data-e2e-chart-host'),
      canvasTags: canvases.map((canvas) => canvas.getAttribute('data-e2e-chart-canvas')),
      priceAxis: axisStats((rect) => rect.width <= 120 && rect.height >= 100),
      timeAxis: axisStats((rect) => rect.height <= 44 && rect.width >= 100),
      upCandlePixels: plot.upCandlePixels,
      downCandlePixels: plot.downCandlePixels,
    }
  })
}

/**
 * Captures the viewport through the app's own per-widget capture (written on pointer-up). The
 * synthetic pointer-up only schedules that existing capture; the wait clears its debounce.
 */
async function captureViewport(page: Page): Promise<StoredViewport> {
  await page.locator('[data-testid="btc-perp-chart"]').dispatchEvent('pointerup')
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

async function selectTheme(page: Page, label: 'Cream' | 'Neutral') {
  await page.getByRole('button', { name: 'Tema seç' }).click()
  await page.getByRole('menuitemradio', { name: label }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', label.toLowerCase())
}

test('switching themes restyles the mounted BTC chart in place', async ({ page }) => {
  test.setTimeout(120_000)
  const klineRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/api/market/') && url.includes('/klines/')) klineRequests.push(url)
  })

  const container = await openBtcPerpChart(page)
  await tagMountedChart(page)

  const baseline = await readChartStats(page)
  expect(baseline.containerTag).toBe('mounted')
  expect(baseline.canvasTags.length).toBeGreaterThan(0)
  expect(baseline.canvasTags.every((tag) => tag !== null)).toBe(true)
  // Neutral is dark: light axis labels, no candle palette change.
  expect(baseline.priceAxis.opaque).toBeGreaterThan(1000)
  expect(baseline.priceAxis.avg).toBeGreaterThan(180)
  expect(baseline.priceAxis.light).toBeGreaterThan(baseline.priceAxis.dark)
  expect(baseline.timeAxis.avg).toBeGreaterThan(200)
  expect(baseline.upCandlePixels).toBeGreaterThan(1000)
  expect(baseline.downCandlePixels).toBeGreaterThan(1000)

  const baselineViewport = viewportShape(await captureViewport(page))
  await expect(container).toHaveAttribute('aria-hidden', 'false')
  const baselineKlineRequests = klineRequests.length

  await selectTheme(page, 'Cream')
  await expect(page.locator('html')).not.toHaveClass(/\bdark\b/)
  // The mounted chart repaints its chrome from the Cream foreground (dark text).
  await expect.poll(async () => (await readChartStats(page)).priceAxis.avg).toBeLessThan(100)
  const cream = await readChartStats(page)
  expect(cream.containerTag).toBe('mounted')
  expect(cream.canvasTags).toEqual(baseline.canvasTags)
  expect(cream.priceAxis.dark).toBeGreaterThan(cream.priceAxis.light)
  expect(cream.timeAxis.dark).toBeGreaterThan(cream.timeAxis.light)
  expect(cream.timeAxis.avg).toBeLessThan(100)
  // Candle palette pixels and the rendered data are identical: the chart was not rebuilt.
  expect(cream.upCandlePixels).toBe(baseline.upCandlePixels)
  expect(cream.downCandlePixels).toBe(baseline.downCandlePixels)
  // Same viewport and no extra kline reads: no history refetch, range reset or drawing loss.
  expect(viewportShape(await captureViewport(page))).toEqual(baselineViewport)
  expect(klineRequests.length).toBe(baselineKlineRequests)

  await selectTheme(page, 'Neutral')
  await expect(page.locator('html')).toHaveClass(/\bdark\b/)
  await expect.poll(async () => (await readChartStats(page)).priceAxis.avg).toBeGreaterThan(180)
  const restored = await readChartStats(page)
  expect(restored.containerTag).toBe('mounted')
  expect(restored.canvasTags).toEqual(baseline.canvasTags)
  expect(Math.abs(restored.priceAxis.avg - baseline.priceAxis.avg)).toBeLessThanOrEqual(5)
  expect(Math.abs(restored.timeAxis.avg - baseline.timeAxis.avg)).toBeLessThanOrEqual(5)
  expect(restored.upCandlePixels).toBe(baseline.upCandlePixels)
  expect(restored.downCandlePixels).toBe(baseline.downCandlePixels)
  expect(viewportShape(await captureViewport(page))).toEqual(baselineViewport)
  expect(klineRequests.length).toBe(baselineKlineRequests)
})
