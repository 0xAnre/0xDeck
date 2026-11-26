import { expect, test, type Locator, type Page } from '@playwright/test'

/**
 * Browser regression for #274: independent Body / Border / Wick candle
 * appearance (colors, opacity, visibility) on top of the #249 global candle
 * preference.
 *
 * The backend is mocked so the assertions are about the browser's own
 * behaviour: legacy `{ rising, falling }` records migrate in memory and are not
 * rewritten by load/open/cancel, the three parts have independent swatches,
 * opacity sliders and checkboxes, Save applies in place to every mounted and
 * newly added panel on both candle exchanges and both workspaces, and the
 * actual chart canvas paints all six colors with a native 1px border. Candle
 * series options are also observed through the `data-candle-*` attributes the
 * chart publishes from `series.options()`.
 */

const INTERVAL = '15m'
const BAR_SECONDS = 15 * 60
const NOW_SECONDS = 1_795_000_000 - (1_795_000_000 % BAR_SECONDS)
const PANEL_BINANCE = 'btc-perpetual-chart-binance274'
const PANEL_HYPERLIQUID = 'btc-perpetual-chart-hyper274'
const PANEL_WORKSPACE_2 = 'btc-perpetual-chart-ws2274'
const CANDLE_COLORS_STORAGE_KEY = '0xdeck-candle-colors'
const RECTANGLE_STORAGE_KEY = '0xdeck-widget-rectangle-instances'

type CandlePartRecord = {
  visible: boolean
  rising: string
  falling: string
  opacity: number
}
type CandleRecord = {
  body: CandlePartRecord
  border: CandlePartRecord
  wick: CandlePartRecord
}

const DEFAULT_RECORD: CandleRecord = {
  body: { visible: true, rising: '#DBDBDB', falling: '#808080', opacity: 100 },
  border: { visible: false, rising: '#DBDBDB', falling: '#808080', opacity: 100 },
  wick: { visible: true, rising: '#DBDBDB', falling: '#808080', opacity: 100 },
}

/** Same palette hexes the shared `ColorOpacityField` emits. */
const PALETTE = {
  bodyRising: '#D15F5B',
  bodyFalling: '#29B5E8',
  borderRising: '#1E9E55',
  borderFalling: '#8B3FD9',
  wickRising: '#2563EB',
  wickFalling: '#FF8A3D',
} as const

function record(overrides?: {
  body?: Partial<CandlePartRecord>
  border?: Partial<CandlePartRecord>
  wick?: Partial<CandlePartRecord>
}): CandleRecord {
  return {
    body: { ...DEFAULT_RECORD.body, ...overrides?.body },
    border: { ...DEFAULT_RECORD.border, ...overrides?.border },
    wick: { ...DEFAULT_RECORD.wick, ...overrides?.wick },
  }
}

function candles(
  count: number,
  exchange: 'binance' | 'hyperliquid',
  interval: string,
  beforeSeconds?: number,
) {
  const symbol = exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
  const lastOpen = beforeSeconds === undefined ? NOW_SECONDS : beforeSeconds - BAR_SECONDS
  return Array.from({ length: count }, (_, index) => {
    const time = lastOpen - (count - 1 - index) * BAR_SECONDS
    const close = 80_000 + (index % 20) * 2
    const rising = index % 2 === 0
    const open = rising ? close - 12 : close + 12
    return {
      symbol,
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

type SeedWorkspaces = {
  activeWorkspaceId: string
  workspaces: Array<{ id: string; panelIds: string[]; panelHeight?: number }>
  exchanges: Record<string, 'binance' | 'hyperliquid'>
}

function workspacePayload(seed: SeedWorkspaces) {
  return {
    version: 2,
    activeWorkspaceId: seed.activeWorkspaceId,
    workspaces: seed.workspaces.map((workspace) => ({
      id: workspace.id,
      activePanels: workspace.panelIds,
      layout: workspace.panelIds.map((panelId, index) => ({
        i: panelId,
        x: index * 18,
        y: 0,
        w: 18,
        h: workspace.panelHeight ?? 16,
      })),
      gridVersion: 3,
    })),
  }
}

async function seedWorkspace(
  page: Page,
  seed: SeedWorkspaces,
  candleColors?: CandleRecord | { rising: string; falling: string },
) {
  await page.addInitScript(
    ({ workspace, exchanges, interval, colors }) => {
      window.localStorage.setItem('0xdeck-workspace', JSON.stringify(workspace))
      window.localStorage.setItem(
        '0xdeck-widget-market-exchanges',
        JSON.stringify(exchanges),
      )
      window.localStorage.setItem(
        '0xdeck-widget-market-intervals',
        JSON.stringify(
          Object.fromEntries(Object.keys(exchanges).map((panelId) => [panelId, interval])),
        ),
      )
      // Seed only once, so a reload observes what the app itself persisted.
      if (colors !== null && window.localStorage.getItem('0xdeck-candle-colors') === null) {
        window.localStorage.setItem('0xdeck-candle-colors', JSON.stringify(colors))
      }
    },
    {
      workspace: workspacePayload(seed),
      exchanges: seed.exchanges,
      interval: INTERVAL,
      colors: candleColors ?? null,
    },
  )
}

async function mockMarket(page: Page, marketRequests: string[]) {
  await page.routeWebSocket(/\/api\/ws\//, () => {
    // Silent relay sockets: candles come from the mocked REST history below.
  })
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    const exchange = path.includes('/hyperliquid/') ? 'hyperliquid' : 'binance'
    const symbol = exchange === 'hyperliquid' ? 'BTC' : 'BTCUSDT'
    // A panel created from the Widgets menu starts on the default 1m interval.
    const responseInterval = url.searchParams.get('interval') ?? INTERVAL
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (path === '/api/health') return json({ status: 'ok', parquet_folder: '/data' })
    if (path.endsWith('/klines/daily-context')) {
      marketRequests.push(path)
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(48, exchange, responseInterval),
        available_from: null,
      })
    }
    if (path.endsWith('/klines/history')) {
      marketRequests.push(path)
      const before = Number(url.searchParams.get('before') ?? NOW_SECONDS)
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(48, exchange, responseInterval, before),
        available_from: null,
      })
    }
    if (path.endsWith('/klines')) {
      marketRequests.push(path)
      return json({
        exchange,
        symbol,
        interval: responseInterval,
        candles: candles(48, exchange, responseInterval),
        available_from: null,
      })
    }
    return route.fulfill({ status: 503, body: 'not mocked' })
  })
}

