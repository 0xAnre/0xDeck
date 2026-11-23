import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * Box/rectangle visible part when its start predates the loaded history
 * (Issue #265).
 *
 * The chart is canvas-only, so the assertions read the exact bitmap
 * `fillRect`/`arc` calls the rectangle series primitive makes. The backend is
 * mocked with a fixed 15-minute fixture: the initial candle window (the
 * context endpoint the panel loads first) has 750 bars while the default
 * viewport shows the last 500, so the first loaded bar is always off the left
 * edge of the pane and no older-history page is requested on mount.
 *
 * The honest projection this spec pins: a stored start before the loaded
 * history is clipped to the earliest loaded bar's own coordinate (never a
 * fabricated historical index), the visible part is painted, a clipped edge
 * has no resize handle, and the stored bounds are never rewritten. The
 * "anchored" control seeds the same box with `fromTime` exactly on the first
 * loaded bar: it must paint identical pixels and keep its eight handles.
 */

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
/** Fixed, bar-aligned "now"; the fixture never depends on the wall clock. */
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const INITIAL_BARS = 750
const FIRST_LOADED_SECONDS = NOW_SECONDS - (INITIAL_BARS - 1) * BAR_SECONDS
const PANEL_ID = 'btc-perpetual-chart-box265'
const RECTANGLE_STORAGE_KEY = '0xdeck-widget-rectangle-instances'

/** Stored box: starts 400 bars before the loaded history, ends inside the pane. */
const UNLOADED_FROM = FIRST_LOADED_SECONDS - 400 * BAR_SECONDS
const TO_SECONDS = NOW_SECONDS - 120 * BAR_SECONDS
const LOW_PRICE = 80_005
const HIGH_PRICE = 80_045
const DURATION_SECONDS = TO_SECONDS - UNLOADED_FROM

type BoxKind = 'unloaded' | 'anchored' | 'outside'

function candles(count: number, beforeSeconds?: number) {
  const lastOpen = beforeSeconds === undefined ? NOW_SECONDS : beforeSeconds - BAR_SECONDS
  return Array.from({ length: count }, (_, index) => {
    const time = lastOpen - (count - 1 - index) * BAR_SECONDS
    const close = 80_000 + (index % 50)
    return {
      symbol: 'BTCUSDT',
      interval: INTERVAL,
      time,
      open: close - 10,
      high: close + 20,
      low: close - 30,
      close,
      volume: 12.5,
      closed: true,
    }
  })
}

function boxFromTime(kind: BoxKind): number {
  if (kind === 'unloaded') return UNLOADED_FROM
  if (kind === 'anchored') return FIRST_LOADED_SECONDS
  return FIRST_LOADED_SECONDS - 300 * BAR_SECONDS
}

function boxToTime(kind: BoxKind): number {
  if (kind === 'outside') return FIRST_LOADED_SECONDS - 200 * BAR_SECONDS
  return TO_SECONDS
}

function seedPayload(kind: BoxKind) {
  const instance = {
    id: `rect-${kind}`,
    fromTime: boxFromTime(kind),
    toTime: boxToTime(kind),
    lowPrice: LOW_PRICE,
    highPrice: HIGH_PRICE,
    displaySequence: 1,
    fillColor: '#ff0000',
    fillOpacity: 100,
  }
  return {
    workspace: {
      version: 2,
      activeWorkspaceId: 'ws-box265',
      workspaces: [
        {
          id: 'ws-box265',
          activePanels: [PANEL_ID],
          layout: [
            { i: PANEL_ID, x: 0, y: 0, w: 36, h: 40, minW: 9, minH: 10 },
          ],
          gridVersion: 3,
        },
      ],
    },
    intervals: { [PANEL_ID]: INTERVAL },
    exchanges: { [PANEL_ID]: 'binance' },
    rectangles: { [PANEL_ID]: [instance] },
  }
}

const seedScript = ({ seed }: { seed: ReturnType<typeof seedPayload> }) => {
  localStorage.setItem('0xdeck-workspace', JSON.stringify(seed.workspace))
  localStorage.setItem('0xdeck-widget-market-intervals', JSON.stringify(seed.intervals))
  localStorage.setItem('0xdeck-widget-market-exchanges', JSON.stringify(seed.exchanges))
  localStorage.setItem('0xdeck-widget-rectangle-instances', JSON.stringify(seed.rectangles))
}

