import { expect, test, type Page } from '@playwright/test'

/**
 * Focused browser acceptance for the candle-pane right-drag two-axis scaling
 * gesture (Issue #236).
 *
 * Setup mirrors `chart-ui-standards.spec.ts`: the workspace is seeded with one
 * BTC Perp panel and the app runs against the normal Vite dev server with no
 * backend. Candles come from a `page.route` stub of the Binance USD-M klines
 * REST contract; the `/api/ws/*` relay is left to fail (the widget renders the
 * stubbed klines and simply shows its reconnect label).
 *
 * Observability deliberately uses the app's existing per-widget/per-interval
 * viewport capture (`0xdeck-widget-market-chart-viewports`, written on
 * pointer-up and on visible-range changes). That capture already mirrors the
 * chart's visible logical range, visible time range, autoscale flag and manual
 * price range, so the spec needs no test-only product code and no chart
 * internals. A synthetic `pointerup` on the chart container (an existing
 * listener) forces a fresh capture for the baseline.
 *
 * The chart plot is a canvas; pane element coordinates equal chart coordinates
 * (the pane row's left/top is the plot area's left/top), which is what the
 * existing drawing tools rely on too.
 */

const WORKSPACE_KEY = '0xdeck-workspace'
const VIEWPORT_KEY = '0xdeck-widget-market-chart-viewports'
const PANEL_ID = 'btc-perpetual-chart-e2e'
const INTERVAL = '1m'
const T0 = 1700000000

type StoredRange = { from: number; to: number }

type StoredViewport = {
  version: number
  visibleLogicalRange: StoredRange
  visibleTimeRange: StoredRange
  autoScale: boolean
  priceRange: StoredRange | null
  scaleMargins: { top: number; bottom: number }
  rightOffset: number
}

function stubCandles() {
  return Array.from({ length: 300 }, (_, index) => {
    const base = 30000 + Math.sin(index / 20) * 300
    return {
      symbol: 'BTCUSDT',
      interval: '1m',
      time: T0 + index * 60,
      open: base,
      high: base + 40,
      low: base - 40,
      close: base + 10,
      volume: 10,
      closed: true,
    }
  })
}

function viewportSeed(options: {
  autoScale: boolean
  priceRange: StoredRange | null
}): StoredViewport {
  return {
    version: 2,
    visibleLogicalRange: { from: 100, to: 200 },
    visibleTimeRange: { from: T0 + 100 * 60, to: T0 + 200 * 60 },
    autoScale: options.autoScale,
    priceRange: options.priceRange,
    scaleMargins: { top: 0.1, bottom: 0.1 },
    rightOffset: 8,
  }
}

const AUTOSCALE_SEED = viewportSeed({ autoScale: true, priceRange: null })
const MANUAL_SEED = viewportSeed({
  autoScale: false,
  priceRange: { from: 29000, to: 31200 },
})

async function openBtcPerpChart(page: Page, seed: StoredViewport) {
  await page.addInitScript(
    ([workspaceKey, viewportKey, panelId, interval, viewport]) => {
      window.localStorage.setItem(
        workspaceKey,
        JSON.stringify({ activePanels: [panelId], layout: [], gridVersion: 3 }),
      )
      // Seed the viewport once per browser context: a reload must restore what
      // the app captured after the drag, not overwrite it with the seed.
      if (window.sessionStorage.getItem('oxdeck-e2e-viewport-seeded') === null) {
        window.localStorage.setItem(
          viewportKey,
          JSON.stringify({ [panelId]: { [interval]: viewport } }),
        )
        window.sessionStorage.setItem('oxdeck-e2e-viewport-seeded', '1')
      }
    },
    [WORKSPACE_KEY, VIEWPORT_KEY, PANEL_ID, INTERVAL, seed] as const,
  )
  // The dev server can proxy `/api/ws/*` to a real backend; keep the relay
  // silent so the spec always observes the deterministic REST stub and never
  // mixes in live BTC prices.
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
  // `/` resolves to the origin root, which on a path-prefixed preview would
  // load the canonical build instead of the preview artifact. Set
  // OXDECK_E2E_URL to the full target (including its trailing slash) to run
  // the committed spec against the deployed preview, e.g.
  //   OXDECK_E2E_URL=https://deck.72-61-140-74.sslip.io/previews/pr-237/ \
  //     npx playwright test e2e/right-drag-chart-scaling.spec.ts
  await page.goto(process.env.OXDECK_E2E_URL ?? '/')
  const container = page.locator('[data-testid="btc-perp-chart"]')
  await expect(container).toBeVisible()
  await expect(container).toHaveAttribute('aria-hidden', 'false')
  await expect(container.locator('canvas').first()).toBeVisible()
  // Let the one-time post-restore layout pass finish before any measurement.
  await page.waitForTimeout(1_500)
  const firstBox = await plotBox(page)
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    await page.waitForTimeout(100)
    const next = await plotBox(page)
    if (
      next.x === firstBox.x &&
      next.y === firstBox.y &&
      next.width === firstBox.width &&
      next.height === firstBox.height
    ) {
      return
    }
  }
}