function chart(page: Page, panelId: string): Locator {
  return page.locator(`[data-panel-id="${panelId}"]`)
}

function appearanceTrigger(page: Page): Locator {
  return page.getByRole('button', { name: 'Appearance' })
}

function colorPopover(page: Page): Locator {
  return page.locator('[data-slot="popover-content"]')
}

const OPTION_ATTRIBUTES = {
  bodyRising: 'data-candle-rising-color',
  bodyFalling: 'data-candle-falling-color',
  wickRising: 'data-candle-rising-wick-color',
  wickFalling: 'data-candle-falling-wick-color',
  borderRising: 'data-candle-rising-border-color',
  borderFalling: 'data-candle-falling-border-color',
  borderVisible: 'data-candle-border-visible',
  wickVisible: 'data-candle-wick-visible',
} as const

async function expectAppliedOptions(
  page: Page,
  panelId: string,
  expected: Record<keyof typeof OPTION_ATTRIBUTES, string>,
) {
  const locator = chart(page, panelId)
  for (const [key, attribute] of Object.entries(OPTION_ATTRIBUTES)) {
    await expect(locator).toHaveAttribute(attribute, expected[key as keyof typeof expected])
  }
}

function defaultOptions() {
  return {
    bodyRising: '#DBDBDB',
    bodyFalling: '#808080',
    wickRising: '#DBDBDB',
    wickFalling: '#808080',
    borderRising: '#DBDBDB',
    borderFalling: '#808080',
    borderVisible: 'false',
    wickVisible: 'true',
  }
}

function legacyOptions(rising: string, falling: string) {
  return {
    bodyRising: rising,
    bodyFalling: falling,
    wickRising: rising,
    wickFalling: falling,
    borderRising: rising,
    borderFalling: falling,
    borderVisible: 'false',
    wickVisible: 'true',
  }
}

function rgba(hex: string, opacityPercent: number): string {
  const red = Number.parseInt(hex.slice(1, 3), 16)
  const green = Number.parseInt(hex.slice(3, 5), 16)
  const blue = Number.parseInt(hex.slice(5, 7), 16)
  return `rgba(${red}, ${green}, ${blue}, ${opacityPercent / 100})`
}

async function waitForChart(page: Page, panelId: string) {
  await expect(chart(page, panelId)).toHaveAttribute('aria-hidden', 'false', {
    timeout: 60_000,
  })
  await expect(chart(page, panelId)).toHaveAttribute('data-candle-rising-color')
}

async function openCandleColorsDialog(page: Page) {
  await appearanceTrigger(page).click()
  await expect(page.getByRole('menuitem', { name: 'Candle colors' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Candle colors' }).click()
  const dialog = page.getByRole('dialog', { name: 'Candle colors' })
  await expect(dialog).toBeVisible()
  return dialog
}

async function readStoredCandleColors(page: Page): Promise<unknown> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as Record<string, unknown>
    // New records also carry the legacy top-level mirror; compare the parts.
    return 'body' in parsed
      ? { body: parsed.body, border: parsed.border, wick: parsed.wick }
      : parsed
  }, CANDLE_COLORS_STORAGE_KEY)
}

async function readStoredCandleColorsRaw(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), CANDLE_COLORS_STORAGE_KEY)
}

async function choosePaletteColor(page: Page, id: string, swatch: string) {
  await page.locator(`#${id}`).click()
  await expect(colorPopover(page)).toBeVisible()
  await colorPopover(page).getByRole('gridcell', { name: swatch }).click()
  await page.keyboard.press('Escape')
  await expect(colorPopover(page)).toHaveCount(0)
}

async function chooseCustomColor(page: Page, id: string, hex: string) {
  await page.locator(`#${id}`).click()
  await expect(colorPopover(page)).toBeVisible()
  await colorPopover(page).getByRole('button', { name: 'Custom HEX' }).click()
  await page.locator(`#${id}-custom`).fill(hex)
  await page.locator(`#${id}-custom`).press('Enter')
  await page.keyboard.press('Escape')
  await expect(colorPopover(page)).toHaveCount(0)
}

async function setPartOpacity(page: Page, dialog: Locator, part: 'Body' | 'Borders' | 'Wick', percent: number) {
  const slider = dialog.getByRole('slider', { name: `${part} opacity` })
  await slider.focus()
  await page.keyboard.press('Home')
  if (percent === 100) {
    await page.keyboard.press('End')
  } else {
    for (let index = 0; index < Math.floor(percent / 10); index += 1) {
      await page.keyboard.press('PageUp')
    }
    for (let index = 0; index < percent % 10; index += 1) {
      await page.keyboard.press('ArrowRight')
    }
  }
  await expect(slider).toHaveAttribute('aria-valuenow', String(percent))
}

async function togglePart(dialog: Locator, partId: 'body' | 'border' | 'wick', checked: boolean) {
  const checkbox = dialog.locator(`#candle-part-${partId}-visible`)
  if (checked) await checkbox.check()
  else await checkbox.uncheck()
  await expect(checkbox).toBeChecked({ checked })
}