/**
 * Records the exact bitmap paint calls the rectangle primitive makes. The
 * seeded fill is opaque `#ff0000`, so the record is unambiguous; handles are
 * circles of exactly 4 CSS px radius.
 */
const paintRecorderScript = () => {
  const state = {
    fills: [] as Array<{
      left: number
      top: number
      width: number
      height: number
      fillStyle: string
      canvas: { left: number; top: number; width: number; height: number }
    }>,
    arcs: [] as Array<{ x: number; y: number; radius: number }>,
    reset() {
      state.fills.length = 0
      state.arcs.length = 0
    },
  }
  ;(window as unknown as { __boxPaint: typeof state }).__boxPaint = state
  const prototype = CanvasRenderingContext2D.prototype
  const originalFillRect = prototype.fillRect
  prototype.fillRect = function (left, top, width, height) {
    if (window.__boxPaint) {
      const fillStyle = String(this.fillStyle)
      if (fillStyle === '#ff0000' || fillStyle.startsWith('rgba(255, 0, 0')) {
        const rect = this.canvas.getBoundingClientRect()
        window.__boxPaint.fills.push({
          left,
          top,
          width,
          height,
          fillStyle,
          canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
        })
      }
    }
    return originalFillRect.call(this, left, top, width, height)
  }
  const originalArc = prototype.arc
  prototype.arc = function (x, y, radius) {
    if (window.__boxPaint && Math.abs(radius - 4 * window.devicePixelRatio) < 0.001) {
      window.__boxPaint.arcs.push({ x, y, radius })
    }
    return originalArc.call(this, x, y, radius)
  }
}

declare global {
  interface Window {
    /** Test-only paint recorder; never present in application code. */
    __boxPaint?: BoxPaint
  }
}

type BoxPaint = {
  fills: Array<{
    left: number
    top: number
    width: number
    height: number
    fillStyle: string
    canvas: { left: number; top: number; width: number; height: number }
  }>
  arcs: Array<{ x: number; y: number; radius: number }>
  reset: () => void
}

type ChartRun = {
  context: BrowserContext
  page: Page
  historyRequests: string[]
}

async function openChart(
  browser: Browser,
  deviceScaleFactor: number,
  kind: BoxKind,
): Promise<ChartRun> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor,
  })
  const page = await context.newPage()
  const historyRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/klines/history')) {
      historyRequests.push(url.replace(/^https?:\/\/[^/]+/, ''))
    }
  })

  await page.addInitScript(paintRecorderScript)
  await page.addInitScript(seedScript, { seed: seedPayload(kind) })
  await page.routeWebSocket(/\/api\/ws\//, () => {})

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      const klines = (bars: ReturnType<typeof candles>) =>
        json({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          interval: INTERVAL,
          candles: bars,
          available_from: null,
        })

      if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
      // The panel loads its first candle window from the context endpoint.
      if (path.endsWith('/klines/daily-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/weekly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/monthly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/quarterly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/yearly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/history')) {
        const before = Number(url.searchParams.get('before') ?? FIRST_LOADED_SECONDS)
        return klines(candles(500, before))
      }
      if (path.endsWith('/klines')) return klines(candles(INITIAL_BARS))
      return route.fulfill({ status: 503, body: 'not mocked' })
    },
  )

  await page.goto('/')
  const chart = page.getByTestId('btc-perp-chart').first()
  await expect(chart).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await expect(chart.locator('canvas').first()).toBeVisible()
  return { context, page, historyRequests }
}

function paint(page: Page) {
  return page.evaluate(() => {
    const state = (window as unknown as { __boxPaint?: BoxPaint }).__boxPaint
    if (!state) throw new Error('paint recorder missing')
    return { fills: state.fills.slice(), arcs: state.arcs.slice() }
  })
}

async function resetPaint(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __boxPaint: BoxPaint }).__boxPaint.reset()
  })
}

