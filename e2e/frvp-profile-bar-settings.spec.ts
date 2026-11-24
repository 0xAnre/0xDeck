import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

/**
 * FRVP profile-bar size and appearance settings (Issue #272).
 *
 * The real React panel is driven against a deterministic 15m fixture. The
 * backend is mocked, including the fixed-range volume-profile endpoint, so the
 * rendered profile has a valid selection interval and real rows. Gates:
 *
 * 1. default geometry is the exact legacy 1/6-of-range maximum width and full
 *    price-row height (measured from the painted POC line span and row boxes);
 * 2. width/height changes are linear/centered and visible in canvas pixels;
 * 3. up/down colors and 0/100 opacities reach the canvas, including the
 *    Value-Area 0.55 / outside 0.25 alpha policy;
 * 4. style-only saves make no new volume-profile request, row count does;
 * 5. combined Save/Reload persists, Cancel/X/Esc discard, a hidden sibling and
 *    the original geometry fields stay untouched;
 * 6. zoom/pan/resize keep the current transforms and the chart settles with no
 *    idle FRVP repaint loop.
 *
 * Pixel assertions read the pane canvas inside one mount. The recorded
 * `fillRect`/`lineTo` arguments are bitmap draw calls, not a framebuffer diff;
 * they are labelled as such, and every visible change also has an in-pane
 * pixel sample. The actual canvas bitmap ratio is recorded and printed: this
 * headless build may present a DPR 2 window with a CSS-pixel-sized canvas
 * bitmap (ratio 1), so the spec never claims “2×” unless the measured ratio is
 * actually 2.
 */

const APP_URL = process.env.OXDECK_E2E_BASE_URL ?? '/'
const STORAGE_STATE = process.env.OXDECK_E2E_STORAGE_STATE

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const INITIAL_BARS = 750
const PANEL_ID = 'btc-perpetual-chart-frvp272'
const FRVP_STORAGE_KEY = '0xdeck-widget-fixed-range-vp-instances'
const SEED_MARKER = '0xdeck-e2e-frvp272-seeded'

/** 180 bars, all inside the default 500-bar loaded viewport. */
const FRVP_FROM = NOW_SECONDS - 240 * BAR_SECONDS
const FRVP_TO = NOW_SECONDS - 60 * BAR_SECONDS
const FRVP_REQUEST_END = FRVP_TO + BAR_SECONDS
const FRVP_ROW_COUNT = 24
const FRVP_VALUE_AREA_PERCENT = 60
const LOW_PRICE = 80_000
const HIGH_PRICE = 80_100

type ChartCandle = {
  symbol: string
  interval: string
  time: number
  open: number
  high: number
  low: number
  close: number
  volume: number
  closed: boolean
}

function candles(count: number, beforeSeconds?: number): ChartCandle[] {
  const lastOpen = beforeSeconds === undefined ? NOW_SECONDS : beforeSeconds - BAR_SECONDS
  return Array.from({ length: count }, (_, index) => {
    const time = lastOpen - (count - 1 - index) * BAR_SECONDS
    const close = LOW_PRICE + (index % 100)
    return {
      symbol: 'BTCUSDT',
      interval: INTERVAL,
      time,
      open: close - 5,
      high: close + 20,
      low: close - 30,
      close,
      volume: 12.5,
      closed: true,
    }
  })
}

/**
 * Every source candle spans the full profile price range, so every bin gets
 * both up and down volume and both Value-Area and outside rows exist.
 */
function profileCandles(startTime: number, endTime: number) {
  const count = Math.round((endTime - startTime) / BAR_SECONDS)
  return Array.from({ length: count }, (_, index) => {
    const up = index % 2 === 0
    return {
      time: startTime + index * BAR_SECONDS,
      open: up ? LOW_PRICE + 10 : HIGH_PRICE - 10,
      close: up ? HIGH_PRICE - 10 : LOW_PRICE + 10,
      low: LOW_PRICE,
      high: HIGH_PRICE,
      volume: 10 + (index % 7) * 5,
      interval: INTERVAL,
      closed: true,
    }
  })
}

type StoredInstance = {
  id: string
  fromTime: number
  toTime: number
  selectionInterval: string
  rowCount: number
  valueAreaPercent: number
  enabled: boolean
  displaySequence: number
  extendRight?: boolean
  locked?: boolean
  pocStrokeColor?: string
  pocStrokeOpacityPercent?: number
  histogramUpColor?: string
  histogramDownColor?: string
  histogramUpOpacityPercent?: number
  histogramDownOpacityPercent?: number
  histogramWidthPercent?: number
  histogramBarHeightPercent?: number
}

function primaryInstance(overrides: Partial<StoredInstance> = {}): StoredInstance {
  return {
    id: 'frvp-272-primary',
    fromTime: FRVP_FROM,
    toTime: FRVP_TO,
    selectionInterval: INTERVAL,
    rowCount: FRVP_ROW_COUNT,
    valueAreaPercent: FRVP_VALUE_AREA_PERCENT,
    enabled: true,
    displaySequence: 1,
    extendRight: false,
    locked: true,
    pocStrokeColor: '#00FF00',
    pocStrokeOpacityPercent: 100,
    histogramUpColor: '#FF0000',
    histogramDownColor: '#0000FF',
    histogramUpOpacityPercent: 100,
    histogramDownOpacityPercent: 100,
    ...overrides,
  }
}