async function nextFrames(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

/** Let the in-place applyOptions repaint land before sampling the canvas. */
async function settleChart(page: Page) {
  await nextFrames(page)
  await page.waitForTimeout(250)
}

type PixelSpec = {
  bodyRising: { hex: string; alpha: number }
  bodyFalling: { hex: string; alpha: number }
  borderRising: { hex: string; alpha: number }
  borderFalling: { hex: string; alpha: number }
  wickRising: { hex: string; alpha: number }
  wickFalling: { hex: string; alpha: number }
}

type PixelProbe = {
  dpr: number
  counts: Record<keyof PixelSpec, number>
  body: null | {
    centerX: number
    centerY: number
    left: number
    right: number
    top: number
    bottom: number
    leftBorderRun: number
    rightBorderRun: number
    topBorderRun: number
    bottomBorderRun: number
  }
  bodyPixel: number[] | null
  backgroundPixel: number[]
}

/**
 * Sample the real candle canvas.
 *
 * The chart paints an opaque theme background before the series, so a partial
 * part opacity is composited over that background. For each part the expected
 * paint color is therefore `alpha * color + (1 - alpha) * background` in 8-bit
 * sRGB, compared with a ±2 per-channel tolerance (canvas rounding). Counts are
 * device-pixel counts on the same canvas; DPR is returned instead of assuming 2x.
 */
async function probeCandleCanvas(
  page: Page,
  panelId: string,
  spec: PixelSpec,
): Promise<PixelProbe> {
  return page.evaluate(
    ({ id, pixelSpec }) => {
      const hexToRgb = (hex: string) => [
        Number.parseInt(hex.slice(1, 3), 16),
        Number.parseInt(hex.slice(3, 5), 16),
        Number.parseInt(hex.slice(5, 7), 16),
      ]
      const host = document.querySelector(
        `[data-testid="btc-perp-chart"][data-panel-id="${id}"]`,
      )
      if (!(host instanceof HTMLElement)) throw new Error('chart host not found')
      const canvases = Array.from(host.querySelectorAll('canvas')) as HTMLCanvasElement[]
      const images = canvases.map((canvas) => {
        const context = canvas.getContext('2d')
        if (!context) throw new Error('2d context missing')
        return {
          canvas,
          image: context.getImageData(0, 0, canvas.width, canvas.height),
        }
      })

      const targets = Object.fromEntries(
        Object.entries(pixelSpec).map(([key, value]) => [key, hexToRgb(value.hex)]),
      ) as Record<keyof PixelSpec, number[]>

      // The candle series lives on the canvas that contains the target colors.
      // Before any part is painted (all off), fall back to the largest pane.
      let selected = images[0]
      let bestMatches = -1
      for (const entry of images) {
        const data = entry.image.data
        let matches = 0
        for (let offset = 0; offset < data.length; offset += 4) {
          if (data[offset + 3] === 0) continue
          for (const target of Object.values(targets)) {
            if (
              Math.abs(data[offset] - target[0]) <= 2 &&
              Math.abs(data[offset + 1] - target[1]) <= 2 &&
              Math.abs(data[offset + 2] - target[2]) <= 2
            ) {
              matches += 1
              break
            }
          }
        }
        if (matches > bestMatches) {
          bestMatches = matches
          selected = entry
        }
      }
      if (bestMatches <= 0) {
        selected = images.reduce((largest, entry) =>
          entry.canvas.width * entry.canvas.height >
          largest.canvas.width * largest.canvas.height
            ? entry
            : largest,
        )
      }
      if (!selected) throw new Error('no canvas')
      const { canvas, image } = selected
      const data = image.data
      const width = canvas.width
      const height = canvas.height

      const backgroundOffset = (5 * width + 5) * 4
      const backgroundPixel = [
        data[backgroundOffset],
        data[backgroundOffset + 1],
        data[backgroundOffset + 2],
        data[backgroundOffset + 3],
      ]

      // The pane canvas is usually transparent and the theme background is a
      // separate layer, so a partial-alpha fill keeps the exact RGB and stores
      // alpha on the pixel. If a future theme paints the background onto the
      // same canvas, the expected value is the sRGB composite instead.
      const expected = {} as Record<keyof PixelSpec, number[]>
      const expectedAlpha = {} as Record<keyof PixelSpec, number>
      const counts = {} as Record<keyof PixelSpec, number>
      for (const [key, target] of Object.entries(targets) as Array<
        [keyof PixelSpec, number[]]
      >) {
        const { alpha } = pixelSpec[key]
        expected[key] =
          alpha >= 1 || backgroundPixel[3] === 0
            ? target
            : target.map((channel, index) =>
                Math.round(channel * alpha + backgroundPixel[index] * (1 - alpha)),
              )
        expectedAlpha[key] =
          alpha <= 0 ? 0 : backgroundPixel[3] > 0 ? 255 : Math.round(alpha * 255)
        counts[key] = 0
      }

      const matches = (offset: number, target: number[], targetAlpha: number) =>
        targetAlpha > 0 &&
        Math.abs(data[offset] - target[0]) <= 2 &&
        Math.abs(data[offset + 1] - target[1]) <= 2 &&
        Math.abs(data[offset + 2] - target[2]) <= 2 &&
        Math.abs(data[offset + 3] - targetAlpha) <= 2

      for (let offset = 0; offset < data.length; offset += 4) {
        for (const key of Object.keys(expected) as Array<keyof PixelSpec>) {
          if (matches(offset, expected[key], expectedAlpha[key])) counts[key] += 1
        }
      }

      let body: PixelProbe['body'] = null
      let bodyPixel: number[] | null = null
      const bodyTarget = expected.bodyRising
      const bodyAlpha = expectedAlpha.bodyRising
      if (bodyAlpha > 0) {
        const columns = new Array<number>(width).fill(0)
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            if (matches((y * width + x) * 4, bodyTarget, bodyAlpha)) columns[x] += 1
          }
        }
        let centerX = -1
        for (let x = 0; x < width; x += 1) {
          if (columns[x] > 3 && (centerX === -1 || columns[x] > columns[centerX])) centerX = x
        }
        if (centerX >= 0) {
          let bestTop = -1
          let bestBottom = -1
          let runStart = -1
          for (let y = 0; y <= height; y += 1) {
            const inside = y < height && matches((y * width + centerX) * 4, bodyTarget, bodyAlpha)
            if (inside && runStart === -1) runStart = y
            if (!inside && runStart !== -1) {
              if (bestTop === -1 || y - runStart > bestBottom - bestTop) {
                bestTop = runStart
                bestBottom = y - 1
              }
              runStart = -1
            }
          }
          if (bestTop >= 0) {
            const centerY = Math.round((bestTop + bestBottom) / 2)
            let left = centerX
            let right = centerX
            while (left > 0 && matches((centerY * width + left - 1) * 4, bodyTarget, bodyAlpha)) left -= 1
            while (right < width - 1 && matches((centerY * width + right + 1) * 4, bodyTarget, bodyAlpha)) {
              right += 1
            }
            let top = bestTop
            let bottom = bestBottom
            while (top > 0 && matches(((top - 1) * width + centerX) * 4, bodyTarget, bodyAlpha)) top -= 1
            while (
              bottom < height - 1 &&
              matches(((bottom + 1) * width + centerX) * 4, bodyTarget, bodyAlpha)
            ) {
              bottom += 1
            }

            const borderTarget = expected.borderRising
            const borderAlpha = expectedAlpha.borderRising
            const borderRun = (startX: number, step: -1 | 1) => {
              let run = 0
              let x = startX
              while (
                x >= 0 &&
                x < width &&
                matches((centerY * width + x) * 4, borderTarget, borderAlpha)
              ) {
                run += 1
                x += step
              }
              return run
            }
            const verticalBorderRun = (startY: number, step: -1 | 1) => {
              let run = 0
              let y = startY
              while (
                y >= 0 &&
                y < height &&
                matches((y * width + centerX) * 4, borderTarget, borderAlpha)
              ) {
                run += 1
                y += step
              }
              return run
            }

            const offset = (centerY * width + centerX) * 4
            bodyPixel = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]]
            body = {
              centerX,
              centerY,
              left,
              right,
              top,
              bottom,
              leftBorderRun: pixelSpec.borderRising.alpha > 0 ? borderRun(left - 1, -1) : 0,
              rightBorderRun: pixelSpec.borderRising.alpha > 0 ? borderRun(right + 1, 1) : 0,
              topBorderRun: pixelSpec.borderRising.alpha > 0 ? verticalBorderRun(top - 1, -1) : 0,
              bottomBorderRun:
                pixelSpec.borderRising.alpha > 0 ? verticalBorderRun(bottom + 1, 1) : 0,
            }
          }
        }
      }

      return {
        dpr: window.devicePixelRatio,
        counts,
        body,
        bodyPixel,
        backgroundPixel,
      }
    },
    { id: panelId, pixelSpec: spec },
  )
}

