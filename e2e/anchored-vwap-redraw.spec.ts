import { expect, test, type Page } from '@playwright/test'

/**
 * Real installed-lightweight-charts (5.2.x) counter coverage for the Anchored
 * VWAP band-fill primitive scheduling (#258).
 *
 * The harness imports the production modules and the same `lightweight-charts`
 * package the app installs. It counts:
 * - `requestUpdate()` callbacks received by the primitive's `attached()`;
 * - library-driven `updateAllViews()` calls;
 * - coordinate conversions and real canvas fill paths, per frame;
 * - animation frames and canvas clears.
 *
 * No wall-clock budgets are asserted: idle checks are counters over a fixed
 * window (the #252 fixture pattern), never a millisecond threshold.
 */

type Point = { x: number; y: number }
type ExpectedRun = { upper: Point[]; lower: Point[] }
type FillRecord = { fillStyle: string; points: number[]; frame: number }
type Stats = {
  requestUpdates: number
  viewUpdates: number
  attachCalls: number
  timeConversions: number
  priceConversions: number
  rafCallbacks: number
  clears: number
  fills: FillRecord[]
  lastFrameFills: FillRecord[]
  pixelRatio: number
  barSpacing: number
  logicalRange: { from: number; to: number } | null
  visibleRange: { from: unknown; to: unknown } | null
  toolCount: number
}

const FILL_24 = 'rgba(163, 163, 163, 0.24)'
const FILL_48 = 'rgba(163, 163, 163, 0.48)'
const PAIRS = 3

async function openHarness(page: Page): Promise<void> {
  await page.goto('/e2e/fixtures/anchored-vwap-redraw.html')
  await expect.poll(() => page.evaluate(() => typeof window.__anchoredRedrawHarness)).toBe('object')
}

async function createChart(
  page: Page,
  options: {
    bars: number
    visibleBars: number
    fillOpacity: number
    toolCount?: number
    bandCount?: number
    hidden?: boolean
  },
): Promise<void> {
  await page.evaluate(async (input) => {
    await window.__anchoredRedrawHarness.create(input)
  }, options)
}

async function stats(page: Page): Promise<Stats> {
  return page.evaluate(() => window.__anchoredRedrawHarness.stats() as unknown as Stats)
}

async function reset(page: Page): Promise<void> {
  await page.evaluate(() => window.__anchoredRedrawHarness.resetCounters())
}

function closeTo(actual: number, expected: number, tolerance = 0.51): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

/** Each rendered contour must match the production full-history geometry exactly. */
async function expectRenderedAnchoredFills(
  page: Page,
  fillStyle: string,
  pairCount: number,
): Promise<{ fills: FillRecord[]; runs: ExpectedRun[]; stats: Stats }> {
  const result = await page.evaluate((count) => {
    const harness = window.__anchoredRedrawHarness
    const current = harness.stats() as unknown as Stats
    return {
      runs: Array.from(
        { length: count },
        (_, index) => harness.expectedRuns(index) as unknown as ExpectedRun[],
      ),
      fills: current.lastFrameFills,
      stats: current,
    }
  }, pairCount)
  expect(result.stats.pixelRatio, 'bitmap assertions assume devicePixelRatio 1').toBe(1)
  const fills = result.fills.filter((fill) => fill.fillStyle === fillStyle)
  expect(fills.length, 'one rendered fill contour per pair').toBe(pairCount)
  const flatRuns = result.runs.flat()
  expect(flatRuns.length).toBe(pairCount)
  for (let pairIndex = 0; pairIndex < pairCount; pairIndex += 1) {
    const points = fills[pairIndex].points
    const run = flatRuns[pairIndex]
    expect(points.length).toBe(run.upper.length * 4)
    for (let index = 0; index < run.upper.length; index += 1) {
      closeTo(points[index * 2], run.upper[index].x)
      closeTo(points[index * 2 + 1], run.upper[index].y)
    }
    for (let index = 0; index < run.lower.length; index += 1) {
      const offset = run.upper.length * 2 + index * 2
      closeTo(points[offset], run.lower[index].x)
      closeTo(points[offset + 1], run.lower[index].y)
    }
  }
  return { fills, runs: flatRuns, stats: result.stats }
}