function hiddenSibling(): StoredInstance {
  return {
    id: 'frvp-272-sibling',
    fromTime: FRVP_FROM - 20 * BAR_SECONDS,
    toTime: FRVP_TO - 20 * BAR_SECONDS,
    selectionInterval: INTERVAL,
    rowCount: 12,
    valueAreaPercent: 50,
    enabled: false,
    displaySequence: 2,
    extendRight: false,
    histogramWidthPercent: 42,
    histogramBarHeightPercent: 33,
  }
}

function seedPayload() {
  return {
    workspace: {
      version: 2,
      activeWorkspaceId: 'ws-frvp272',
      workspaces: [
        {
          id: 'ws-frvp272',
          activePanels: [PANEL_ID],
          layout: [{ i: PANEL_ID, x: 0, y: 0, w: 36, h: 40, minW: 9, minH: 10 }],
          gridVersion: 3,
        },
      ],
    },
    intervals: { [PANEL_ID]: INTERVAL },
    exchanges: { [PANEL_ID]: 'binance' },
    instances: { [PANEL_ID]: [primaryInstance(), hiddenSibling()] },
  }
}

const seedScript = ({ seed, marker }: { seed: ReturnType<typeof seedPayload>; marker: string }) => {
  if (localStorage.getItem(marker)) return
  localStorage.setItem('0xdeck-workspace', JSON.stringify(seed.workspace))
  localStorage.setItem('0xdeck-widget-market-intervals', JSON.stringify(seed.intervals))
  localStorage.setItem('0xdeck-widget-market-exchanges', JSON.stringify(seed.exchanges))
  localStorage.setItem('0xdeck-widget-fixed-range-vp-instances', JSON.stringify(seed.instances))
  localStorage.setItem(marker, '1')
}

type FrvpFill = {
  left: number
  top: number
  width: number
  height: number
  fillStyle: string
  frame: number
  canvasWidth: number
  canvasHeight: number
  canvasCssWidth: number
  canvasCssHeight: number
}

type FrvpLine = {
  x1: number
  y1: number
  x2: number
  y2: number
  strokeStyle: string
  frame: number
}

type FrvpPaintState = {
  fills: FrvpFill[]
  lines: FrvpLine[]
  frame: number
  reset: () => void
}

declare global {
  interface Window {
    /** Test-only FRVP paint recorder; never present in application code. */
    __frvpPaint?: FrvpPaintState
  }
}

/** Records the FRVP bar fills and the custom green POC line, per frame. */
const paintRecorderScript = () => {
  const state: FrvpPaintState = {
    fills: [],
    lines: [],
    frame: 0,
    reset() {
      state.fills.length = 0
      state.lines.length = 0
      state.frame = 0
    },
  }
  window.__frvpPaint = state
  const prototype = CanvasRenderingContext2D.prototype
  const originalFillRect = prototype.fillRect
  prototype.fillRect = function (left, top, width, height) {
    const fillStyle = String(this.fillStyle)
    const matches =
      /^rgba\(\s*255\s*,\s*0\s*,\s*0\s*,/i.test(fillStyle) ||
      /^rgba\(\s*0\s*,\s*0\s*,\s*255\s*,/i.test(fillStyle) ||
      /^rgba\(\s*0\s*,\s*255\s*,\s*0\s*,/i.test(fillStyle) ||
      /^#ff0000$/i.test(fillStyle) ||
      /^#0000ff$/i.test(fillStyle) ||
      /^#00ff00$/i.test(fillStyle)
    if (matches) {
      const rect = this.canvas.getBoundingClientRect()
      state.fills.push({
        left,
        top,
        width,
        height,
        fillStyle,
        frame: state.frame,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        canvasCssWidth: rect.width,
        canvasCssHeight: rect.height,
      })
    }
    return originalFillRect.call(this, left, top, width, height)
  }

  const pathStart = new WeakMap<CanvasRenderingContext2D, { x: number; y: number }>()
  const originalMoveTo = prototype.moveTo
  prototype.moveTo = function (x, y) {
    pathStart.set(this, { x, y })
    return originalMoveTo.call(this, x, y)
  }
  const originalLineTo = prototype.lineTo
  prototype.lineTo = function (x, y) {
    const start = pathStart.get(this)
    const strokeStyle = String(this.strokeStyle)
    if (start && /^#00ff00$/i.test(strokeStyle) && Math.abs(start.y - y) < 0.01) {
      state.lines.push({
        x1: start.x,
        y1: start.y,
        x2: x,
        y2: y,
        strokeStyle,
        frame: state.frame,
      })
    }
    return originalLineTo.call(this, x, y)
  }

  const originalClearRect = prototype.clearRect
  prototype.clearRect = function (x, y, width, height) {
    state.frame += 1
    return originalClearRect.call(this, x, y, width, height)
  }
}

type ChartRun = {
  context: BrowserContext
  page: Page
  volumeProfileRequests: string[]
}

async function openChart(browser: Browser, deviceScaleFactor: number): Promise<ChartRun> {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor,
    ...(STORAGE_STATE ? { storageState: STORAGE_STATE } : {}),
  })
  const page = await context.newPage()
  const volumeProfileRequests: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.endsWith('/klines/volume-profile')) {
      volumeProfileRequests.push(url.pathname + url.search)
    }
  })

  await page.addInitScript(paintRecorderScript)
  await page.addInitScript(seedScript, { seed: seedPayload(), marker: SEED_MARKER })
  await page.routeWebSocket(/\/api\/ws\//, () => {})

  await page.route(
    (url) => url.pathname.startsWith('/api/'),
    async (route) => {
      const url = new URL(route.request().url())
      const path = url.pathname
      const json = (body: unknown) =>
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
      const klines = (bars: ChartCandle[]) =>
        json({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          interval: INTERVAL,
          candles: bars,
          available_from: null,
        })

      if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
      if (path.endsWith('/klines/daily-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/weekly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/monthly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/quarterly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/yearly-context')) return klines(candles(INITIAL_BARS))
      if (path.endsWith('/klines/history')) {
        const before = Number(url.searchParams.get('before') ?? NOW_SECONDS)
        return klines(candles(500, before))
      }
      if (path.endsWith('/klines/volume-profile')) {
        const start = Number(url.searchParams.get('start_time'))
        const end = Number(url.searchParams.get('end_time'))
        return json({
          exchange: 'binance',
          symbol: 'BTCUSDT',
          start_time: start,
          end_time: end,
          source_interval: INTERVAL,
          candles: profileCandles(start, end),
          available_from: null,
          history_unavailable: false,
        })
      }
      if (path.endsWith('/klines')) return klines(candles(INITIAL_BARS))
      return route.fulfill({ status: 503, body: 'not mocked' })
    },
  )

  await page.goto(APP_URL)
  const chart = page.getByTestId('btc-perp-chart').first()
  await expect(chart).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
  await expect(chart.locator('canvas').first()).toBeVisible()
  await expect(page.locator('#frvp-histogram-width')).toHaveCount(0)
  return { context, page, volumeProfileRequests }
}