const CHART_OBJECT_STORAGE_KEYS = [
  '0xdeck-widget-fixed-range-vp-instances',
  '0xdeck-widget-rectangle-instances',
  '0xdeck-widget-line-instances',
  '0xdeck-widget-anchored-vwap-instances',
] as const

/** Raw persisted chart-object payloads, keyed by their localStorage key. */
async function readChartObjectStorage(
  page: Page,
): Promise<Record<string, string | null>> {
  return page.evaluate(
    (keys) =>
      Object.fromEntries(keys.map((key) => [key, window.localStorage.getItem(key)])),
    CHART_OBJECT_STORAGE_KEYS,
  )
}

async function readStoredViewport(page: Page): Promise<StoredViewport | null> {
  return page.evaluate(
    ([viewportKey, panelId, interval]) => {
      const raw = window.localStorage.getItem(viewportKey)
      if (!raw) return null
      const parsed = JSON.parse(raw) as Record<
        string,
        Record<string, StoredViewport>
      >
      return parsed[panelId]?.[interval] ?? null
    },
    [VIEWPORT_KEY, PANEL_ID, INTERVAL] as const,
  )
}

/**
 * The chart container already persists its viewport on pointer-up; a synthetic
 * pointer-up only schedules that existing capture. Wait past its 250 ms debounce
 * before reading, then require two identical captures so a late pane/price-scale
 * layout pass cannot leave the baseline stale.
 */
async function captureOnce(page: Page): Promise<StoredViewport> {
  await page.locator('[data-testid="btc-perp-chart"]').dispatchEvent('pointerup')
  await page.waitForTimeout(400)
  const stored = await readStoredViewport(page)
  if (!stored) throw new Error('chart viewport was not captured')
  return stored
}

/**
 * Three identical captures absorb the one-time late layout pass that can nudge
 * a restored range (the price scale gains its final width after the first
 * render). Without this the baseline could describe a range the chart no longer
 * shows when the drag starts.
 */
async function settleViewport(page: Page): Promise<StoredViewport> {
  let previous: StoredViewport | null = null
  let stable = 0
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const next = await captureOnce(page)
    if (previous && JSON.stringify(next) === JSON.stringify(previous)) {
      stable += 1
      if (stable >= 2) return next
    } else {
      stable = 0
    }
    previous = next
  }
  throw new Error('chart viewport did not settle')
}

async function waitForViewport(
  page: Page,
  predicate: (viewport: StoredViewport) => boolean,
  description: string,
): Promise<StoredViewport> {
  const deadline = Date.now() + 5_000
  let previous: StoredViewport | null = null
  let last: StoredViewport | null = null
  while (Date.now() < deadline) {
    last = await readStoredViewport(page)
    if (last && predicate(last)) {
      if (previous && JSON.stringify(previous) === JSON.stringify(last)) return last
      previous = last
    } else {
      previous = null
    }
    await page.waitForTimeout(100)
  }
  throw new Error(`viewport did not update (${description}): ${JSON.stringify(last)}`)
}

async function plotBox(page: Page) {
  const canvas = page.locator('[data-testid="btc-perp-chart"] canvas').first()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('chart plot canvas has no box')
  return box
}

type DragOptions = {
  startFractionX?: number
  startFractionY?: number
  releaseOutside?: boolean
}