/** Waits for the next red fill and returns it; the recorder must be reset first. */
async function waitForRedFill(page: Page) {
  await expect
    .poll(async () => (await paint(page)).fills.length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  const recorded = await paint(page)
  return recorded.fills[recorded.fills.length - 1]
}

async function waitForHandles(page: Page) {
  await expect
    .poll(async () => (await paint(page)).arcs.length, { timeout: 20_000 })
    .toBeGreaterThan(0)
  return (await paint(page)).arcs
}

/** Page (CSS px) centre of the painted box, from its bitmap record. */
function pageCentreOfFill(
  fill: Awaited<ReturnType<typeof waitForRedFill>>,
  deviceScaleFactor: number,
) {
  return {
    x: fill.canvas.left + (fill.left + fill.width / 2) / deviceScaleFactor,
    y: fill.canvas.top + (fill.top + fill.height / 2) / deviceScaleFactor,
  }
}

function pageEastEdgeOfFill(
  fill: Awaited<ReturnType<typeof waitForRedFill>>,
  deviceScaleFactor: number,
) {
  return {
    x: fill.canvas.left + (fill.left + fill.width) / deviceScaleFactor,
    y: fill.canvas.top + (fill.top + fill.height / 2) / deviceScaleFactor,
  }
}

type StoredRectangle = {
  id: string
  fromTime: number
  toTime: number
  lowPrice: number
  highPrice: number
}

async function storedRectangle(page: Page): Promise<StoredRectangle | null> {
  return page.evaluate(
    ({ key, panelId }) => {
      const raw = localStorage.getItem(key)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Record<string, StoredRectangle[]>
      const list = parsed[panelId]
      return list && list.length > 0 ? list[0] : null
    },
    { key: RECTANGLE_STORAGE_KEY, panelId: PANEL_ID },
  )
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

for (const deviceScaleFactor of [1, 2]) {
  test(`box visible part before the loaded history (DPR ${deviceScaleFactor})`, async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const runs: ChartRun[] = []
    try {
      // --- unloaded start: painted, no $fetch, no fake handle ---------------
      const unloaded = await openChart(browser, deviceScaleFactor, 'unloaded')
      runs.push(unloaded)
      const fill = await waitForRedFill(unloaded.page)
      expect(fill.fillStyle).toBe('#ff0000')
      expect(fill.width).toBeGreaterThan(100 * deviceScaleFactor)
      expect(fill.height).toBeGreaterThan(0)
      expect(fill.top).toBeGreaterThanOrEqual(0)
      // The clipped edge is the earliest loaded bar, which is off the left edge
      // of the loaded pane: the visible part therefore reaches the pane's left.
      expect(fill.left).toBeLessThanOrEqual(deviceScaleFactor)
      expect(fill.left + fill.width).toBeGreaterThan(fill.canvas.width * deviceScaleFactor * 0.25)

      await unloaded.page.waitForTimeout(1_200)
      const historyAfterSettle = unloaded.historyRequests.length
      await resetPaint(unloaded.page)
      await unloaded.page.waitForTimeout(1_200)
      const idle = await paint(unloaded.page)
      // Rendering the clipped box must not schedule idle repaints or fetches.
      expect(idle.fills.length).toBe(0)
      expect(idle.arcs.length).toBe(0)
      expect(unloaded.historyRequests.length).toBe(historyAfterSettle)

      // --- anchored control: same pixels, eight handles ---------------------
      const anchored = await openChart(browser, deviceScaleFactor, 'anchored')
      runs.push(anchored)
      const anchoredFill = await waitForRedFill(anchored.page)
      expect({
        left: anchoredFill.left,
        top: anchoredFill.top,
        width: anchoredFill.width,
        height: anchoredFill.height,
        fillStyle: anchoredFill.fillStyle,
      }).toEqual({
        left: fill.left,
        top: fill.top,
        width: fill.width,
        height: fill.height,
        fillStyle: fill.fillStyle,
      })
      await anchored.page.waitForTimeout(1_200)
      expect(anchored.historyRequests.length).toBe(historyAfterSettle)

      // --- a box entirely before the loaded history paints nothing ----------
      const outside = await openChart(browser, deviceScaleFactor, 'outside')
      runs.push(outside)
      await outside.page.waitForTimeout(2_000)
      expect((await paint(outside.page)).fills.length).toBe(0)
      expect(outside.historyRequests.length).toBe(historyAfterSettle)
      const chartBox = await outside.page.getByTestId('btc-perp-chart').first().boundingBox()
      expect(chartBox).not.toBeNull()
      if (chartBox) {
        await outside.page.mouse.click(chartBox.x + chartBox.width / 2, chartBox.y + chartBox.height / 2)
        await outside.page.waitForTimeout(500)
      }
      expect((await paint(outside.page)).arcs.length).toBe(0)

      // --- selection: no handle on the clipped start -----------------------
      const centre = pageCentreOfFill(fill, deviceScaleFactor)
      await resetPaint(unloaded.page)
      await unloaded.page.mouse.click(centre.x, centre.y)
      const clippedHandles = await waitForHandles(unloaded.page)
      expect(clippedHandles.length).toBe(5)
      expect(clippedHandles.some((arc) => Math.abs(arc.x - fill.left) < 1)).toBe(false)

      await resetPaint(anchored.page)
      const anchoredCentre = pageCentreOfFill(anchoredFill, deviceScaleFactor)
      await anchored.page.mouse.click(anchoredCentre.x, anchoredCentre.y)
      const anchoredHandles = await waitForHandles(anchored.page)
      expect(anchoredHandles.length).toBe(8)
      expect(anchoredHandles.some((arc) => Math.abs(arc.x - anchoredFill.left) < 1)).toBe(true)

      // --- move: stored duration and unloaded start survive the drag --------
      const beforeMove = await storedRectangle(unloaded.page)
      expect(beforeMove).not.toBeNull()
      if (!beforeMove) return
      expect(beforeMove.fromTime).toBe(UNLOADED_FROM)
      expect(beforeMove.toTime).toBe(TO_SECONDS)

      await resetPaint(unloaded.page)
      await drag(unloaded.page, centre, {
        x: centre.x + 60 * deviceScaleFactor,
        y: centre.y,
      })
      const afterMove = await storedRectangle(unloaded.page)
      expect(afterMove).not.toBeNull()
      if (!afterMove) return
      expect(afterMove.toTime - afterMove.fromTime).toBe(DURATION_SECONDS)
      expect(afterMove.fromTime).not.toBe(beforeMove.fromTime)
      expect(afterMove.fromTime).toBeLessThan(FIRST_LOADED_SECONDS)
      await waitForRedFill(unloaded.page)
      await unloaded.page.waitForTimeout(250)
      const movedFills = (await paint(unloaded.page)).fills
      const movedFill = movedFills[movedFills.length - 1]

      // --- resize the east edge: the stored start is never rewritten --------
      const eastEdge = pageEastEdgeOfFill(movedFill, deviceScaleFactor)
      await resetPaint(unloaded.page)
      await drag(unloaded.page, eastEdge, {
        x: eastEdge.x + 40 * deviceScaleFactor,
        y: eastEdge.y,
      })
      const afterResize = await storedRectangle(unloaded.page)
      expect(afterResize).not.toBeNull()
      if (!afterResize) return
      expect(afterResize.fromTime).toBe(afterMove.fromTime)
      expect(afterResize.toTime).not.toBe(afterMove.toTime)
      expect(afterResize.fromTime).toBeLessThan(FIRST_LOADED_SECONDS)

      // --- panel resize, zoom and pan keep the visible part painted ---------
      const boundsBeforeChrome = await storedRectangle(unloaded.page)
      await resetPaint(unloaded.page)
      await unloaded.page.setViewportSize({ width: 1_200, height: 820 })
      const resizedFill = await waitForRedFill(unloaded.page)
      expect(resizedFill.left).toBeLessThanOrEqual(deviceScaleFactor)

      await resetPaint(unloaded.page)
      await unloaded.page.mouse.move(
        resizedFill.canvas.left + resizedFill.canvas.width / 2,
        resizedFill.canvas.top + resizedFill.canvas.height / 2,
      )
      await unloaded.page.mouse.wheel(0, 400)
      const zoomedFill = await waitForRedFill(unloaded.page)
      expect(zoomedFill.left).toBeLessThanOrEqual(deviceScaleFactor)

      await resetPaint(unloaded.page)
      const paneTop = resizedFill.canvas.top + 24
      const panFrom = { x: resizedFill.canvas.left + resizedFill.canvas.width / 2, y: paneTop }
      await drag(unloaded.page, panFrom, { x: panFrom.x + 120, y: paneTop })
      const pannedFill = await waitForRedFill(unloaded.page)
      expect(pannedFill.left).toBeLessThanOrEqual(deviceScaleFactor)
      expect(await storedRectangle(unloaded.page)).toEqual(boundsBeforeChrome)
    } finally {
      for (const run of runs) await run.context.close()
    }
  })
}