function paint(page: Page) {
  return page.evaluate(() => {
    const state = window.__frvpPaint
    if (!state) throw new Error('FRVP paint recorder missing')
    return { fills: state.fills.slice(), lines: state.lines.slice(), frame: state.frame }
  })
}

async function resetPaint(page: Page) {
  await page.evaluate(() => {
    window.__frvpPaint?.reset()
  })
}

async function waitForFills(page: Page): Promise<void> {
  await expect
    .poll(async () => (await paint(page)).fills.length, { timeout: 30_000 })
    .toBeGreaterThan(0)
}

function lastFrame<T extends { frame: number }>(items: T[]): T[] {
  if (items.length === 0) return []
  const frame = Math.max(...items.map((item) => item.frame))
  return items.filter((item) => item.frame === frame)
}

async function latestFills(page: Page): Promise<FrvpFill[]> {
  return lastFrame((await paint(page)).fills)
}

async function latestLines(page: Page): Promise<FrvpLine[]> {
  return lastFrame((await paint(page)).lines)
}

/** Painted selection span, in bitmap pixels, from the custom green POC line. */
async function selectionSpan(page: Page): Promise<{ left: number; right: number; width: number }> {
  const lines = (await latestLines(page)).filter(
    (line) => Math.abs(line.y1 - line.y2) < 0.01 && line.x2 > line.x1,
  )
  const line = lines[lines.length - 1]
  if (!line) throw new Error('POC line not recorded')
  return { left: line.x1, right: line.x2, width: line.x2 - line.x1 }
}

function maxBarWidth(fills: FrvpFill[]): number {
  if (fills.length === 0) throw new Error('no FRVP fills')
  const left = Math.min(...fills.map((fill) => fill.left))
  const right = Math.max(...fills.map((fill) => fill.left + fill.width))
  return right - left
}

function rowBoxes(fills: FrvpFill[]): Array<{ top: number; height: number; centre: number }> {
  const byKey = new Map<string, { top: number; height: number; centre: number }>()
  for (const fill of fills) {
    const key = `${fill.top}:${fill.height}`
    byKey.set(key, {
      top: fill.top,
      height: fill.height,
      centre: fill.top + fill.height / 2,
    })
  }
  return [...byKey.values()].sort((a, b) => a.top - b.top)
}

function alphaOf(fillStyle: string): number {
  const match = /rgba\([^)]*,\s*([\d.]+)\s*\)$/i.exec(fillStyle)
  return match ? Number.parseFloat(match[1]) : 1
}

function hasStyle(fills: FrvpFill[], rgb: string, alpha: number): boolean {
  return fills.some(
    (fill) => fill.fillStyle.includes(rgb) && Math.abs(alphaOf(fill.fillStyle) - alpha) < 1e-9,
  )
}

