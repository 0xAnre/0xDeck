import { createHash } from 'node:crypto'
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * Box/rectangle visible part when its start predates the loaded history
 * (Issue #265).
 *
 * Gates in this file:
 * 1. **Paint-call gate** (not a framebuffer diff): the exact bitmap
 *    `fillRect`/`arc` calls the rectangle series primitive makes, with the
 *    clipped box's call arguments compared against the same box anchored
 *    exactly on the loaded edge.
 * 2. **Bitmap gate**: SHA-256 of the pane canvas PNG for the same fixture
 *    (same DPR). Clipped vs anchored must be pixel-identical (the anchored
 *    box's west handles are off-bitmap), and the no-op fixtures (fully
 *    outside, end-before-pane, hidden, opacity 0) must equal a no-box control
 *    pixel for pixel. Cross-DPR the CSS-space geometry must scale by exactly
 *    the DPR.
 * 3. **Interaction gate**: a real time-scale drag (pane-drag fallback only if
 *    the axis drag does not move the view) must change the visible mapping
 *    while bar spacing stays constant; wheel zoom must change bar spacing;
 *    panel resize must change the panel and pane dimensions and bar spacing.
 *    Every step asserts the box is still painted, and the stored bounds,
 *    duration and drag anchor are never rewritten.
 *
 * The chart is canvas-only and the backend is mocked with a fixed 15-minute
 * fixture: the initial candle window (the context endpoint the panel loads
 * first) has 750 bars while the default viewport shows the last 500, so the
 * first loaded bar is off the left edge and no older-history page is
 * requested on mount. Bar spacing is derived from the painted box itself
 * (`width / 629` bar intervals), so it is measured, never assumed.
 *
 * Set `OXDECK_E2E_BASE_URL` / `OXDECK_E2E_STORAGE_STATE` to run this same
 * acceptance against the protected preview prefix with a legitimate saved
 * login session (see /tmp/box265 preview driver).
 */

const APP_URL = process.env.OXDECK_E2E_BASE_URL ?? '/'
const STORAGE_STATE = process.env.OXDECK_E2E_STORAGE_STATE

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
/** Fixed, bar-aligned "now"; the fixture never depends on the wall clock. */
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const INITIAL_BARS = 750
const FIRST_LOADED_SECONDS = NOW_SECONDS - (INITIAL_BARS - 1) * BAR_SECONDS
const PANEL_ID = 'btc-perpetual-chart-box265'
const RECTANGLE_STORAGE_KEY = '0xdeck-widget-rectangle-instances'
const SEED_MARKER = '0xdeck-e2e-box265-seeded'

/** Stored box: starts 400 bars before the loaded history, ends inside the pane. */
const UNLOADED_FROM = FIRST_LOADED_SECONDS - 400 * BAR_SECONDS
const TO_SECONDS = NOW_SECONDS - 120 * BAR_SECONDS
const LOW_PRICE = 80_005
const HIGH_PRICE = 80_045
const DURATION_SECONDS = TO_SECONDS - UNLOADED_FROM
/** Bar intervals between the first loaded candle and the seeded box end. */
const BARS_TO_BOX_END = (TO_SECONDS - FIRST_LOADED_SECONDS) / BAR_SECONDS
const HANDLE_RADIUS_CSS_PX = 4

type BoxKind = 'unloaded' | 'anchored' | 'outside' | 'offscreen' | 'hidden' | 'opacity0' | 'none'

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

function boxTimes(kind: BoxKind): { fromTime: number; toTime: number } {
  switch (kind) {
    case 'unloaded':
    case 'hidden':
    case 'opacity0':
      return { fromTime: UNLOADED_FROM, toTime: TO_SECONDS }
    case 'anchored':
      return { fromTime: FIRST_LOADED_SECONDS, toTime: TO_SECONDS }
    case 'outside':
      return {
        fromTime: FIRST_LOADED_SECONDS - 300 * BAR_SECONDS,
        toTime: FIRST_LOADED_SECONDS - 200 * BAR_SECONDS,
      }
    case 'offscreen':
      // Both endpoints resolve inside the loaded history, but the whole box
      // stays left of the visible pane: it must not change a single pixel.
      return {
        fromTime: FIRST_LOADED_SECONDS + 5 * BAR_SECONDS,
        toTime: FIRST_LOADED_SECONDS + 25 * BAR_SECONDS,
      }
    case 'none':
      return { fromTime: UNLOADED_FROM, toTime: TO_SECONDS }
    default: {
      const unreachable: never = kind
      return unreachable
    }
  }
}

function seedPayload(kind: BoxKind) {
  const times = boxTimes(kind)
  const instance =
    kind === 'none'
      ? null
      : {
          id: `rect-${kind}`,
          fromTime: times.fromTime,
          toTime: times.toTime,
          lowPrice: LOW_PRICE,
          highPrice: HIGH_PRICE,
          displaySequence: 1,
          fillColor: '#ff0000',
          fillOpacity: kind === 'opacity0' ? 0 : 100,
          ...(kind === 'hidden' ? { hidden: true } : {}),
        }
  return {
    workspace: {
      version: 2,
      activeWorkspaceId: 'ws-box265',
      workspaces: [
        {
          id: 'ws-box265',
          activePanels: [PANEL_ID],
          layout: [{ i: PANEL_ID, x: 0, y: 0, w: 36, h: 40, minW: 9, minH: 10 }],
          gridVersion: 3,
        },
      ],
    },
    intervals: { [PANEL_ID]: INTERVAL },
    exchanges: { [PANEL_ID]: 'binance' },
    rectangles: { [PANEL_ID]: instance ? [instance] : [] },
  }
}

/**
 * Seeds once per context. A reload must keep the app's own persisted state
 * (bounds, viewport) instead of re-seeding the fixture over it.
 */
const seedScript = ({ seed, marker }: { seed: ReturnType<typeof seedPayload>; marker: string }) => {
  if (localStorage.getItem(marker)) return
  localStorage.setItem('0xdeck-workspace', JSON.stringify(seed.workspace))
  localStorage.setItem('0xdeck-widget-market-intervals', JSON.stringify(seed.intervals))
  localStorage.setItem('0xdeck-widget-market-exchanges', JSON.stringify(seed.exchanges))
  localStorage.setItem('0xdeck-widget-rectangle-instances', JSON.stringify(seed.rectangles))
  localStorage.setItem(marker, '1')
}

/** Records the primitive's bitmap paint calls (red box fill and handle arcs). */
const paintRecorderScript = ({ deviceScaleFactor }: { deviceScaleFactor: number }) => {
  const handleRadius = 4 * deviceScaleFactor
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
  window.__boxPaint = state
  const prototype = CanvasRenderingContext2D.prototype
  const originalFillRect = prototype.fillRect
  prototype.fillRect = function (left, top, width, height) {
    const fillStyle = String(this.fillStyle)
    if (fillStyle === '#ff0000' || fillStyle.startsWith('rgba(255, 0, 0')) {
      const rect = this.canvas.getBoundingClientRect()
      state.fills.push({
        left,
        top,
        width,
        height,
        fillStyle,
        canvas: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      })
    }
    return originalFillRect.call(this, left, top, width, height)
  }
  const originalArc = prototype.arc
  prototype.arc = function (x, y, radius) {
    if (Math.abs(radius - handleRadius) < 0.001) {
      state.arcs.push({ x, y, radius })
    }
    return originalArc.call(this, x, y, radius)
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

declare global {
  interface Window {
    /** Test-only paint recorder; never present in application code. */
    __boxPaint?: BoxPaint
  }
}

type StoredRectangle = {
  id: string
  fromTime: number
  toTime: number
  lowPrice: number
  highPrice: number
}

type ChartRun = {
  context: BrowserContext
  page: Page
  historyRequests: string[]
  mountFill: Awaited<ReturnType<typeof waitForRedFill>> | null
  mountHash: string
}

async function openChart(
  browser: Browser,
  deviceScaleFactor: number,
  kind: BoxKind,
): Promise<ChartRun> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor,
    ...(STORAGE_STATE ? { storageState: STORAGE_STATE } : {}),
  })
  const page = await context.newPage()
  const historyRequests: string[] = []
  page.on('request', (request) => {
    const url = request.url()
    if (url.includes('/klines/history')) {
      historyRequests.push(url.replace(/^https?:\/\/[^/]+/, ''))
    }
  })

  await page.addInitScript(paintRecorderScript, { deviceScaleFactor })
  await page.addInitScript(seedScript, { seed: seedPayload(kind), marker: SEED_MARKER })
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

  await page.goto(APP_URL)
  const chart = page.getByTestId('btc-perp-chart').first()
  await expect(chart).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await expect(chart.locator('canvas').first()).toBeVisible()

  const run: ChartRun = {
    context,
    page,
    historyRequests,
    mountFill: null,
    mountHash: '',
  }
  const hasBox = kind !== 'none' && kind !== 'outside' && kind !== 'hidden'
  if (hasBox) {
    run.mountFill = await waitForRedFill(page)
  }
  run.mountHash = await stablePaneCanvasBitmap(page)
  return run
}