function pixelSpecFromRecord(value: CandleRecord): PixelSpec {
  return {
    bodyRising: {
      hex: value.body.rising,
      alpha: value.body.visible ? value.body.opacity / 100 : 0,
    },
    bodyFalling: {
      hex: value.body.falling,
      alpha: value.body.visible ? value.body.opacity / 100 : 0,
    },
    borderRising: {
      hex: value.border.rising,
      alpha: value.border.visible ? value.border.opacity / 100 : 0,
    },
    borderFalling: {
      hex: value.border.falling,
      alpha: value.border.visible ? value.border.opacity / 100 : 0,
    },
    wickRising: {
      hex: value.wick.rising,
      alpha: value.wick.visible ? value.wick.opacity / 100 : 0,
    },
    wickFalling: {
      hex: value.wick.falling,
      alpha: value.wick.visible ? value.wick.opacity / 100 : 0,
    },
  }
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

/** The time-axis strip is unaffected by candle appearance; a viewport reset changes it. */
async function timeAxisScreenshot(page: Page, panelId: string): Promise<Buffer> {
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

test.describe('candle part appearance (#274)', () => {
  test('legacy pair renders unchanged and load/open/cancel never rewrite storage', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await seedWorkspace(
      page,
      {
        activeWorkspaceId: 'ws-main',
        workspaces: [{ id: 'ws-main', panelIds: [PANEL_BINANCE, PANEL_HYPERLIQUID] }],
        exchanges: { [PANEL_BINANCE]: 'binance', [PANEL_HYPERLIQUID]: 'hyperliquid' },
      },
      { rising: '#2563EB', falling: '#0A0B0C' },
    )
    await mockMarket(page, [])
    await page.goto('/')
    await waitForChart(page, PANEL_BINANCE)
    await waitForChart(page, PANEL_HYPERLIQUID)

    const legacyRaw = await readStoredCandleColorsRaw(page)
    expect(legacyRaw).toBe(JSON.stringify({ rising: '#2563EB', falling: '#0A0B0C' }))

    // A legacy custom pair seeds all three parts and keeps the old native options.
    const legacy = legacyOptions('#2563EB', '#0A0B0C')
    await expectAppliedOptions(page, PANEL_BINANCE, legacy)
    await expectAppliedOptions(page, PANEL_HYPERLIQUID, legacy)
    expect(await readStoredCandleColorsRaw(page)).toBe(legacyRaw)

    // The legacy custom pair really paints both directions, body and wick; the
    // hidden border paints nothing. Colors are identical across parts by design.
    const legacyRecord = record({
      body: { rising: '#2563EB', falling: '#0A0B0C' },
      border: { rising: '#2563EB', falling: '#0A0B0C' },
      wick: { rising: '#2563EB', falling: '#0A0B0C' },
    })
    await settleChart(page)
    const legacyProbe = await probeCandleCanvas(
      page,
      PANEL_BINANCE,
      pixelSpecFromRecord(legacyRecord),
    )
    expect(legacyProbe.counts.bodyRising).toBeGreaterThan(200)
    expect(legacyProbe.counts.bodyFalling).toBeGreaterThan(200)
    expect(legacyProbe.counts.wickRising).toBeGreaterThan(50)
    expect(legacyProbe.counts.borderRising).toBe(0)
    expect(legacyProbe.bodyPixel?.slice(0, 3)).toEqual([0x25, 0x63, 0xeb])

    // Opening the dialog neither rewrites storage nor changes the rendered view.
    let dialog = await openCandleColorsDialog(page)
    await expect(dialog.locator('#candle-part-body-visible')).toBeChecked()
    await expect(dialog.locator('#candle-part-border-visible')).not.toBeChecked()
    await expect(dialog.locator('#candle-part-wick-visible')).toBeChecked()
    await expect(dialog.getByRole('slider')).toHaveCount(3)
    for (const part of ['Body', 'Borders', 'Wick'] as const) {
      await expect(dialog.getByRole('slider', { name: `${part} opacity` })).toHaveAttribute(
        'aria-valuenow',
        '100',
      )
    }
    await expect(dialog.locator('#candle-part-body-rising')).toBeVisible()
    await expect(dialog.locator('#candle-part-body-falling')).toBeVisible()
    await expect(dialog.locator('#candle-part-border-rising')).toBeVisible()
    await expect(dialog.locator('#candle-part-border-falling')).toBeVisible()
    await expect(dialog.locator('#candle-part-wick-rising')).toBeVisible()
    await expect(dialog.locator('#candle-part-wick-falling')).toBeVisible()

    // The legacy pair is the selected swatch on a hidden Border part too.
    await page.locator('#candle-part-border-rising').click()
    await expect(colorPopover(page)).toBeVisible()
    await expect(
      colorPopover(page).getByRole('gridcell', { name: 'Blue base' }),
    ).toHaveAttribute('aria-selected', 'true')
    // Esc inside the nested picker closes only the picker.
    await page.keyboard.press('Escape')
    await expect(colorPopover(page)).toHaveCount(0)
    await expect(dialog).toBeVisible()

    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(appearanceTrigger(page)).toBeFocused()
    expect(await readStoredCandleColorsRaw(page)).toBe(legacyRaw)
    await expectAppliedOptions(page, PANEL_BINANCE, legacy)

    // X closes and discards.
    dialog = await openCandleColorsDialog(page)
    await choosePaletteColor(page, 'candle-part-body-rising', 'Red base')
    await dialog.getByRole('button', { name: 'Close' }).click()
    await expect(dialog).toHaveCount(0)
    expect(await readStoredCandleColorsRaw(page)).toBe(legacyRaw)

    // Esc closes and discards.
    dialog = await openCandleColorsDialog(page)
    await choosePaletteColor(page, 'candle-part-body-rising', 'Red base')
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    expect(await readStoredCandleColorsRaw(page)).toBe(legacyRaw)

    // Outside click closes and discards.
    dialog = await openCandleColorsDialog(page)
    await choosePaletteColor(page, 'candle-part-body-rising', 'Red base')
    await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 20, y: 20 } })
    await expect(dialog).toHaveCount(0)
    expect(await readStoredCandleColorsRaw(page)).toBe(legacyRaw)

    // Reset edits only the draft; Cancel then leaves chart and storage untouched.
    dialog = await openCandleColorsDialog(page)
    await dialog.getByRole('button', { name: 'Reset' }).click()
    await expect(dialog.locator('#candle-part-body-visible')).toBeChecked()
    await expect(dialog.locator('#candle-part-border-visible')).not.toBeChecked()
    await expect(dialog.locator('#candle-part-wick-visible')).toBeChecked()
    for (const part of ['Body', 'Borders', 'Wick'] as const) {
      await expect(dialog.getByRole('slider', { name: `${part} opacity` })).toHaveAttribute(
        'aria-valuenow',
        '100',
      )
    }
    await page.locator('#candle-part-body-rising').click()
    await expect(
      colorPopover(page).getByRole('gridcell', { name: 'Gray 2' }),
    ).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.press('Escape')
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    expect(await readStoredCandleColorsRaw(page)).toBe(legacyRaw)
    await expectAppliedOptions(page, PANEL_BINANCE, legacy)

    // A no-op Save rewrites the record shape but not one rendered option: the
    // legacy pair is carried into all three parts instead of resetting defaults.
    dialog = await openCandleColorsDialog(page)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    expect(await readStoredCandleColors(page)).toEqual(legacyRecord)
    await expectAppliedOptions(page, PANEL_BINANCE, legacy)
    await expectAppliedOptions(page, PANEL_HYPERLIQUID, legacy)

    // Reset + Save commits the same default view/style in the new whole record.
    dialog = await openCandleColorsDialog(page)
    await dialog.getByRole('button', { name: 'Reset' }).click()
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)
    expect(await readStoredCandleColors(page)).toEqual(DEFAULT_RECORD)
    await expectAppliedOptions(page, PANEL_BINANCE, defaultOptions())
    await expectAppliedOptions(page, PANEL_HYPERLIQUID, defaultOptions())

    await page.reload()
    await waitForChart(page, PANEL_BINANCE)
    await expectAppliedOptions(page, PANEL_BINANCE, defaultOptions())
    expect(await readStoredCandleColors(page)).toEqual(DEFAULT_RECORD)
  })

  test('six colors paint with a native 1px border and survive panels, reload, themes and new panels', async ({
    page,
  }) => {
    test.setTimeout(180_000)
    const marketRequests: string[] = []
    await seedWorkspace(page, {
      activeWorkspaceId: 'ws-1',
      workspaces: [
        { id: 'ws-1', panelIds: [PANEL_BINANCE, PANEL_HYPERLIQUID] },
        { id: 'ws-2', panelIds: [PANEL_WORKSPACE_2] },
      ],
      exchanges: {
        [PANEL_BINANCE]: 'binance',
        [PANEL_HYPERLIQUID]: 'hyperliquid',
        [PANEL_WORKSPACE_2]: 'hyperliquid',
      },
    })
    await mockMarket(page, marketRequests)
    await page.goto('/')
    await waitForChart(page, PANEL_BINANCE)
    await waitForChart(page, PANEL_HYPERLIQUID)
    await expectAppliedOptions(page, PANEL_BINANCE, defaultOptions())

    await page.waitForTimeout(1_000)
    const tagsBefore = await tagChartCanvases(page)
    expect(tagsBefore.length).toBeGreaterThan(0)

    // Zoom so a recreated chart or reset viewport is observable in the time axis.
    const binanceBox = await chart(page, PANEL_BINANCE).boundingBox()
    if (!binanceBox) throw new Error('chart has no bounding box')
    await page.mouse.move(
      binanceBox.x + binanceBox.width / 2,
      binanceBox.y + binanceBox.height / 2,
    )
    await page.mouse.wheel(0, -320)
    await page.waitForTimeout(500)
    const axisBeforeSave = await timeAxisScreenshot(page, PANEL_BINANCE)
    const requestsBeforeSave = marketRequests.length

    const dialog = await openCandleColorsDialog(page)
    await choosePaletteColor(page, 'candle-part-body-rising', 'Red base')
    await choosePaletteColor(page, 'candle-part-body-falling', 'Cyan vibrant')
    await choosePaletteColor(page, 'candle-part-border-rising', 'Green base')
    await choosePaletteColor(page, 'candle-part-border-falling', 'Violet base')
    await choosePaletteColor(page, 'candle-part-wick-rising', 'Blue base')
    await chooseCustomColor(page, 'candle-part-wick-falling', '#ff8a3d')
    await togglePart(dialog, 'border', true)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    const saved: CandleRecord = {
      body: { visible: true, rising: PALETTE.bodyRising, falling: PALETTE.bodyFalling, opacity: 100 },
      border: {
        visible: true,
        rising: PALETTE.borderRising,
        falling: PALETTE.borderFalling,
        opacity: 100,
      },
      wick: { visible: true, rising: PALETTE.wickRising, falling: PALETTE.wickFalling, opacity: 100 },
    }
    expect(await readStoredCandleColors(page)).toEqual(saved)
    // The legacy top-level pair mirrors Body and no native option name is persisted.
    const storedRaw = JSON.parse((await readStoredCandleColorsRaw(page)) ?? '{}') as Record<
      string,
      unknown
    >
    expect(Object.keys(storedRaw)).toEqual(['rising', 'falling', 'body', 'border', 'wick'])
    expect(storedRaw.rising).toBe(PALETTE.bodyRising)
    expect(storedRaw.falling).toBe(PALETTE.bodyFalling)

    const savedOptions = {
      bodyRising: PALETTE.bodyRising,
      bodyFalling: PALETTE.bodyFalling,
      wickRising: PALETTE.wickRising,
      wickFalling: PALETTE.wickFalling,
      borderRising: PALETTE.borderRising,
      borderFalling: PALETTE.borderFalling,
      borderVisible: 'true',
      wickVisible: 'true',
    }
    await expectAppliedOptions(page, PANEL_BINANCE, savedOptions)
    await expectAppliedOptions(page, PANEL_HYPERLIQUID, savedOptions)

    // Save is an in-place series update: no history refetch, no canvas replacement,
    // and the zoomed viewport stays.
    await page.waitForTimeout(600)
    expect(marketRequests.length).toBe(requestsBeforeSave)
    await expect(page.locator('[data-e2e-canvas]')).toHaveCount(tagsBefore.length)
    expect((await readChartCanvasTags(page)).sort()).toEqual([...tagsBefore].sort())
    expect((await timeAxisScreenshot(page, PANEL_BINANCE)).equals(axisBeforeSave)).toBe(true)

    // Actual pixels: all six colors, both directions, and a native 1px border.
    await settleChart(page)
    const probe = await probeCandleCanvas(page, PANEL_BINANCE, pixelSpecFromRecord(saved))
    expect(probe.dpr).toBe(1)
    expect(probe.counts.bodyRising).toBeGreaterThan(200)
    expect(probe.counts.bodyFalling).toBeGreaterThan(200)
    expect(probe.counts.borderRising).toBeGreaterThan(100)
    expect(probe.counts.borderFalling).toBeGreaterThan(100)
    expect(probe.counts.wickRising).toBeGreaterThan(50)
    expect(probe.counts.wickFalling).toBeGreaterThan(50)
    expect(probe.body).not.toBeNull()
    expect(probe.body?.leftBorderRun).toBe(1)
    expect(probe.body?.rightBorderRun).toBe(1)
    expect(probe.body?.topBorderRun).toBe(1)
    expect(probe.body?.bottomBorderRun).toBe(1)
    expect(probe.bodyPixel?.slice(0, 3)).toEqual([0xd1, 0x5f, 0x5b])
    expect(probe.bodyPixel?.[3]).toBe(255)

    // Reload restores all six colors and both directions on both exchanges.
    await page.reload()
    await waitForChart(page, PANEL_BINANCE)
    await waitForChart(page, PANEL_HYPERLIQUID)
    await expectAppliedOptions(page, PANEL_BINANCE, savedOptions)
    await expectAppliedOptions(page, PANEL_HYPERLIQUID, savedOptions)
    expect(await readStoredCandleColors(page)).toEqual(saved)

    // Themes never rewrite or reset the preference.
    for (const theme of ['Black', 'Cream']) {
      await page.getByRole('button', { name: 'Tema seç' }).click()
      await page.getByRole('menuitemradio', { name: theme }).click()
      await expectAppliedOptions(page, PANEL_BINANCE, savedOptions)
      expect(await readStoredCandleColors(page)).toEqual(saved)
    }

    // Another workspace and a newly added panel use the same global preference.
    await page.getByRole('button', { name: 'Workspace 2', exact: true }).click()
    await waitForChart(page, PANEL_WORKSPACE_2)
    await expectAppliedOptions(page, PANEL_WORKSPACE_2, savedOptions)
    await page.getByRole('button', { name: 'Widget ekle' }).click()
    await page.getByRole('menuitem', { name: 'BTC Perp' }).click()
    await expect(page.getByTestId('btc-perp-chart')).toHaveCount(2)
    const newChart = page.getByTestId('btc-perp-chart').nth(1)
    await expect(newChart).toHaveAttribute('aria-hidden', 'false', { timeout: 60_000 })
    await expect(newChart).toHaveAttribute('data-candle-rising-color', PALETTE.bodyRising)
    await expect(newChart).toHaveAttribute('data-candle-rising-wick-color', PALETTE.wickRising)
    await expect(newChart).toHaveAttribute('data-candle-rising-border-color', PALETTE.borderRising)
    await expect(newChart).toHaveAttribute('data-candle-border-visible', 'true')

    await page.getByRole('button', { name: 'Workspace 1', exact: true }).click()
    await waitForChart(page, PANEL_BINANCE)
    await expectAppliedOptions(page, PANEL_BINANCE, savedOptions)
  })

  test('opacity and visibility are independent, notify another tab and survive all-off/re-enable', async ({
    context,
    page,
  }) => {
    test.setTimeout(180_000)
    const marketRequests: string[] = []
    await seedWorkspace(
      page,
      {
        activeWorkspaceId: 'ws-opacity',
        workspaces: [{ id: 'ws-opacity', panelIds: [PANEL_BINANCE] }],
        exchanges: { [PANEL_BINANCE]: 'binance' },
      },
      { rising: '#DBDBDB', falling: '#808080' },
    )
    await mockMarket(page, marketRequests)
    await page.goto('/')
    await waitForChart(page, PANEL_BINANCE)
    await expectAppliedOptions(page, PANEL_BINANCE, defaultOptions())

    // A second tab shares the same localStorage and the same global preference.
    const secondPage = await context.newPage()
    await secondPage.goto('/')
    await waitForChart(secondPage, PANEL_BINANCE)
    await expectAppliedOptions(secondPage, PANEL_BINANCE, defaultOptions())

    await page.waitForTimeout(800)
    const tagsBefore = await tagChartCanvases(page)
    const requestsBefore = marketRequests.length
    const axisBefore = await timeAxisScreenshot(page, PANEL_BINANCE)

    // Opacity-only change: the legacy direction colors are untouched.
    let dialog = await openCandleColorsDialog(page)
    await setPartOpacity(page, dialog, 'Body', 60)
    await dialog.getByRole('button', { name: 'Save' }).click()
    await expect(dialog).toHaveCount(0)

    const body60 = record({ body: { opacity: 60 } })
    expect(await readStoredCandleColors(page)).toEqual(body60)
    await expectAppliedOptions(page, PANEL_BINANCE, {
      ...defaultOptions(),
      bodyRising: rgba('#DBDBDB', 60),
      bodyFalling: rgba('#808080', 60),
    })
    // Cross-tab storage event adopts the opacity-only change.
    await expect(chart(secondPage, PANEL_BINANCE)).toHaveAttribute(
      'data-candle-rising-color',
      rgba('#DBDBDB', 60),
    )
    await expect(chart(secondPage, PANEL_BINANCE)).toHaveAttribute(
      'data-candle-wick-visible',
      'true',
    )
    expect(await readStoredCandleColors(secondPage)).toEqual(body60)

    await settleChart(page)
    const body60Probe = await probeCandleCanvas(page, PANEL_BINANCE, pixelSpecFromRecord(body60))
    expect(body60Probe.counts.bodyRising).toBeGreaterThan(200)
    expect(body60Probe.counts.bodyFalling).toBeGreaterThan(200)
    expect(body60Probe.counts.wickRising).toBeGreaterThan(50)
    expect(body60Probe.counts.borderRising).toBe(0)
    // The body keeps its color and is composited at 60% alpha. The canvas stores
    // premultiplied pixels, so an unpremultiplied read can lose 1 channel step.
    const body60Rgb = body60Probe.bodyPixel?.slice(0, 3) ?? []
    for (const [index, channel] of [0xdb, 0xdb, 0xdb].entries()) {
      expect(Math.abs((body60Rgb[index] ?? 0) - channel)).toBeLessThanOrEqual(2)
    }
    expect(body60Probe.bodyPixel?.[3]).toBeGreaterThanOrEqual(151)
    expect(body60Probe.bodyPixel?.[3]).toBeLessThanOrEqual(155)

    // 0% on a visible part keeps the color and the opacity control but paints nothing.
    dialog = await openCandleColorsDialog(page)
    await setPartOpacity(page, dialog, 'Body', 0)
    await dialog.getByRole('button', { name: 'Save' }).click()
    const body0 = record({ body: { opacity: 0 } })
    expect(await readStoredCandleColors(page)).toEqual(body0)
    await expect(chart(page, PANEL_BINANCE)).toHaveAttribute(
      'data-candle-rising-color',
      'rgba(219, 219, 219, 0)',
    )
    const body0Probe = await probeCandleCanvas(page, PANEL_BINANCE, pixelSpecFromRecord(body0))
    expect(body0Probe.counts.bodyRising).toBe(0)
    expect(body0Probe.counts.bodyFalling).toBe(0)
    expect(body0Probe.counts.wickRising).toBeGreaterThan(50)
    expect(body0.body.rising).toBe('#DBDBDB')

    // Restore Body opacity, hide Wick, show native Borders: each part is independent.
    dialog = await openCandleColorsDialog(page)
    await setPartOpacity(page, dialog, 'Body', 60)
    await togglePart(dialog, 'border', true)
    await togglePart(dialog, 'wick', false)
    await dialog.getByRole('button', { name: 'Save' }).click()
    const bordersOn = record({
      body: { opacity: 60 },
      border: { visible: true },
      wick: { visible: false },
    })
    expect(await readStoredCandleColors(page)).toEqual(bordersOn)
    await expectAppliedOptions(page, PANEL_BINANCE, {
      ...defaultOptions(),
      bodyRising: rgba('#DBDBDB', 60),
      bodyFalling: rgba('#808080', 60),
      borderVisible: 'true',
      wickVisible: 'false',
    })
    await settleChart(page)
    const bordersProbe = await probeCandleCanvas(
      page,
      PANEL_BINANCE,
      pixelSpecFromRecord(bordersOn),
    )
    expect(bordersProbe.counts.borderRising).toBeGreaterThan(100)
    expect(bordersProbe.counts.borderFalling).toBeGreaterThan(100)
    expect(bordersProbe.counts.wickRising).toBe(0)
    expect(bordersProbe.counts.wickFalling).toBe(0)
    expect(bordersProbe.counts.bodyRising).toBeGreaterThan(200)
    expect(bordersProbe.body?.leftBorderRun).toBe(1)
    expect(bordersProbe.body?.rightBorderRun).toBe(1)
    // The colors and opacity of the hidden wick stay chosen in storage.
    const storedBordersOn = (await readStoredCandleColors(page)) as CandleRecord
    expect(storedBordersOn.wick).toEqual(record({ wick: { visible: false } }).wick)

    // All three parts off: no candle pixels, but data/autoscale/indicators stay mounted.
    dialog = await openCandleColorsDialog(page)
    await togglePart(dialog, 'body', false)
    await togglePart(dialog, 'border', false)
    await togglePart(dialog, 'wick', false)
    await dialog.getByRole('button', { name: 'Save' }).click()
    const allOff = record({
      body: { visible: false, opacity: 60 },
      border: { visible: false },
      wick: { visible: false },
    })
    expect(await readStoredCandleColors(page)).toEqual(allOff)
    await expectAppliedOptions(page, PANEL_BINANCE, {
      ...defaultOptions(),
      bodyRising: 'rgba(219, 219, 219, 0)',
      bodyFalling: 'rgba(128, 128, 128, 0)',
      borderVisible: 'false',
      wickVisible: 'false',
    })
    await settleChart(page)
    const allOffProbe = await probeCandleCanvas(page, PANEL_BINANCE, pixelSpecFromRecord(allOff))
    for (const count of Object.values(allOffProbe.counts)) expect(count).toBe(0)
    expect(allOff.body.rising).toBe('#DBDBDB')
    expect(allOff.body.opacity).toBe(60)

    // No REST request, canvas replacement or viewport reset from any appearance edit.
    await page.waitForTimeout(600)
    expect(marketRequests.length).toBe(requestsBefore)
    expect((await readChartCanvasTags(page)).sort()).toEqual([...tagsBefore].sort())
    expect((await timeAxisScreenshot(page, PANEL_BINANCE)).equals(axisBefore)).toBe(true)

    // Re-enable everything: chosen colors and the 60% Body opacity return.
    dialog = await openCandleColorsDialog(page)
    await togglePart(dialog, 'body', true)
    await togglePart(dialog, 'border', true)
    await togglePart(dialog, 'wick', true)
    await dialog.getByRole('button', { name: 'Save' }).click()
    const allOn = record({ body: { opacity: 60 }, border: { visible: true } })
    expect(await readStoredCandleColors(page)).toEqual(allOn)
    await expectAppliedOptions(page, PANEL_BINANCE, {
      ...defaultOptions(),
      bodyRising: rgba('#DBDBDB', 60),
      bodyFalling: rgba('#808080', 60),
      borderVisible: 'true',
      wickVisible: 'true',
    })
    await settleChart(page)
    const restoredProbe = await probeCandleCanvas(
      page,
      PANEL_BINANCE,
      pixelSpecFromRecord(allOn),
    )
    expect(restoredProbe.counts.bodyRising).toBeGreaterThan(200)
    expect(restoredProbe.counts.borderRising).toBeGreaterThan(100)
    expect(restoredProbe.counts.wickRising).toBeGreaterThan(50)

    // Reload keeps the whole record, including the 60% Body opacity.
    await page.reload()
    await waitForChart(page, PANEL_BINANCE)
    expect(await readStoredCandleColors(page)).toEqual(allOn)
    await expectAppliedOptions(page, PANEL_BINANCE, {
      ...defaultOptions(),
      bodyRising: rgba('#DBDBDB', 60),
      bodyFalling: rgba('#808080', 60),
      borderVisible: 'true',
      wickVisible: 'true',
    })
    await secondPage.close()
  })

  test('an outside press cannot click through to an armed drawing tool', async ({ page }) => {
    test.setTimeout(120_000)
    await seedWorkspace(page, {
      activeWorkspaceId: 'ws-clickthrough',
      workspaces: [{ id: 'ws-clickthrough', panelIds: [PANEL_BINANCE], panelHeight: 40 }],
      exchanges: { [PANEL_BINANCE]: 'binance' },
    })
    await mockMarket(page, [])
    await page.goto('/')
    await waitForChart(page, PANEL_BINANCE)

    // Arm a rectangle, then dismiss the Appearance dialog on the transparent overlay
    // over the chart. The press must never reach the candle pane and create geometry.
    await page.locator(`#${PANEL_BINANCE}-tools`).click()
    await page.getByRole('menuitem', { name: 'Rectangle / Box' }).click()
    const dialog = await openCandleColorsDialog(page)
    await page.mouse.move(100, 350)
    await page.mouse.down()
    await page.mouse.move(260, 430, { steps: 8 })
    await page.mouse.up()
    await expect(dialog).toHaveCount(0)

    const rectangles = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      RECTANGLE_STORAGE_KEY,
    )
    expect(rectangles).toBeNull()
  })

  test('the Appearance control and the new dialog stay reachable at a narrow viewport', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 800 })
    await page.addInitScript(() => {
      window.localStorage.setItem(
        '0xdeck-workspace',
        JSON.stringify({
          version: 2,
          activeWorkspaceId: 'ws-notes',
          workspaces: [
            { id: 'ws-notes', activePanels: ['notes-candle'], layout: [], gridVersion: 3 },
          ],
        }),
      )
    })
    await page.goto('/')

    const trigger = appearanceTrigger(page)
    await expect(trigger).toBeVisible()
    const box = await trigger.boundingBox()
    expect(box).not.toBeNull()
    expect((box?.x ?? 0) >= 0).toBe(true)
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375)
    await trigger.click()
    await expect(page.getByRole('menuitem', { name: 'Candle colors' })).toBeVisible()
    await page.getByRole('menuitem', { name: 'Candle colors' }).click()
    const dialog = page.getByRole('dialog', { name: 'Candle colors' })
    await expect(dialog).toBeVisible()
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect((dialogBox?.x ?? 0) >= 0).toBe(true)
    expect((dialogBox?.x ?? 0) + (dialogBox?.width ?? 0)).toBeLessThanOrEqual(375)
    await expect(dialog.getByRole('slider')).toHaveCount(3)
    await expect(dialog.getByRole('button', { name: 'Save' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
  })
})