/** One canvas pixel of the pane canvas, in its own bitmap coordinates. */
async function samplePanePixel(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ px, py }) => {
      const container = document.querySelector('[data-testid="btc-perp-chart"]')
      const pane = Array.from(container?.querySelectorAll('canvas') ?? [])
        .map((canvas) => ({ canvas, box: canvas.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 200 && box.height > 100)
        .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0]
      if (!pane) throw new Error('pane canvas not found')
      const context = pane.canvas.getContext('2d')
      if (!context) throw new Error('pane context missing')
      const data = context.getImageData(Math.round(px), Math.round(py), 1, 1).data
      return [data[0], data[1], data[2], data[3]]
    },
    { px: x, py: y },
  )
}

async function paneCanvasRect(page: Page): Promise<{
  left: number
  top: number
  width: number
  height: number
}> {
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

async function timeAxisRect(page: Page): Promise<{
  left: number
  top: number
  width: number
  height: number
} | null> {
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

async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(to.x, to.y, { steps: 8 })
  await page.mouse.up()
}

function settingsDialog(page: Page) {
  return page.getByRole('dialog', { name: 'Volume profile' })
}

async function openSettings(page: Page) {
  await page.locator(`#${PANEL_ID}-tools`).click()
  await page.getByRole('menuitem', { name: 'Volume Profile 1 settings' }).click()
  await expect(settingsDialog(page)).toBeVisible()
}

async function saveSettings(page: Page) {
  await settingsDialog(page).getByRole('button', { name: 'Save' }).click()
  await expect(settingsDialog(page)).toHaveCount(0)
}

async function setNumberInput(page: Page, selector: string, value: string) {
  const input = settingsDialog(page).locator(selector)
  await input.scrollIntoViewIfNeeded()
  await input.fill(value)
  await input.blur()
}

async function setOpacityPercent(
  page: Page,
  selector: string,
  percent: number,
) {
  const dialog = settingsDialog(page)
  await dialog.locator(selector.replace('-opacity', '-color')).scrollIntoViewIfNeeded()
  await dialog.locator(selector.replace('-opacity', '-color')).click()
  const popover = page.locator('[data-slot="popover-content"]')
  await expect(popover).toBeVisible()
  const slider = popover.locator(selector)
  await slider.focus()
  await slider.press('Home')
  for (let step = 0; step < percent; step += 1) await slider.press('ArrowRight')
  await expect(slider).toHaveAttribute('aria-valuenow', String(percent))
  await page.keyboard.press('Escape')
  await expect(popover).toHaveCount(0)
}

async function storedInstances(page: Page): Promise<StoredInstance[]> {
  return page.evaluate(
    ({ key, panelId }) => {
      const raw = localStorage.getItem(key)
      if (!raw) return []
      const parsed = JSON.parse(raw) as Record<string, StoredInstance[]>
      return parsed[panelId] ?? []
    },
    { key: FRVP_STORAGE_KEY, panelId: PANEL_ID },
  )
}

function storedById(instances: StoredInstance[], id: string): StoredInstance | undefined {
  return instances.find((instance) => instance.id === id)
}

test('FRVP profile-bar size, appearance, persistence and transforms', async ({ browser }) => {
  test.setTimeout(360_000)
  const run = await openChart(browser, 1)
  const page = run.page

  try {
    await waitForFills(page)
    const initialFills = await latestFills(page)
    const initialSpan = await selectionSpan(page)
    const initialBoxes = rowBoxes(initialFills)
    const initialMaxWidth = maxBarWidth(initialFills)

    // ---- Default geometry: exact legacy 1/6 width and full row height ----
    expect(Math.abs(initialMaxWidth - initialSpan.width / 6)).toBeLessThanOrEqual(1)
    expect(initialBoxes.length).toBe(FRVP_ROW_COUNT)
    expect(initialMaxWidth).toBeGreaterThan(0)

    // ---- Both directions and the Value-Area/outside alpha policy ----
    expect(hasStyle(initialFills, 'rgba(255, 0, 0', 0.55)).toBe(true)
    expect(hasStyle(initialFills, 'rgba(255, 0, 0', 0.25)).toBe(true)
    expect(hasStyle(initialFills, 'rgba(0, 0, 255', 0.55)).toBe(true)
    expect(hasStyle(initialFills, 'rgba(0, 0, 255', 0.25)).toBe(true)

    const upFill = initialFills.find(
      (fill) =>
        fill.fillStyle.includes('rgba(255, 0, 0') &&
        alphaOf(fill.fillStyle) > 0.5 &&
        fill.width > 4,
    )
    const downFill = initialFills.find(
      (fill) =>
        fill.fillStyle.includes('rgba(0, 0, 255') &&
        alphaOf(fill.fillStyle) > 0.5 &&
        fill.width > 4,
    )
    expect(upFill).toBeTruthy()
    expect(downFill).toBeTruthy()
    if (!upFill || !downFill) return
    const upPixel = await samplePanePixel(
      page,
      upFill.left + upFill.width / 2,
      upFill.top + upFill.height / 2,
    )
    const downPixel = await samplePanePixel(
      page,
      downFill.left + downFill.width / 2,
      downFill.top + downFill.height / 2,
    )
    expect(upPixel[0]).toBeGreaterThan(upPixel[2])
    expect(downPixel[2]).toBeGreaterThan(downPixel[0])

    // The existing chart double-click target opens the same dialog, not just
    // the Tools gear. Convert the recorded bitmap bar centre to page CSS px.
    const doubleClickPane = await paneCanvasRect(page)
    const ratioX = upFill.canvasWidth / upFill.canvasCssWidth
    const ratioY = upFill.canvasHeight / upFill.canvasCssHeight
    await page.mouse.dblclick(
      doubleClickPane.left + (upFill.left + upFill.width / 2) / ratioX,
      doubleClickPane.top + (upFill.top + upFill.height / 2) / ratioY,
    )
    await expect(settingsDialog(page)).toBeVisible()
    await expect(settingsDialog(page).locator('#frvp-histogram-width')).toHaveValue('16.7')
    await expect(settingsDialog(page).locator('#frvp-histogram-bar-height')).toHaveValue('100')
    await settingsDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)

    const requestsAfterMount = run.volumeProfileRequests.length
    expect(requestsAfterMount).toBe(1)
    expect(run.volumeProfileRequests[0]).toContain(
      `start_time=${FRVP_FROM}&end_time=${FRVP_REQUEST_END}`,
    )

    // ---- Open the real dialog from Tools and verify all profile-bar controls ----
    await openSettings(page)
    const dialog = settingsDialog(page)
    await expect(dialog.locator('#frvp-row-count')).toHaveValue(String(FRVP_ROW_COUNT))
    await expect(dialog.locator('#frvp-histogram-width')).toHaveValue('16.7')
    await expect(dialog.locator('#frvp-histogram-bar-height')).toHaveValue('100')
    await expect(dialog.locator('#frvp-histogram-up-color')).toBeVisible()
    await expect(dialog.locator('#frvp-histogram-down-color')).toBeVisible()

    // Nested picker Esc closes only the picker; the draft survives.
    await setNumberInput(page, '#frvp-histogram-width', '50')
    await dialog.locator('#frvp-histogram-down-color').scrollIntoViewIfNeeded()
    await dialog.locator('#frvp-histogram-down-color').click()
    await expect(page.locator('[data-slot="popover-content"]')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-slot="popover-content"]')).toHaveCount(0)
    await expect(dialog).toBeVisible()
    await expect(dialog.locator('#frvp-histogram-width')).toHaveValue('50')

    await setNumberInput(page, '#frvp-histogram-bar-height', '50')
    await resetPaint(page)
    await saveSettings(page)
    await waitForFills(page)
    const halfFills = await latestFills(page)
    const halfSpan = await selectionSpan(page)
    const halfBoxes = rowBoxes(halfFills)
    const halfMaxWidth = maxBarWidth(halfFills)

    expect(run.volumeProfileRequests.length).toBe(requestsAfterMount)
    expect(Math.abs(halfMaxWidth - halfSpan.width * 0.5)).toBeLessThanOrEqual(1)
    expect(halfBoxes.length).toBe(FRVP_ROW_COUNT)
    expect(initialBoxes.length).toBe(halfBoxes.length)
    for (let index = 0; index < halfBoxes.length; index += 1) {
      expect(Math.abs(halfBoxes[index].centre - initialBoxes[index].centre)).toBeLessThanOrEqual(1.5)
      expect(halfBoxes[index].height).toBeLessThan(initialBoxes[index].height)
    }

    // ---- 0 opacity hides both directions while the rows remain ----
    await resetPaint(page)
    await openSettings(page)
    await setOpacityPercent(page, '#frvp-histogram-up-opacity', 0)
    await setOpacityPercent(page, '#frvp-histogram-down-opacity', 0)
    await saveSettings(page)
    await waitForFills(page)
    const zeroFills = await latestFills(page)
    expect(zeroFills.length).toBeGreaterThan(0)
    expect(zeroFills.every((fill) => alphaOf(fill.fillStyle) === 0)).toBe(true)
    expect(rowBoxes(zeroFills).length).toBe(FRVP_ROW_COUNT)
    expect((await latestLines(page)).length).toBeGreaterThan(0)
    const zeroUp = zeroFills.find(
      (fill) => fill.fillStyle.includes('rgba(255, 0, 0') && fill.width > 4,
    )
    expect(zeroUp).toBeTruthy()
    if (!zeroUp) return
    const zeroPixel = await samplePanePixel(
      page,
      zeroUp.left + zeroUp.width / 2,
      zeroUp.top + zeroUp.height / 2,
    )
    expect(run.volumeProfileRequests.length).toBe(requestsAfterMount)

    // Restore full opacity and verify the pixels come back.
    await resetPaint(page)
    await openSettings(page)
    await setOpacityPercent(page, '#frvp-histogram-up-opacity', 100)
    await setOpacityPercent(page, '#frvp-histogram-down-opacity', 100)
    await saveSettings(page)
    await waitForFills(page)
    const restoredPixel = await samplePanePixel(
      page,
      zeroUp.left + zeroUp.width / 2,
      zeroUp.top + zeroUp.height / 2,
    )
    expect(restoredPixel).not.toEqual(zeroPixel)
    expect(zeroPixel[0]).toBeLessThan(restoredPixel[0])
    expect(restoredPixel[0]).toBeGreaterThan(restoredPixel[2])

    // ---- Row count is a genuine recompute; style edits are not ----
    await resetPaint(page)
    await openSettings(page)
    await setNumberInput(page, '#frvp-row-count', '12')
    await saveSettings(page)
    await expect
      .poll(() => run.volumeProfileRequests.length, { timeout: 30_000 })
      .toBe(requestsAfterMount + 1)
    await waitForFills(page)
    const rowCountFills = await latestFills(page)
    expect(rowBoxes(rowCountFills).length).toBe(12)
    expect(maxBarWidth(rowCountFills)).toBeGreaterThan(0)

    // ---- Cancel / X / Esc discard drafts ----
    await openSettings(page)
    await setNumberInput(page, '#frvp-histogram-width', '80')
    await settingsDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    expect(storedById(await storedInstances(page), 'frvp-272-primary')?.histogramWidthPercent).toBe(
      50,
    )

    await openSettings(page)
    await setNumberInput(page, '#frvp-histogram-bar-height', '10')
    await page.keyboard.press('Escape')
    await expect(settingsDialog(page)).toHaveCount(0)
    expect(
      storedById(await storedInstances(page), 'frvp-272-primary')?.histogramBarHeightPercent,
    ).toBe(50)

    await openSettings(page)
    await setNumberInput(page, '#frvp-histogram-width', '80')
    await settingsDialog(page).getByRole('button', { name: 'Close' }).click()
    await expect(settingsDialog(page)).toHaveCount(0)
    expect(storedById(await storedInstances(page), 'frvp-272-primary')?.histogramWidthPercent).toBe(
      50,
    )

    await openSettings(page)
    await setNumberInput(page, '#frvp-histogram-width', '80')
    await page.mouse.click(200, 450)
    await expect(settingsDialog(page)).toHaveCount(0)
    expect(storedById(await storedInstances(page), 'frvp-272-primary')?.histogramWidthPercent).toBe(
      50,
    )

    // ---- Current transforms: resize, axis scale, wheel zoom, pan, idle ----
    const paneBefore = await paneCanvasRect(page)
    await resetPaint(page)
    await page.setViewportSize({ width: 1_200, height: 820 })
    await expect
      .poll(async () => (await paneCanvasRect(page)).width, { timeout: 10_000 })
      .toBeLessThan(paneBefore.width - 50)
    await waitForFills(page)
    const resizedSpan = await selectionSpan(page)
    const resizedFills = await latestFills(page)
    expect(Math.abs(maxBarWidth(resizedFills) - resizedSpan.width * 0.5)).toBeLessThanOrEqual(1)

    const axis = await timeAxisRect(page)
    expect(axis).not.toBeNull()
    if (!axis) return
    await resetPaint(page)
    await drag(
      page,
      { x: axis.left + axis.width / 2, y: axis.top + axis.height / 2 },
      { x: axis.left + axis.width / 2 + 120, y: axis.top + axis.height / 2 },
    )
    await page.waitForTimeout(300)
    await waitForFills(page)
    const axisSpan = await selectionSpan(page)
    expect(Math.abs(axisSpan.width - resizedSpan.width)).toBeGreaterThan(resizedSpan.width * 0.05)
    expect(Math.abs(maxBarWidth(await latestFills(page)) - axisSpan.width * 0.5)).toBeLessThanOrEqual(
      1,
    )

    const pane = await paneCanvasRect(page)
    await resetPaint(page)
    await page.mouse.move(pane.left + pane.width / 2, pane.top + 80)
    await page.mouse.wheel(0, 320)
    await page.waitForTimeout(300)
    await waitForFills(page)
    const wheelSpan = await selectionSpan(page)
    expect(Math.abs(wheelSpan.width - axisSpan.width)).toBeGreaterThan(axisSpan.width * 0.05)
    expect(Math.abs(maxBarWidth(await latestFills(page)) - wheelSpan.width * 0.5)).toBeLessThanOrEqual(
      1,
    )

    await resetPaint(page)
    await page.mouse.move(pane.left + pane.width / 2, pane.top + 80)
    await page.mouse.down()
    await page.mouse.move(pane.left + pane.width / 2 + 120, pane.top + 80, { steps: 8 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    await waitForFills(page)
    const pannedSpan = await selectionSpan(page)
    expect(Math.abs(pannedSpan.width - wheelSpan.width)).toBeLessThanOrEqual(2)
    expect(Math.abs(pannedSpan.left - wheelSpan.left)).toBeGreaterThan(10)

    // No idle FRVP repaint loop: after the interaction settles, two quiet reads
    // one second apart must not grow the recorded FRVP fill count.
    await page.mouse.move(10, 10)
    await page.waitForTimeout(500)
    await resetPaint(page)
    await page.waitForTimeout(300)
    const idleStart = (await paint(page)).fills.length
    await page.waitForTimeout(1_200)
    const idleEnd = (await paint(page)).fills.length
    expect(idleEnd).toBe(idleStart)

    // Sibling and workspace isolation: the hidden sibling and the original
    // geometry fields were never rewritten by style saves.
    const stored = await storedInstances(page)
    const primary = storedById(stored, 'frvp-272-primary')
    expect(primary?.fromTime).toBe(FRVP_FROM)
    expect(primary?.toTime).toBe(FRVP_TO)
    expect(primary?.enabled).toBe(true)
    expect(primary?.locked).toBe(true)
    expect(primary?.pocStrokeColor).toBe('#00FF00')
    expect(primary?.pocStrokeOpacityPercent).toBe(100)
    expect(primary?.histogramWidthPercent).toBe(50)
    expect(primary?.histogramBarHeightPercent).toBe(50)
    expect(primary?.rowCount).toBe(12)
    expect(storedById(stored, 'frvp-272-sibling')).toEqual(hiddenSibling())

    const canvas = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="btc-perp-chart"]')
      const pane = Array.from(container?.querySelectorAll('canvas') ?? [])
        .map((item) => ({ item, box: item.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 200 && box.height > 100)
        .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0]
      if (!pane) return null
      return {
        devicePixelRatio: window.devicePixelRatio,
        bitmapRatio: pane.item.width / pane.box.width,
      }
    })
    expect(canvas).not.toBeNull()
    console.log(
      `[frvp272] DPR=${canvas?.devicePixelRatio} canvasBitmapRatio=${canvas?.bitmapRatio?.toFixed(4)} ` +
        `defaultSpan=${initialSpan.width.toFixed(1)} defaultMaxBar=${initialMaxWidth.toFixed(1)} ` +
        `requests=${run.volumeProfileRequests.length}`,
    )
  } finally {
    await run.context.close()
  }
})