function paint(page: Page) {
  return page.evaluate(() => {
    const state = window.__boxPaint
    if (!state) throw new Error('paint recorder missing')
    return { fills: state.fills.slice(), arcs: state.arcs.slice() }
  })
}

async function resetPaint(page: Page) {
  await page.evaluate(() => {
    window.__boxPaint?.reset()
  })
}

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

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')

type PaneCanvas = { left: number; top: number; width: number; height: number }

/** The pane canvas is the largest canvas of the chart (axes are narrow/short). */
async function paneCanvasRect(page: Page): Promise<PaneCanvas> {
  const rect = await page.evaluate(() => {
    const container = document.querySelector('[data-testid="btc-perp-chart"]')
    if (!container) return null
    const candidates = Array.from(container.querySelectorAll('canvas'))
      .map((canvas) => {
        const box = canvas.getBoundingClientRect()
        return { left: box.left, top: box.top, width: box.width, height: box.height }
      })
      .filter((box) => box.width > 200 && box.height > 100)
      .sort((a, b) => b.width * b.height - a.width * a.height)
    return candidates[0] ?? null
  })
  if (!rect) throw new Error('pane canvas not found')
  return rect
}

/** Time-axis canvas: full-width and short (used for the official axis drag). */
async function timeAxisRect(page: Page): Promise<PaneCanvas | null> {
  return page.evaluate(() => {
    const container = document.querySelector('[data-testid="btc-perp-chart"]')
    if (!container) return null
    const candidates = Array.from(container.querySelectorAll('canvas'))
      .map((canvas) => {
        const box = canvas.getBoundingClientRect()
        return { left: box.left, top: box.top, width: box.width, height: box.height }
      })
      .filter((box) => box.width > 200 && box.height > 0 && box.height < 40)
    return candidates[0] ?? null
  })
}

