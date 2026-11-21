import { expect, test, type Page } from '@playwright/test'
import { PriceScaleMode } from 'lightweight-charts'

/**
 * Real installed-lightweight-charts (5.2.x) counter/render coverage for the
 * VWAP band fill geometry (#252).
 *
 * The harness imports the production primitive/geometry modules and the same
 * `lightweight-charts` package the app installs. It counts:
 * - source samples examined and coordinate conversions during one geometry
 *   build invoked through the public `updateAllViews()` callback;
 * - `requestUpdate()` calls received by `attached()`;
 * - real canvas fill paths drawn by the renderer, per frame.
 *
 * No wall-clock budgets are asserted. The only time-based checks sample an
 * idle window and require no fills/repaints, not a millisecond threshold.
 */

type Point = { x: number; y: number }
type ExpectedRun = { upper: Point[]; lower: Point[] }
type FillRecord = { fillStyle: string; points: number[]; frame: number }
type Stats = {
  sampleReads: number
  timeConversions: number
  priceConversions: number
  requestUpdates: number
  viewUpdates: number
  clears: number
  rafCallbacks: number
  pixelRatio: number
  fills: FillRecord[]
  lastFrameFills: FillRecord[]
  barSpacing: number
  visibleRange: { from: unknown; to: unknown } | null
  logicalRange: { from: number; to: number } | null
}

const FILL = 'rgba(12, 34, 56, 0.5)'
const FILL_2 = 'rgba(90, 80, 70, 0.5)'
const HISTORY_STEPS = [1_000, 20_000, 120_000]
const VISIBLE_BARS = 80

async function openHarness(page: Page): Promise<void> {
  await page.goto('/e2e/fixtures/vwap-band-fill.html')
  await expect.poll(() => page.evaluate(() => typeof window.__vwapHarness)).toBe('object')
}

async function createChart(
  page: Page,
  options: { barCount: number; visibleBars: number; fillStyle?: string },
): Promise<void> {
  await page.evaluate(async (input) => {
    await window.__vwapHarness.create(input)
  }, { fillStyle: FILL, ...options })
}

async function stats(page: Page): Promise<Stats> {
  return page.evaluate(() => window.__vwapHarness.stats() as unknown as Stats)
}

async function reset(page: Page): Promise<void> {
  await page.evaluate(() => window.__vwapHarness.resetCounters())
}

async function expectedRuns(page: Page): Promise<ExpectedRun[]> {
  return page.evaluate(() => window.__vwapHarness.expectedRuns())
}

function closeTo(actual: number, expected: number, tolerance = 0.51): void {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance)
}

function fillsForStyle(fills: FillRecord[], style: string): FillRecord[] {
  return fills.filter((fill) => fill.fillStyle === style)
}