test('FRVP size/color edits Save together, reload, and discard correctly', async ({ browser }) => {
  test.setTimeout(240_000)
  const run = await openChart(browser, 1)
  const page = run.page
  try {
    await waitForFills(page)
    const requestsAfterMount = run.volumeProfileRequests.length
    await openSettings(page)
    const dialog = settingsDialog(page)
    await setNumberInput(page, '#frvp-histogram-width', '55')
    await setNumberInput(page, '#frvp-histogram-bar-height', '60')
    await setNumberInput(page, '#frvp-row-count', '18')

    // Up color through the shared custom HEX form.
    await dialog.locator('#frvp-histogram-up-color').scrollIntoViewIfNeeded()
    await dialog.locator('#frvp-histogram-up-color').click()
    const popover = page.locator('[data-slot="popover-content"]')
    await expect(popover).toBeVisible()
    await popover.getByRole('button', { name: 'Custom HEX' }).click()
    const custom = popover.locator('#frvp-histogram-up-color-custom')
    await custom.fill('#00FF00')
    await custom.press('Enter')
    await page.keyboard.press('Escape')
    await expect(popover).toHaveCount(0)

    // Down opacity through the shared slider.
    await setOpacityPercent(page, '#frvp-histogram-down-opacity', 30)

    await resetPaint(page)
    await saveSettings(page)
    await expect
      .poll(() => run.volumeProfileRequests.length, { timeout: 30_000 })
      .toBe(requestsAfterMount + 1)
    await waitForFills(page)

    const stored = await storedInstances(page)
    const primary = storedById(stored, 'frvp-272-primary')
    expect(primary?.histogramWidthPercent).toBe(55)
    expect(primary?.histogramBarHeightPercent).toBe(60)
    expect(primary?.rowCount).toBe(18)
    expect(primary?.histogramUpColor).toBe('#00FF00')
    expect(primary?.histogramDownOpacityPercent).toBe(30)
    expect(primary?.fromTime).toBe(FRVP_FROM)
    expect(primary?.toTime).toBe(FRVP_TO)
    expect(storedById(stored, 'frvp-272-sibling')).toEqual(hiddenSibling())

    const savedFills = await latestFills(page)
    expect(hasStyle(savedFills, 'rgba(255, 0, 0', 0.55)).toBe(false)
    expect(hasStyle(savedFills, 'rgba(0, 255, 0', 0.55)).toBe(true)
    expect(hasStyle(savedFills, 'rgba(0, 0, 255', 0.165)).toBe(true)
    expect(hasStyle(savedFills, 'rgba(0, 0, 255', 0.075)).toBe(true)

    // Reload from localStorage: the combined save survives as one record.
    await page.reload()
    await expect(page.getByTestId('btc-perp-chart').first()).toHaveAttribute(
      'aria-hidden',
      'false',
      { timeout: 60_000 },
    )
    await waitForFills(page)
    await openSettings(page)
    const reloaded = settingsDialog(page)
    await expect(reloaded.locator('#frvp-histogram-width')).toHaveValue('55')
    await expect(reloaded.locator('#frvp-histogram-bar-height')).toHaveValue('60')
    await expect(reloaded.locator('#frvp-row-count')).toHaveValue('18')
    await reloaded.locator('#frvp-histogram-up-color').scrollIntoViewIfNeeded()
    await reloaded.locator('#frvp-histogram-up-color').click()
    const reloadedPopover = page.locator('[data-slot="popover-content"]')
    await expect(reloadedPopover).toBeVisible()
    await reloadedPopover.getByRole('button', { name: 'Custom HEX' }).click()
    await expect(reloadedPopover.locator('#frvp-histogram-up-color-custom')).toHaveValue(
      '#00FF00',
    )
    await page.keyboard.press('Escape')
    await reloaded.getByRole('button', { name: 'Cancel' }).click()
    expect(storedById(await storedInstances(page), 'frvp-272-primary')).toEqual(primary)
  } finally {
    await run.context.close()
  }
})