/**
 * SHA-256 of the pane canvas PNG. The pointer is parked outside the chart and
 * the bitmap must be stable for two consecutive reads before it is returned,
 * so a mid-paint or crosshair frame is never hashed.
 */
async function stablePaneCanvasBitmap(page: Page): Promise<string> {
  const read = () =>
    page
      .evaluate(() => {
        const container = document.querySelector('[data-testid="btc-perp-chart"]')
        if (!container) return null
        const pane = Array.from(container.querySelectorAll('canvas'))
          .map((canvas) => ({ canvas, box: canvas.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 200 && box.height > 100)
          .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0]
        return pane ? pane.canvas.toDataURL('image/png') : null
      })
      .then((dataUrl) => (dataUrl ? sha256(dataUrl) : ''))

  let previous = ''
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const next = await read()
    if (next.length > 0 && next === previous) return next
    previous = next
    await page.waitForTimeout(120)
  }
  throw new Error('pane canvas bitmap did not settle')
}

/** CSS px per bar, derived from the painted box (first loaded bar -> box end). */
function barSpacingCssPx(fill: { left: number; width: number }, deviceScaleFactor: number) {
  return fill.width / deviceScaleFactor / BARS_TO_BOX_END
}

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

async function clickFillCentre(
  page: Page,
  fill: Awaited<ReturnType<typeof waitForRedFill>>,
  deviceScaleFactor: number,
) {
  const centre = pageCentreOfFill(fill, deviceScaleFactor)
  await page.mouse.click(centre.x, centre.y)
}