/** Right-button press, move by (dx, dy), release. */
async function rightDrag(
  page: Page,
  dx: number,
  dy: number,
  options: DragOptions = {},
) {
  const box = await plotBox(page)
  const startX = Math.round(box.x + box.width * (options.startFractionX ?? 0.4))
  const startY = Math.round(box.y + box.height * (options.startFractionY ?? 0.45))
  await page.mouse.move(startX, startY)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(startX + dx, startY + dy, { steps: 8 })
  if (options.releaseOutside) {
    await page.mouse.move(box.x + box.width + 220, box.y + box.height + 160, {
      steps: 4,
    })
  }
  await page.mouse.up({ button: 'right' })
  return {
    box,
    startX,
    startY,
    pressFractionX: (startX - box.x) / box.width,
    pressFractionY: (startY - box.y) / box.height,
  }
}

/** Plain right click: press and release with no movement. */
async function rightClick(page: Page) {
  const box = await plotBox(page)
  const x = box.x + box.width * 0.5
  const y = box.y + box.height * 0.5
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.up({ button: 'right' })
  return { box, x, y }
}

function span(range: StoredRange): number {
  return range.to - range.from
}

/** Fraction of the range that sits at the given pane fraction from the start. */
function fractionOfRange(range: StoredRange, fraction: number): number {
  return range.from + fraction * span(range)
}

function fractionAt(range: StoredRange, value: number): number {
  return (value - range.from) / span(range)
}

/**
 * Price at a pane-height fraction for a manual visible range. Lightweight
 * Charts maps the range to the pane height *inside* the configured
 * `scaleMargins` (`PriceScale._internal_internalHeight`), so the mapping is
 * affine but not `to - fraction * span`. The seeded viewport always uses
 * `top: 0.1, bottom: 0.1`.
 */
function priceAtPaneFraction(
  range: StoredRange,
  fractionFromTop: number,
  margins = { top: 0.1, bottom: 0.1 },
): number {
  const usable = 1 - margins.top - margins.bottom
  const rangeFraction = (fractionFromTop - margins.top) / usable
  return range.to - rangeFraction * span(range)
}