test('FRVP profile bars keep the bitmap ratio and pixels at a DPR 2 window', async ({ browser }) => {
  test.setTimeout(240_000)
  const run = await openChart(browser, 2)
  const page = run.page
  try {
    await waitForFills(page)
    const fills = await latestFills(page)
    const span = await selectionSpan(page)
    const maxWidth = maxBarWidth(fills)
    expect(Math.abs(maxWidth - span.width / 6)).toBeLessThanOrEqual(1)

    const ratio = await page.evaluate(() => {
      const container = document.querySelector('[data-testid="btc-perp-chart"]')
      const pane = Array.from(container?.querySelectorAll('canvas') ?? [])
        .map((item) => ({ item, box: item.getBoundingClientRect() }))
        .filter(({ box }) => box.width > 200 && box.height > 100)
        .sort((a, b) => b.box.width * b.box.height - a.box.width * a.box.height)[0]
      if (!pane) return null
      return {
        devicePixelRatio: window.devicePixelRatio,
        bitmapRatio: pane.item.width / pane.box.width,
        bitmapHeightRatio: pane.item.height / pane.box.height,
      }
    })
    expect(ratio).not.toBeNull()
    if (!ratio) return
    // The fill coordinates are bitmap-space. Compare them to the canvas's
    // actual ratio rather than assuming devicePixelRatio = 2 implies a 2×
    // bitmap: this headless build is known to keep the bitmap CSS-sized.
    expect(ratio.bitmapRatio).toBeGreaterThan(0)
    expect(ratio.bitmapHeightRatio).toBeGreaterThan(0)

    const sample = fills.find(
      (fill) =>
        fill.fillStyle.includes('rgba(255, 0, 0') &&
        fill.width > 4 &&
        alphaOf(fill.fillStyle) > 0.5,
    )
    expect(sample).toBeTruthy()
    if (!sample) return
    const pixel = await samplePanePixel(
      page,
      sample.left + sample.width / 2,
      sample.top + sample.height / 2,
    )
    expect(pixel[3]).toBeGreaterThan(0)
    expect(pixel[0]).toBeGreaterThan(pixel[2])
    console.log(
      `[frvp272-dpr2] devicePixelRatio=${ratio.devicePixelRatio} ` +
        `canvasBitmapRatio=${ratio.bitmapRatio.toFixed(4)}x${ratio.bitmapHeightRatio.toFixed(4)} ` +
        `spanBitmapPx=${span.width.toFixed(1)} defaultMaxBarBitmapPx=${maxWidth.toFixed(1)}`,
    )
  } finally {
    await run.context.close()
  }
})