/**
 * Official pan: drag the time axis. If the library does not move the view from
 * an axis drag, fall back to a pane drag above the box's price band; either
 * way the caller's mapping assertions are what prove a real pan happened.
 */
async function panViewBy(
  page: Page,
  deviceScaleFactor: number,
  dragBitmapPx: number,
): Promise<'time-axis' | 'pane'> {
  const before = (await paint(page)).fills.at(-1)
  if (!before) throw new Error('pan started with no painted box')
  const axis = await timeAxisRect(page)
  if (axis) {
    const from = { x: axis.left + axis.width / 2, y: axis.top + axis.height / 2 }
    await drag(page, from, { x: from.x + dragBitmapPx / deviceScaleFactor, y: from.y })
    await waitForRedFill(page)
    const after = (await paint(page)).fills.at(-1)
    if (after && Math.abs(after.left - before.left) > 20) return 'time-axis'
  }
  const pane = await paneCanvasRect(page)
  const beforePane = (await paint(page)).fills.at(-1) ?? before
  const panY = Math.max(pane.top + 16, beforePane.canvas.top + beforePane.top / deviceScaleFactor - 24)
  const from = { x: pane.left + pane.width / 2, y: panY }
  await drag(page, from, { x: from.x + dragBitmapPx / deviceScaleFactor, y: from.y })
  await waitForRedFill(page)
  return 'pane'
}