test.describe('BTC Perp candle-pane right-drag scaling (#236)', () => {
  test('drag right widens candles, keeps the time anchor and leaves price autoscale alone', async ({
    page,
  }) => {
    await openBtcPerpChart(page, AUTOSCALE_SEED)
    const baseline = await settleViewport(page)
    // The restored seed can shift by a few bars while the price scale gains its
    // final width (and when the Aggregated Liquidations pane changes height), so
    // assert the seeded band instead of exact bar indices. The gesture checks
    // below compare against this captured baseline.
    expect(Math.abs(baseline.visibleLogicalRange.from - 100)).toBeLessThan(5)
    expect(Math.abs(baseline.visibleLogicalRange.to - 200)).toBeLessThan(5)
    expect(baseline.autoScale).toBe(true)
    expect(baseline.priceRange).toBeNull()

    const { pressFractionX } = await rightDrag(page, 120, 0)
    const anchorLogical = fractionOfRange(baseline.visibleLogicalRange, pressFractionX)

    const scaled = await waitForViewport(
      page,
      (viewport) => span(viewport.visibleLogicalRange) < span(baseline.visibleLogicalRange),
      'time span shrinks',
    )
    expect(span(scaled.visibleLogicalRange)).toBeLessThan(
      span(baseline.visibleLogicalRange) * 0.8,
    )
    expect(scaled.autoScale).toBe(true)
    expect(scaled.priceRange).toBeNull()
    expect(
      Math.abs(fractionAt(scaled.visibleLogicalRange, anchorLogical) - pressFractionX),
    ).toBeLessThan(0.02)
  })

  test('drag left narrows candles, keeps the time anchor and leaves price autoscale alone', async ({
    page,
  }) => {
    await openBtcPerpChart(page, AUTOSCALE_SEED)
    const baseline = await settleViewport(page)
    const { pressFractionX } = await rightDrag(page, -120, 0)
    const anchorLogical = fractionOfRange(baseline.visibleLogicalRange, pressFractionX)

    const scaled = await waitForViewport(
      page,
      (viewport) => span(viewport.visibleLogicalRange) > span(baseline.visibleLogicalRange),
      'time span grows',
    )
    expect(span(scaled.visibleLogicalRange)).toBeGreaterThan(
      span(baseline.visibleLogicalRange) * 1.2,
    )
    expect(scaled.autoScale).toBe(true)
    expect(scaled.priceRange).toBeNull()
    expect(
      Math.abs(fractionAt(scaled.visibleLogicalRange, anchorLogical) - pressFractionX),
    ).toBeLessThan(0.02)
  })

  test('drag up and drag down scale the candle price range and persist manual mode', async ({
    page,
  }) => {
    await openBtcPerpChart(page, MANUAL_SEED)
    const baseline = await settleViewport(page)
    expect(baseline.priceRange).toEqual({ from: 29000, to: 31200 })

    const { pressFractionY } = await rightDrag(page, 0, -70, {
      startFractionY: 0.65,
    })
    const anchorPrice = priceAtPaneFraction(baseline.priceRange!, pressFractionY)
    const anchorDomainFraction = fractionAt(baseline.priceRange!, anchorPrice)

    const scaledUp = await waitForViewport(
      page,
      (viewport) =>
        viewport.priceRange !== null &&
        span(viewport.priceRange) < span(baseline.priceRange!),
      'price span shrinks',
    )
    expect(scaledUp.autoScale).toBe(false)
    expect(scaledUp.visibleLogicalRange).toEqual(baseline.visibleLogicalRange)
    expect(
      Math.abs(fractionAt(scaledUp.priceRange!, anchorPrice) - anchorDomainFraction),
    ).toBeLessThan(0.02)

    await rightDrag(page, 0, 70, { startFractionY: 0.5 })
    const scaledDown = await waitForViewport(
      page,
      (viewport) =>
        viewport.priceRange !== null &&
        span(viewport.priceRange) > span(scaledUp.priceRange!),
      'price span grows back',
    )
    expect(scaledDown.autoScale).toBe(false)
    expect(scaledDown.visibleLogicalRange).toEqual(baseline.visibleLogicalRange)
  })

  test('drag up from autoscale enters manual price mode without jumping off the candles', async ({
    page,
  }) => {
    await openBtcPerpChart(page, AUTOSCALE_SEED)
    const baseline = await settleViewport(page)
    expect(baseline.autoScale).toBe(true)
    expect(baseline.priceRange).toBeNull()

    await rightDrag(page, 0, -60, { startFractionY: 0.5 })

    const scaled = await waitForViewport(
      page,
      (viewport) => viewport.autoScale === false && viewport.priceRange !== null,
      'vertical drag enters manual price range',
    )
    expect(scaled.visibleLogicalRange).toEqual(baseline.visibleLogicalRange)
    // The stubbed candles sit around 30 000; a 60 px drag must keep the manual
    // range on those candles instead of jumping to the chart center or the
    // latest bar.
    expect(span(scaled.priceRange!)).toBeGreaterThan(100)
    expect(span(scaled.priceRange!)).toBeLessThan(1_200)
    expect(scaled.priceRange!.from).toBeGreaterThan(28_000)
    expect(scaled.priceRange!.to).toBeLessThan(32_000)
  })

  test('a diagonal drag scales both axes around the pressed point', async ({ page }) => {
    await openBtcPerpChart(page, MANUAL_SEED)
    const baseline = await settleViewport(page)
    const { pressFractionX, pressFractionY } = await rightDrag(page, 100, -60, {
      startFractionX: 0.45,
      startFractionY: 0.55,
    })
    const anchorLogical = fractionOfRange(
      baseline.visibleLogicalRange,
      pressFractionX,
    )
    const anchorPrice = priceAtPaneFraction(baseline.priceRange!, pressFractionY)
    const anchorDomainFraction = fractionAt(baseline.priceRange!, anchorPrice)

    const scaled = await waitForViewport(
      page,
      (viewport) =>
        span(viewport.visibleLogicalRange) < span(baseline.visibleLogicalRange) &&
        viewport.priceRange !== null &&
        span(viewport.priceRange) < span(baseline.priceRange!),
      'both spans shrink',
    )
    expect(scaled.autoScale).toBe(false)
    expect(
      Math.abs(fractionAt(scaled.visibleLogicalRange, anchorLogical) - pressFractionX),
    ).toBeLessThan(0.02)
    expect(
      Math.abs(fractionAt(scaled.priceRange!, anchorPrice) - anchorDomainFraction),
    ).toBeLessThan(0.02)
  })

  test('a vertical drag price range survives a reload for the same interval', async ({
    page,
  }) => {
    await openBtcPerpChart(page, AUTOSCALE_SEED)
    await settleViewport(page)
    await rightDrag(page, 0, -60, { startFractionY: 0.5 })

    const scaled = await waitForViewport(
      page,
      (viewport) => viewport.autoScale === false && viewport.priceRange !== null,
      'manual price range captured',
    )

    await page.reload()
    const container = page.locator('[data-testid="btc-perp-chart"]')
    await expect(container).toBeVisible()
    await expect(container).toHaveAttribute('aria-hidden', 'false')
    await expect(container.locator('canvas').first()).toBeVisible()
    await page.waitForTimeout(1_200)

    const restored = await settleViewport(page)
    expect(restored.autoScale).toBe(false)
    expect(restored.priceRange).not.toBeNull()
    expect(restored.priceRange!.from).toBeCloseTo(scaled.priceRange!.from, 6)
    expect(restored.priceRange!.to).toBeCloseTo(scaled.priceRange!.to, 6)
    // A restore can shift by about one bar while the price scale gains its
    // final width, so bound both endpoints (same ±5-bar band as the seeded
    // baseline above) instead of asserting exact bar indices.
    expect(
      Math.abs(restored.visibleLogicalRange.from - scaled.visibleLogicalRange.from),
    ).toBeLessThan(5)
    expect(
      Math.abs(restored.visibleLogicalRange.to - scaled.visibleLogicalRange.to),
    ).toBeLessThan(5)
  })

  test('armed Fixed Range Volume Profile blocks right-drag scaling through the panel wiring', async ({
    page,
  }) => {
    await openBtcPerpChart(page, MANUAL_SEED)
    const baseline = await settleViewport(page)
    const storageBefore = await readChartObjectStorage(page)
    expect(storageBefore).toEqual({
      '0xdeck-widget-fixed-range-vp-instances': null,
      '0xdeck-widget-rectangle-instances': null,
      '0xdeck-widget-line-instances': null,
      '0xdeck-widget-anchored-vwap-instances': null,
    })

    const tools = page.getByRole('button', { name: 'Tools' })
    await expect(tools).toBeEnabled()
    await tools.click()
    await page.getByRole('menuitem', { name: 'Fixed Range Volume Profile' }).click()
    await expect(page.getByRole('menu')).toHaveCount(0)

    // Positive control: the armed tool really locks chart navigation, so a
    // left drag cannot pan. (Its pointer-up also starts the tool's preview.)
    const box = await plotBox(page)
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(box.x + box.width * 0.5 + 80, box.y + box.height * 0.5, {
      steps: 8,
    })
    await page.mouse.up({ button: 'left' })
    await page.waitForTimeout(500)
    expect((await captureOnce(page)).visibleLogicalRange).toEqual(
      baseline.visibleLogicalRange,
    )

    // Re-arm so the gesture below runs in the `armed` phase itself (the phase
    // a `preview || resizing` regression would not cover).
    await tools.click()
    await page.getByRole('menuitem', { name: 'Fixed Range Volume Profile' }).click()
    await expect(page.getByRole('menu')).toHaveCount(0)

    await rightDrag(page, 120, 0)

    const blocked = await captureOnce(page)
    expect(blocked.visibleLogicalRange).toEqual(baseline.visibleLogicalRange)
    expect(blocked.visibleTimeRange).toEqual(baseline.visibleTimeRange)
    expect(blocked.priceRange).toEqual(baseline.priceRange)
    expect(blocked.autoScale).toBe(false)
    expect(await readChartObjectStorage(page)).toEqual(storageBefore)
    expect(await page.getByRole('dialog').count()).toBe(0)

    // Disarm: the same right drag now scales, so the block is conditional.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
    await rightDrag(page, 120, 0)
    const scaled = await waitForViewport(
      page,
      (viewport) =>
        span(viewport.visibleLogicalRange) < span(baseline.visibleLogicalRange),
      'right drag scales after disarming the profile tool',
    )
    expect(span(scaled.visibleLogicalRange)).toBeLessThan(
      span(baseline.visibleLogicalRange) * 0.8,
    )
    expect(scaled.priceRange).toEqual(baseline.priceRange)
    expect(await readChartObjectStorage(page)).toEqual(storageBefore)
  })

  test('a plain right click changes no range and creates no chart object', async ({
    page,
  }) => {
    await openBtcPerpChart(page, MANUAL_SEED)
    const baseline = await settleViewport(page)

    await rightClick(page)
    await page.waitForTimeout(500)

    const afterClick = await readStoredViewport(page)
    expect(afterClick).not.toBeNull()
    expect(afterClick!.visibleLogicalRange).toEqual(baseline.visibleLogicalRange)
    expect(afterClick!.visibleTimeRange).toEqual(baseline.visibleTimeRange)
    expect(afterClick!.priceRange).toEqual(baseline.priceRange)
    expect(afterClick!.autoScale).toBe(baseline.autoScale)

    expect(await page.getByRole('dialog').count()).toBe(0)
    expect(await readChartObjectStorage(page)).toEqual({
      '0xdeck-widget-fixed-range-vp-instances': null,
      '0xdeck-widget-rectangle-instances': null,
      '0xdeck-widget-line-instances': null,
      '0xdeck-widget-anchored-vwap-instances': null,
    })
  })

  test('a drag never lets the context menu interrupt it, and a left pan still works afterwards', async ({
    page,
  }) => {
    await openBtcPerpChart(page, MANUAL_SEED)
    const baseline = await settleViewport(page)
    await page.evaluate(() => {
      const events: Event[] = []
      window.__rightDragContextMenuEvents = events
      window.addEventListener(
        'contextmenu',
        (event) => {
          events.push(event)
        },
        true,
      )
    })

    await rightDrag(page, 90, -50)
    const scaled = await waitForViewport(
      page,
      (viewport) =>
        span(viewport.visibleLogicalRange) < span(baseline.visibleLogicalRange),
      'right drag applied',
    )

    const contextMenuPrevented = await page.evaluate(() =>
      (window.__rightDragContextMenuEvents ?? []).map(
        (event) => (event as Event).defaultPrevented,
      ),
    )
    expect(contextMenuPrevented.length).toBeGreaterThan(0)
    expect(contextMenuPrevented.every(Boolean)).toBe(true)

    // Hovering without buttons after the gesture must not keep scaling.
    const box = await plotBox(page)
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4, {
      steps: 4,
    })
    await page.waitForTimeout(400)
    expect((await readStoredViewport(page))!.visibleLogicalRange).toEqual(
      scaled.visibleLogicalRange,
    )

    // A normal left pan still moves the chart through the library's own pan.
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
    await page.mouse.down({ button: 'left' })
    await page.mouse.move(box.x + box.width * 0.5 + 80, box.y + box.height * 0.5, {
      steps: 8,
    })
    await page.mouse.up({ button: 'left' })

    const panned = await waitForViewport(
      page,
      (viewport) =>
        viewport.visibleLogicalRange.from !== scaled.visibleLogicalRange.from ||
        viewport.visibleLogicalRange.to !== scaled.visibleLogicalRange.to,
      'left pan moves the chart',
    )
    expect(span(panned.visibleLogicalRange)).toBeCloseTo(
      span(scaled.visibleLogicalRange),
      0,
    )
  })

  test('a drag released outside the pane ends cleanly and can be repeated', async ({
    page,
  }) => {
    await openBtcPerpChart(page, AUTOSCALE_SEED)
    const baseline = await settleViewport(page)

    await rightDrag(page, 80, 0, { releaseOutside: true })
    const first = await waitForViewport(
      page,
      (viewport) => span(viewport.visibleLogicalRange) < span(baseline.visibleLogicalRange),
      'first drag applied',
    )

    // No stuck gesture: a plain hover does not change the range any further.
    const box = await plotBox(page)
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, {
      steps: 4,
    })
    await page.waitForTimeout(400)
    expect((await readStoredViewport(page))!.visibleLogicalRange).toEqual(
      first.visibleLogicalRange,
    )

    // A second right-drag starts from the result and still works.
    await rightDrag(page, 80, 0)
    const second = await waitForViewport(
      page,
      (viewport) =>
        span(viewport.visibleLogicalRange) < span(first.visibleLogicalRange),
      'second drag applied',
    )
    expect(span(second.visibleLogicalRange)).toBeLessThan(
      span(first.visibleLogicalRange),
    )
  })
})

declare global {
  interface Window {
    __rightDragContextMenuEvents?: Event[]
  }
}