test.describe('anchored VWAP band fill scheduling', () => {
  test('library-driven updateAllViews requests no redraw and keeps production geometry', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { bars: 300, visibleBars: 80, fillOpacity: 24, bandCount: 3 })

    await reset(page)
    await page.evaluate(() => window.__anchoredRedrawHarness.forceViews())
    const direct = await stats(page)
    expect(direct.requestUpdates).toBe(0)
    expect(direct.viewUpdates).toBe(1)
    expect(direct.timeConversions).toBe(300 * PAIRS)
    expect(direct.priceConversions).toBe(300 * PAIRS * 2)

    // An explicit style change is what schedules the paint; the drawn contour
    // must still be the production full-history geometry.
    await reset(page)
    await page.evaluate(() => window.__anchoredRedrawHarness.setFillOpacity(48))
    const styled = await stats(page)
    expect(styled.requestUpdates, 'presentation + visibility setters each request once').toBe(2)
    await expectRenderedAnchoredFills(page, FILL_48, 3)

    await reset(page)
    await page.evaluate(() => window.__anchoredRedrawHarness.updateAttachment())
    const updated = await stats(page)
    expect(updated.requestUpdates).toBe(1)
    await expectRenderedAnchoredFills(page, FILL_48, 3)
  })

  test('idle windows settle with one or three attached tools, and removal stops scheduling', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { bars: 400, visibleBars: 80, fillOpacity: 24 })

    await reset(page)
    await page.waitForTimeout(300)
    const one = await stats(page)
    expect(one.rafCallbacks, 'one tool must settle when input stops').toBe(0)
    expect(one.requestUpdates).toBe(0)
    expect(one.viewUpdates).toBe(0)
    expect(one.clears).toBe(0)

    await page.evaluate(() => window.__anchoredRedrawHarness.addAnotherTool())
    await page.evaluate(() => window.__anchoredRedrawHarness.addAnotherTool())
    await page.evaluate(() => window.__anchoredRedrawHarness.waitFrames(3))
    await reset(page)
    await page.waitForTimeout(300)
    const three = await stats(page)
    expect(three.toolCount).toBe(3)
    expect(three.rafCallbacks, 'three tools must settle when input stops').toBe(0)
    expect(three.requestUpdates).toBe(0)
    expect(three.viewUpdates).toBe(0)

    await page.evaluate(async () => {
      window.__anchoredRedrawHarness.removeTool(0)
      await window.__anchoredRedrawHarness.waitFrames(2)
    })
    await reset(page)
    await page.waitForTimeout(200)
    const two = await stats(page)
    expect(two.toolCount).toBe(2)
    expect(two.rafCallbacks).toBe(0)
    expect(two.requestUpdates).toBe(0)
    expect(two.fills).toEqual([])

    await page.evaluate(async () => {
      window.__anchoredRedrawHarness.removeTool(0)
      window.__anchoredRedrawHarness.removeTool(0)
      await window.__anchoredRedrawHarness.waitFrames(3)
    })
    await reset(page)
    await page.waitForTimeout(200)
    const none = await stats(page)
    expect(none.toolCount).toBe(0)
    expect(none.rafCallbacks).toBe(0)
    expect(none.requestUpdates).toBe(0)
    expect(none.fills).toEqual([])
  })

  test('hidden and zero-opacity fills settle without painting or scheduling', async ({ page }) => {
    await openHarness(page)
    await createChart(page, { bars: 300, visibleBars: 80, fillOpacity: 24 })

    await page.evaluate(() => window.__anchoredRedrawHarness.setVisible(false))
    await page.evaluate(() => window.__anchoredRedrawHarness.waitFrames(2))
    await reset(page)
    await page.waitForTimeout(300)
    const hidden = await stats(page)
    expect(hidden.rafCallbacks).toBe(0)
    expect(hidden.requestUpdates).toBe(0)
    expect(hidden.clears).toBe(0)
    expect(hidden.fills).toEqual([])

    await reset(page)
    await page.evaluate(() => window.__anchoredRedrawHarness.setVisible(true))
    const shown = await stats(page)
    expect(shown.requestUpdates).toBe(1)
    await expectRenderedAnchoredFills(page, FILL_24, 1)

    await reset(page)
    await page.evaluate(() => window.__anchoredRedrawHarness.setFillOpacity(0))
    const zero = await stats(page)
    expect(zero.requestUpdates, 'presentation + visibility setters each request once').toBe(2)
    expect(
      zero.fills.filter((fill) => fill.fillStyle === FILL_24 || fill.fillStyle === FILL_48),
      'zero fill opacity draws no band fill',
    ).toEqual([])

    await page.evaluate(() => window.__anchoredRedrawHarness.waitFrames(2))
    await reset(page)
    await page.waitForTimeout(300)
    const zeroIdle = await stats(page)
    expect(zeroIdle.rafCallbacks).toBe(0)
    expect(zeroIdle.requestUpdates).toBe(0)
    expect(zeroIdle.clears).toBe(0)
  })

  test('data-only changes, pan, zoom and resize repaint through explicit scheduling', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { bars: 400, visibleBars: 80, fillOpacity: 24 })

    await reset(page)
    await page.evaluate(() => window.__anchoredRedrawHarness.setPoints(200))
    const data = await stats(page)
    expect(data.requestUpdates).toBeGreaterThan(0)
    expect(data.fills.length).toBeGreaterThan(0)

    await page.evaluate(async () => {
      await window.__anchoredRedrawHarness.waitFrames(2)
    })

    await reset(page)
    await page.evaluate(async () => {
      window.__anchoredRedrawHarness.setVisibleLogicalRange(120, 220)
      await window.__anchoredRedrawHarness.waitFrames(2)
    })
    const panned = await stats(page)
    expect(panned.requestUpdates, 'panning is a library frame, not a primitive request').toBe(0)
    expect(panned.fills.length).toBeGreaterThan(0)
    const expected = await page.evaluate(() =>
      window.__anchoredRedrawHarness.expectedRuns(0),
    )
    expect(expected.length).toBe(1)

    await reset(page)
    await page.evaluate(async () => {
      window.__anchoredRedrawHarness.setVisibleLogicalRange(300, 320)
      await window.__anchoredRedrawHarness.waitFrames(2)
    })
    const zoomed = await stats(page)
    expect(zoomed.requestUpdates).toBe(0)
    expect(zoomed.fills.length).toBeGreaterThan(0)

    await reset(page)
    await page.evaluate(async () => {
      await window.__anchoredRedrawHarness.resize(640, 360)
    })
    const resized = await stats(page)
    expect(resized.fills.length).toBeGreaterThan(0)

    await reset(page)
    await page.waitForTimeout(300)
    const idle = await stats(page)
    expect(idle.rafCallbacks).toBe(0)
    expect(idle.requestUpdates).toBe(0)
  })

  test('empty pairs and cleared history settle without fills or requests', async ({ page }) => {
    await openHarness(page)
    await createChart(page, { bars: 120, visibleBars: 40, fillOpacity: 24, hidden: true })

    await reset(page)
    await page.waitForTimeout(300)
    const hiddenAtCreate = await stats(page)
    expect(hiddenAtCreate.rafCallbacks).toBe(0)
    expect(hiddenAtCreate.requestUpdates).toBe(0)
    expect(hiddenAtCreate.fills).toEqual([])

    await reset(page)
    await page.evaluate(() => window.__anchoredRedrawHarness.clearData())
    await page.evaluate(async () => {
      await window.__anchoredRedrawHarness.waitFrames(2)
    })
    await reset(page)
    await page.waitForTimeout(300)
    const cleared = await stats(page)
    expect(cleared.rafCallbacks).toBe(0)
    expect(cleared.requestUpdates).toBe(0)
    expect(cleared.fills).toEqual([])
  })
})