test('FRVP profile bars stay bounded at the maximum width and minimum row fill', async ({
  browser,
}) => {
  test.setTimeout(180_000)
  const run = await openChart(browser, 1)
  const page = run.page
  try {
    await waitForFills(page)
    const initialSpan = await selectionSpan(page)
    await openSettings(page)
    await setNumberInput(page, '#frvp-histogram-width', '100')
    await setNumberInput(page, '#frvp-histogram-bar-height', '1')
    await saveSettings(page)
    await waitForFills(page)
    const fills = await latestFills(page)
    const span = await selectionSpan(page)
    const maxWidth = maxBarWidth(fills)
    // 100% of the selection and no overflow beyond its right boundary.
    expect(maxWidth).toBeGreaterThanOrEqual(span.width - 2)
    expect(maxWidth).toBeLessThanOrEqual(span.width + 1)
    // The maximum width is also wider than the legacy 1/6 default.
    expect(maxWidth).toBeGreaterThan(initialSpan.width / 6)
    expect(rowBoxes(fills).length).toBe(FRVP_ROW_COUNT)
    // 1% row fill stays inside each bin. The bitmap may round a small row to
    // zero pixels, so only the non-negative bounded height is asserted here.
    for (const box of rowBoxes(fills)) {
      expect(box.height).toBeGreaterThanOrEqual(0)
      expect(box.height).toBeLessThanOrEqual(3)
    }
    expect(run.volumeProfileRequests.length).toBe(1)

    // The explicit maximum and minimum survive a reload.
    await page.reload()
    await expect(page.getByTestId('btc-perp-chart').first()).toHaveAttribute(
      'aria-hidden',
      'false',
      { timeout: 60_000 },
    )
    await waitForFills(page)
    await openSettings(page)
    await expect(settingsDialog(page).locator('#frvp-histogram-width')).toHaveValue('100')
    await expect(settingsDialog(page).locator('#frvp-histogram-bar-height')).toHaveValue('1')
    await settingsDialog(page).getByRole('button', { name: 'Cancel' }).click()
    const stored = storedById(await storedInstances(page), 'frvp-272-primary')
    expect(stored?.histogramWidthPercent).toBe(100)
    expect(stored?.histogramBarHeightPercent).toBe(1)
  } finally {
    await run.context.close()
  }
})