test('box visible part before the loaded history: paint, pixels, interaction', async ({
  browser,
}) => {
  test.setTimeout(600_000)
  const runs: ChartRun[] = []
  const closeAll = async () => {
    for (const run of runs) await run.context.close()
  }

  try {
    // ---------------- DPR 1: full interaction gate --------------------------
    const unloaded = await openChart(browser, 1, 'unloaded')
    runs.push(unloaded)
    const page = unloaded.page
    const mountFill = unloaded.mountFill
    expect(mountFill).not.toBeNull()
    if (!mountFill) return

    // Paint-call gate (bitmap call arguments, not pixels).
    expect(mountFill.fillStyle).toBe('#ff0000')
    expect(mountFill.width).toBeGreaterThan(100)
    expect(mountFill.height).toBeGreaterThan(0)
    expect(mountFill.left).toBeLessThanOrEqual(1)
    const mountSpacing = barSpacingCssPx(mountFill, 1)
    expect(mountSpacing).toBeGreaterThan(0.5)
    expect(mountSpacing).toBeLessThan(12)
    expect(mountFill.left + mountFill.width).toBeGreaterThan(mountFill.canvas.width * 0.25)

    // No older-history page on mount and no idle repaint/fetch from the clip.
    await page.waitForTimeout(1_000)
    const historyAfterMount = unloaded.historyRequests.length
    await resetPaint(page)
    await page.waitForTimeout(1_000)
    const idle = await paint(page)
    expect(idle.fills.length).toBe(0)
    expect(idle.arcs.length).toBe(0)
    expect(unloaded.historyRequests.length).toBe(historyAfterMount)

    // Selection: no handle on the clipped start.
    await resetPaint(page)
    await clickFillCentre(page, mountFill, 1)
    const clippedHandles = await waitForHandles(page)
    expect(clippedHandles.length).toBe(5)
    expect(clippedHandles.some((arc) => Math.abs(arc.x - mountFill.left) < 1)).toBe(false)
    expect(clippedHandles.every((arc) => arc.radius === HANDLE_RADIUS_CSS_PX)).toBe(true)

    // Move: duration and the (unloaded) start survive; the anchor is untouched.
    const beforeMove = await storedRectangle(page)
    expect(beforeMove).not.toBeNull()
    if (!beforeMove) return
    expect(beforeMove.fromTime).toBe(UNLOADED_FROM)
    expect(beforeMove.toTime).toBe(TO_SECONDS)
    const moveCentre = pageCentreOfFill(mountFill, 1)
    await resetPaint(page)
    await drag(page, moveCentre, { x: moveCentre.x + 60, y: moveCentre.y })
    const afterMove = await storedRectangle(page)
    expect(afterMove).not.toBeNull()
    if (!afterMove) return
    expect(afterMove.toTime - afterMove.fromTime).toBe(DURATION_SECONDS)
    expect(afterMove.fromTime).not.toBe(beforeMove.fromTime)
    expect(afterMove.fromTime).toBeLessThan(FIRST_LOADED_SECONDS)
    await waitForRedFill(page)
    await page.waitForTimeout(200)
    const movedFill = (await paint(page)).fills.at(-1)
    expect(movedFill).toBeTruthy()
    if (!movedFill) return

    // East resize: only `toTime` changes; the stored start is never rewritten.
    await resetPaint(page)
    const eastEdge = pageEastEdgeOfFill(movedFill, 1)
    await drag(page, eastEdge, { x: eastEdge.x + 40, y: eastEdge.y })
    const afterResize = await storedRectangle(page)
    expect(afterResize).not.toBeNull()
    if (!afterResize) return
    expect(afterResize.fromTime).toBe(afterMove.fromTime)
    expect(afterResize.toTime).not.toBe(afterMove.toTime)
    expect(afterResize.fromTime).toBeLessThan(FIRST_LOADED_SECONDS)

    // Panel resize: panel and pane dimensions and bar spacing must really change.
    const chart = page.getByTestId('btc-perp-chart').first()
    const panelBefore = await chart.boundingBox()
    const paneBefore = await paneCanvasRect(page)
    expect(panelBefore).not.toBeNull()
    await resetPaint(page)
    await page.setViewportSize({ width: 1_200, height: 820 })
    const panelAfter = await chart.boundingBox()
    const paneAfter = await paneCanvasRect(page)
    expect(panelAfter).not.toBeNull()
    if (!panelBefore || !panelAfter) return
    expect(panelAfter.width).toBeLessThan(panelBefore.width - 100)
    expect(paneAfter.width).toBeLessThan(paneBefore.width - 50)
    const resizedFill = await waitForRedFill(page)
    const resizedSpacing = barSpacingCssPx(resizedFill, 1)
    expect(Math.abs(resizedSpacing - mountSpacing)).toBeGreaterThan(mountSpacing * 0.02)
    expect(resizedFill.left).toBeLessThanOrEqual(1)

    // Wheel zoom (official): bar spacing changes, the box stays painted.
    await resetPaint(page)
    const pane = await paneCanvasRect(page)
    await page.mouse.move(pane.left + pane.width / 2, pane.top + pane.height / 2)
    await page.mouse.wheel(0, -300)
    const zoomedFill = await waitForRedFill(page)
    const zoomedSpacing = barSpacingCssPx(zoomedFill, 1)
    expect(zoomedSpacing).toBeGreaterThan(resizedSpacing * 1.05)
    expect(zoomedFill.left).toBeLessThanOrEqual(1)

    // Official time-scale pan: the visible mapping moves, spacing stays put.
    const dragBars = 33.5
    const dragBitmapPx = Math.round(zoomedSpacing * dragBars)
    await resetPaint(page)
    const panGesture = await panViewBy(page, 1, dragBitmapPx)
    const pannedFill = (await paint(page)).fills.at(-1)
    expect(pannedFill).toBeTruthy()
    if (!pannedFill) return
    const pannedSpacing = barSpacingCssPx(pannedFill, 1)
    expect(Math.abs(pannedSpacing - zoomedSpacing)).toBeLessThan(zoomedSpacing * 0.01)
    const shiftBitmap = Math.abs(pannedFill.right - zoomedFill.right)
    expect(shiftBitmap).toBeGreaterThan(20)
    expect(
      Math.abs(
        pannedFill.right -
          pannedFill.left -
          (zoomedFill.right - zoomedFill.left),
      ),
    ).toBeLessThan(3)
    expect(['time-axis', 'pane']).toContain(panGesture)
    // A non-integer number of bars scrolled away = a fractional logical range.
    // At DPR 1 bitmap px and CSS px per bar are the same value.
    const shiftBars = shiftBitmap / zoomedSpacing
    expect(shiftBars).toBeGreaterThan(10)
    expect(Math.abs(shiftBars - Math.round(shiftBars))).toBeGreaterThan(0.03)
    expect(pannedFill.left).toBeLessThanOrEqual(1)
    expect(await storedRectangle(page)).toEqual(afterResize)

    // Reload: the persisted bounds and the clipped visible part survive.
    const beforeReload = await storedRectangle(page)
    const beforeReloadFill = pannedFill
    await page.reload()
    await expect(chart).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
    const reloadedFill = await waitForRedFill(page)
    expect(await storedRectangle(page)).toEqual(beforeReload)
    expect(Math.abs(reloadedFill.right - beforeReloadFill.right)).toBeLessThanOrEqual(4)
    expect(Math.abs(reloadedFill.left - beforeReloadFill.left)).toBeLessThanOrEqual(4)
    await resetPaint(page)
    await clickFillCentre(page, reloadedFill, 1)
    expect((await waitForHandles(page)).length).toBe(5)

    // Continue older history until the stored start is loaded: the clipped edge
    // becomes a real endpoint and the box gets all eight handles.
    let handleCount = 5
    const continuousSpacing = barSpacingCssPx(reloadedFill, 1)
    for (let attempt = 0; attempt < 8 && handleCount < 8; attempt += 1) {
      await resetPaint(page)
      await panViewBy(page, 1, Math.round(continuousSpacing * 60))
      const currentFill = (await paint(page)).fills.at(-1)
      if (!currentFill) continue
      const paneRect = await paneCanvasRect(page)
      const left = Math.max(currentFill.left + currentFill.canvas.left, paneRect.left + 2)
      const right = Math.min(
        currentFill.left + currentFill.width + currentFill.canvas.left,
        paneRect.left + paneRect.width - 2,
      )
      if (right - left < 12) continue
      await resetPaint(page)
      await page.mouse.click((left + right) / 2, currentFill.canvas.top + (currentFill.top + currentFill.height / 2))
      const arcs = (await paint(page)).arcs
      if (arcs.length > 0) handleCount = arcs.length
    }
    expect(handleCount).toBe(8)
    expect(await storedRectangle(page)).toEqual(beforeReload)

    // ---------------- DPR 1 controls: pixel no-ops --------------------------
    const anchored = await openChart(browser, 1, 'anchored')
    runs.push(anchored)
    expect(anchored.mountFill).not.toBeNull()
    expect(anchored.historyRequests.length).toBe(historyAfterMount)
    // Same visible pixels as the clipped box (its west handles are off-bitmap).
    expect(anchored.mountHash).toBe(unloaded.mountHash)
    if (anchored.mountFill) {
      expect(anchored.mountFill.left).toBe(mountFill.left)
      expect(anchored.mountFill.width).toBe(mountFill.width)
    }
    await resetPaint(anchored.page)
    if (anchored.mountFill) {
      await clickFillCentre(anchored.page, anchored.mountFill, 1)
      const anchoredHandles = await waitForHandles(anchored.page)
      expect(anchoredHandles.length).toBe(8)
      expect(anchoredHandles.some((arc) => Math.abs(arc.x - anchored.mountFill!.left) < 1)).toBe(true)
    }

    const none = await openChart(browser, 1, 'none')
    runs.push(none)
    const outside = await openChart(browser, 1, 'outside')
    runs.push(outside)
    const offscreen = await openChart(browser, 1, 'offscreen')
    runs.push(offscreen)
    const hidden = await openChart(browser, 1, 'hidden')
    runs.push(hidden)
    const opacity0 = await openChart(browser, 1, 'opacity0')
    runs.push(opacity0)

    // A box entirely before the loaded history paints and hits nothing.
    expect((await paint(outside.page)).fills.length).toBe(0)
    expect(outside.historyRequests.length).toBe(historyAfterMount)
    const outsideChartBox = await outside.page
      .getByTestId('btc-perp-chart')
      .first()
      .boundingBox()
    if (outsideChartBox) {
      await outside.page.mouse.click(
        outsideChartBox.x + outsideChartBox.width / 2,
        outsideChartBox.y + outsideChartBox.height / 2,
      )
      await outside.page.waitForTimeout(400)
    }
    expect((await paint(outside.page)).arcs.length).toBe(0)

    // Pixel-identical to the no-box control: no visible change at all.
    for (const control of [outside, offscreen, hidden, opacity0]) {
      expect(control.mountHash, `${control.page.url()} must not change a pixel`).toBe(
        none.mountHash,
      )
    }
    // The box never adds an older-history page on mount in any fixture.
    for (const control of [none, outside, offscreen, hidden, opacity0]) {
      expect(control.historyRequests.length).toBe(historyAfterMount)
    }
    // Printed so a local/preview run carries the measured numbers into the PR.
    console.log(
      `[box265] mountHistoryRequests=${historyAfterMount} ` +
        `barSpacingCssPx=${mountSpacing.toFixed(3)} zoomed=${zoomedSpacing.toFixed(3)} ` +
        `shiftBars=${shiftBars.toFixed(2)} panGesture=${panGesture}`,
    )
    // The transparent fill is still recorded with alpha 0.
    const transparentFill = (await paint(opacity0.page)).fills.at(-1)
    expect(transparentFill?.fillStyle).toBe('rgba(255, 0, 0, 0)')

    // ---------------- DPR 2: identity and exact scaling ---------------------
    const unloaded2 = await openChart(browser, 2, 'unloaded')
    runs.push(unloaded2)
    const anchored2 = await openChart(browser, 2, 'anchored')
    runs.push(anchored2)
    expect(unloaded2.mountFill).not.toBeNull()
    if (!unloaded2.mountFill) return
    // Same DPR: same pixels as the anchored control.
    expect(anchored2.mountHash).toBe(unloaded2.mountHash)
    // Across DPR: the CSS-space geometry is identical, so bitmap px scale by DPR.
    expect(Math.abs(unloaded2.mountFill.left / 2 - mountFill.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(unloaded2.mountFill.width / 2 - mountFill.width)).toBeLessThanOrEqual(1)
    expect(Math.abs(unloaded2.mountFill.top / 2 - mountFill.top)).toBeLessThanOrEqual(1)
    expect(Math.abs(unloaded2.mountFill.height / 2 - mountFill.height)).toBeLessThanOrEqual(1)
    expect(Math.abs(barSpacingCssPx(unloaded2.mountFill, 2) - mountSpacing)).toBeLessThan(0.02)
    void panGesture
  } finally {
    await closeAll()
  }
})