async function expectRenderedGeometry(
  page: Page,
  fillStyle: string,
): Promise<{ runs: ExpectedRun[]; fills: FillRecord[]; stats: Stats }> {
  const result = await page.evaluate(() => {
    const harness = window.__vwapHarness
    const current = harness.stats() as unknown as Stats
    return {
      runs: harness.expectedRuns() as unknown as ExpectedRun[],
      fills: current.lastFrameFills,
      stats: current,
    }
  })
  expect(result.stats.pixelRatio, 'bitmap assertions assume devicePixelRatio 1').toBe(1)
  const fills = fillsForStyle(result.fills, fillStyle).sort((a, b) => a.points[0] - b.points[0])
  const runs = [...result.runs].sort((a, b) => a.upper[0].x - b.upper[0].x)
  expect(fills.length, 'one rendered fill contour per contiguous run').toBe(runs.length)

  for (let runIndex = 0; runIndex < runs.length; runIndex += 1) {
    const run = runs[runIndex]
    const points = fills[runIndex].points
    if (run.upper.length === 1) {
      expect(points.length).toBe(8)
      const center = run.upper[0].x
      const half = result.stats.barSpacing / 2
      closeTo(points[0], center - half)
      closeTo(points[2], center + half)
      closeTo(points[4], center + half)
      closeTo(points[6], center - half)
      closeTo(points[1], run.upper[0].y)
      closeTo(points[3], run.upper[0].y)
      closeTo(points[5], run.lower[0].y)
      closeTo(points[7], run.lower[0].y)
      continue
    }

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
  return { runs, fills, stats: result.stats }
}

test.describe('session VWAP band fill geometry', () => {
  test('samples examined stay bounded by visible samples as history grows', async ({ page }) => {
    test.setTimeout(120_000)
    await openHarness(page)
    const observations: Array<{
      history: number
      direct: Stats
      runCount: number
      polygonVertices: number
    }> = []

    for (const history of HISTORY_STEPS) {
      await createChart(page, { barCount: history, visibleBars: VISIBLE_BARS })
      await reset(page)
      await page.evaluate(() => window.__vwapHarness.forceViews())
      const direct = await stats(page)
      const runs = await expectedRuns(page)

      await reset(page)
      await page.evaluate((fill) => window.__vwapHarness.setFillStyle(fill), FILL_2)
      const painted = await stats(page)
      const fill = fillsForStyle(painted.lastFrameFills, FILL_2).sort(
        (a, b) => a.points.length - b.points.length,
      )[0]

      expect(direct.requestUpdates).toBe(0)
      expect(direct.viewUpdates).toBe(1)
      expect(runs.length).toBe(1)
      expect(direct.timeConversions).toBeGreaterThanOrEqual(VISIBLE_BARS)
      expect(direct.timeConversions).toBeLessThanOrEqual(VISIBLE_BARS + 2)
      expect(direct.priceConversions).toBe(direct.timeConversions * 2)
      expect(fill).toBeTruthy()
      if (!fill) throw new Error('expected a rendered band fill')

      observations.push({
        history,
        direct,
        runCount: runs.length,
        polygonVertices: fill.points.length / 2,
      })
    }

    const smallest = observations[0]
    const largest = observations[observations.length - 1]
    // Two binary searches (~2 log2 n) plus the visible window are bounded;
    // growing history by 120x may add only a few dozen comparator reads.
    expect(largest.direct.sampleReads - smallest.direct.sampleReads).toBeLessThanOrEqual(48)
    for (const observation of observations) {
      expect(observation.direct.sampleReads).toBeLessThanOrEqual(
        VISIBLE_BARS + 2 + 2 * Math.ceil(Math.log2(observation.history)) + 8,
      )
      expect(observation.polygonVertices).toBeLessThanOrEqual((VISIBLE_BARS + 4) * 2)
      expect(observation.polygonVertices).toBeGreaterThanOrEqual(VISIBLE_BARS)
    }
    console.log(
      JSON.stringify(
        observations.map((observation) => ({
          history: observation.history,
          sampleReads: observation.direct.sampleReads,
          timeConversions: observation.direct.timeConversions,
          priceConversions: observation.direct.priceConversions,
          polygonVertices: observation.polygonVertices,
        })),
      ),
    )
  })

  test('library callbacks request no redraw; setters, data-only updates and attachment init repaint', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { barCount: 1_000, visibleBars: VISIBLE_BARS })

    await reset(page)
    await page.evaluate(() => window.__vwapHarness.forceViews())
    const direct = await stats(page)
    expect(direct.requestUpdates).toBe(0)
    expect(direct.viewUpdates).toBe(1)

    await reset(page)
    await page.evaluate(() => window.__vwapHarness.setFillStyle('rgba(90, 80, 70, 0.5)'))
    const painted = await stats(page)
    expect(painted.requestUpdates).toBe(1)
    expect(fillsForStyle(painted.lastFrameFills, FILL_2).length).toBe(1)

    await reset(page)
    await page.evaluate(async () => {
      const points = [
        { time: 1_699_998_800, upper1: 106, lower1: 94 },
        { time: 1_699_999_400, upper1: 104, lower1: 96 },
        { time: 1_700_000_000, upper1: 103, lower1: 97 },
      ]
      await window.__vwapHarness.setPoints(points)
      window.__vwapHarness.setVisibleLogicalRange(0, 2)
      await window.__vwapHarness.waitFrames(3)
    })
    const dataUpdate = await stats(page)
    expect(dataUpdate.requestUpdates).toBeGreaterThan(0)
    await expectRenderedGeometry(page, FILL_2)

    await reset(page)
    await page.evaluate(async () => {
      await window.__vwapHarness.updateAttachment()
    })
    const explicitUpdate = await stats(page)
    expect(explicitUpdate.requestUpdates).toBe(1)
    expect(fillsForStyle(explicitUpdate.lastFrameFills, FILL_2).length).toBe(1)

    await reset(page)
    await page.evaluate(() => window.__vwapHarness.attachSecondFill('rgba(70, 60, 50, 0.5)'))
    const attached = await stats(page)
    expect(attached.requestUpdates).toBe(1)
    expect(attached.viewUpdates).toBeGreaterThan(0)
    expect(fillsForStyle(attached.lastFrameFills, 'rgba(70, 60, 50, 0.5)').length).toBe(1)
  })

  test('hidden fill settles without further scheduling and re-enables with a repaint', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { barCount: 1_000, visibleBars: VISIBLE_BARS })

    await page.evaluate(() => window.__vwapHarness.setVisible(false))
    await reset(page)
    await page.waitForTimeout(300)
    const hidden = await stats(page)
    expect(hidden.fills).toEqual([])
    expect(hidden.clears).toBe(0)
    expect(hidden.requestUpdates).toBe(0)
    expect(hidden.viewUpdates).toBe(0)
    expect(hidden.rafCallbacks).toBe(0)

    await reset(page)
    await page.evaluate(() => window.__vwapHarness.setVisible(true))
    const shown = await stats(page)
    expect(shown.requestUpdates).toBe(1)
    expect(fillsForStyle(shown.lastFrameFills, FILL).length).toBe(1)
  })

  test('manual range, inversion, log, percentage and indexed transforms use live conversions', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { barCount: 5, visibleBars: 5 })
    await page.evaluate(async () => {
      const points = [
        { time: 1_699_999_700, upper1: 105, lower1: 95 },
        { time: 1_699_999_800, upper1: 105, lower1: 95 },
        { time: 1_699_999_900, upper1: 105, lower1: 95 },
      ]
      await window.__vwapHarness.setPoints(points)
      window.__vwapHarness.setVisibleLogicalRange(0, 2)
      await window.__vwapHarness.waitFrames(3)
    })

    await page.evaluate(async () => {
      await window.__vwapHarness.setScale({
        autoScale: false,
        range: { from: 90, to: 110 },
      })
    })
    const range90 = await expectRenderedGeometry(page, FILL)
    const y90 = range90.runs[0].upper[0].y

    await page.evaluate(async () => {
      await window.__vwapHarness.setScale({
        autoScale: false,
        range: { from: 80, to: 120 },
      })
    })
    const range80 = await expectRenderedGeometry(page, FILL)
    const y80 = range80.runs[0].upper[0].y
    expect(Math.abs(y80 - y90), 'manual range change must move the rendered band').toBeGreaterThan(10)

    expect(range90.runs[0].upper[0].y).toBeLessThan(range90.runs[0].lower[0].y)
    await page.evaluate(async () => {
      await window.__vwapHarness.setScale({ autoScale: true, invert: true })
    })
    const inverted = await expectRenderedGeometry(page, FILL)
    expect(inverted.runs[0].upper[0].y).toBeGreaterThan(inverted.runs[0].lower[0].y)

    for (const mode of [
      PriceScaleMode.Normal,
      PriceScaleMode.Logarithmic,
      PriceScaleMode.Percentage,
      PriceScaleMode.IndexedTo100,
    ]) {
      await page.evaluate(async (priceScaleMode) => {
        await window.__vwapHarness.setScale({
          autoScale: true,
          invert: false,
          mode: priceScaleMode as never,
        })
      }, mode)
      await expectRenderedGeometry(page, FILL)
    }
  })

  test('pan, fractional logical pan, zoom and resize rebuild the bounded visible geometry', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { barCount: 400, visibleBars: 40 })

    await page.evaluate(async () => {
      window.__vwapHarness.setVisibleLogicalRange(100.25, 140.75)
      await window.__vwapHarness.waitFrames(3)
    })
    const panned = await expectRenderedGeometry(page, FILL)
    expect(panned.runs[0].upper.length).toBeGreaterThan(38)
    expect(panned.runs[0].upper.length).toBeLessThanOrEqual(44)

    await page.evaluate(async () => {
      window.__vwapHarness.setVisibleLogicalRange(200, 219)
      await window.__vwapHarness.waitFrames(3)
    })
    const zoomed = await expectRenderedGeometry(page, FILL)
    expect(zoomed.runs[0].upper.length).toBeLessThan(panned.runs[0].upper.length)

    const xBefore = zoomed.runs[0].upper[0].x
    await page.evaluate(async () => {
      await window.__vwapHarness.resize(640, 360)
    })
    const resized = await expectRenderedGeometry(page, FILL)
    expect(Math.abs(resized.runs[0].upper[0].x - xBefore)).toBeGreaterThan(1)
  })

  test('null gaps, sparse boundaries, viewport-crossing segments and isolated points render correctly', async ({
    page,
  }) => {
    await openHarness(page)
    await createChart(page, { barCount: 12, visibleBars: 12 })
    await page.evaluate(async () => {
      const points = Array.from({ length: 9 }, (_, index) => ({
        time: 1_699_999_000 + index * 60,
        upper1: index === 4 ? null : 102 + index * 0.5,
        lower1: index === 4 ? null : 98 - index * 0.5,
      }))
      await window.__vwapHarness.setPoints(points)
      window.__vwapHarness.setVisibleLogicalRange(0, 8)
      await window.__vwapHarness.waitFrames(3)
    })
    const gapped = await expectRenderedGeometry(page, FILL)
    expect(gapped.runs.length).toBe(2)

    await page.evaluate(async () => {
      await window.__vwapHarness.setPoints([
        { time: 1_699_980_000, upper1: 104, lower1: 96 },
        { time: 1_700_000_000, upper1: 108, lower1: 92 },
      ])
      window.__vwapHarness.setVisibleLogicalRange(0.4, 0.6)
      await window.__vwapHarness.waitFrames(3)
    })
    const crossing = await expectRenderedGeometry(page, FILL)
    expect(crossing.runs.length).toBe(1)
    expect(crossing.runs[0].upper.length).toBe(2)

    await page.evaluate(async () => {
      await window.__vwapHarness.setPoints([
        { time: 1_699_995_000, upper1: 104, lower1: 96 },
        { time: 1_699_995_060, upper1: null, lower1: null },
        { time: 1_699_995_120, upper1: null, lower1: null },
      ])
      window.__vwapHarness.setVisibleLogicalRange(0, 0)
      await window.__vwapHarness.waitFrames(3)
    })
    const isolated = await expectRenderedGeometry(page, FILL)
    expect(isolated.runs.length).toBe(1)
    expect(isolated.fills[0].points.length).toBe(8)
  })

  test('history clear and reload retain bounded data and repaint', async ({ page }) => {
    await openHarness(page)
    await createChart(page, { barCount: 1_000, visibleBars: VISIBLE_BARS })
    await page.evaluate(() => window.__vwapHarness.clearData())
    await reset(page)
    await page.evaluate(() => window.__vwapHarness.waitFrames(2))
    const cleared = await stats(page)
    expect(cleared.fills).toEqual([])

    await page.evaluate(async () => {
      await window.__vwapHarness.setHistory(20_000)
    })
    await reset(page)
    await page.evaluate(() => window.__vwapHarness.forceViews())
    const reloaded = await stats(page)
    expect(reloaded.requestUpdates).toBe(0)
    expect(reloaded.timeConversions).toBeLessThanOrEqual(VISIBLE_BARS + 2)
    await page.evaluate((fill) => window.__vwapHarness.setFillStyle(fill), FILL)
    await expectRenderedGeometry(page, FILL)
  })

  test('daily, weekly, monthly, quarterly and yearly session fills survive hide/re-enable', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openHarness(page)
    const result = await page.evaluate(async () => {
      const harness = window.__vwapHarness
      const sessions = (await harness.runSessionConsumers()) as {
        pointCounts: Record<string, number>
        fills: Record<string, string>
        shownByStyle: Record<string, number>
        hidden: Stats
        reenabledByStyle: Record<string, number>
        dataEqual: boolean
        reenabled: Stats
      }
      return sessions
    })

    for (const [key, count] of Object.entries(result.pointCounts)) {
      expect(count, `${key} VWAP points`).toBeGreaterThan(0)
      expect(result.shownByStyle[key], `${key} fill drawn`).toBeGreaterThan(0)
      expect(result.reenabledByStyle[key], `${key} fill redrawn after re-enable`).toBeGreaterThan(0)
    }
    expect(result.hidden.fills).toEqual([])
    expect(result.hidden.requestUpdates).toBe(0)
    expect(result.hidden.viewUpdates).toBe(0)
    expect(result.hidden.clears).toBe(0)
    expect(result.dataEqual).toBe(true)
  })

  test('three Rolling VWAP instances sharing one pane stay bounded and settle when disabled', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openHarness(page)
    const result = await page.evaluate(async () => {
      const harness = window.__vwapHarness
      return (await harness.runThreeRollingInstances()) as {
        fills: string[]
        shownByStyle: Record<string, number>
        direct: Stats
        hidden: Stats
      }
    })

    for (const style of result.fills) {
      expect(result.shownByStyle[style], `${style} fill drawn`).toBeGreaterThan(0)
    }
    expect(result.direct.requestUpdates).toBe(0)
    expect(result.direct.viewUpdates).toBe(9)
    const perFillConversions = result.direct.timeConversions / 9
    expect(perFillConversions).toBeGreaterThanOrEqual(118)
    expect(perFillConversions).toBeLessThanOrEqual(124)
    expect(result.hidden.fills).toEqual([])
    expect(result.hidden.requestUpdates).toBe(0)
    expect(result.hidden.viewUpdates).toBe(0)
    expect(result.hidden.clears).toBe(0)
  })

  test('rolling VWAP keeps three independent band pairs, shared fills and hide/re-enable data', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await openHarness(page)
    const result = await page.evaluate(async () => {
      const harness = window.__vwapHarness
      return (await harness.runRollingConsumer()) as {
        pointCount: number
        band1SourceRows: number
        fills: Record<string, string>
        shownByStyle: Record<string, number>
        disabledByStyle: Record<string, number>
        hidden: Stats
        reenabledByStyle: Record<string, number>
        dataEqual: boolean
        optionsEqual: boolean
      }
    })

    expect(result.pointCount).toBeGreaterThan(0)
    expect(result.band1SourceRows).toBe(result.pointCount)
    for (const key of ['band1', 'band2', 'band3']) {
      expect(result.shownByStyle[key], `${key} shared fill drawn`).toBeGreaterThan(0)
    }
    expect(result.disabledByStyle.band1).toBeGreaterThan(0)
    expect(result.disabledByStyle.band2).toBe(0)
    expect(result.disabledByStyle.band3).toBe(0)
    expect(result.hidden.fills).toEqual([])
    expect(result.hidden.requestUpdates).toBe(0)
    expect(result.hidden.viewUpdates).toBe(0)
    expect(result.hidden.clears).toBe(0)
    expect(result.dataEqual).toBe(true)
    expect(result.optionsEqual, 'per-band colors/widths/styles survive hide/re-enable').toBe(true)
    expect(result.reenabledByStyle.band1).toBeGreaterThan(0)
  })
})
