import { expect, test, type Page } from '@playwright/test'
import { PriceScaleMode } from 'lightweight-charts'

/**
 * Real installed-lightweight-charts coverage for the consolidated Rolling VWAP
 * band primitive (#262).
 *
 * The harness builds the pre-#262 native reference (centre + six band
 * `LineSeries` + three fill primitives) and the production bundle (centre + one
 * band primitive) from the SAME candles, points, viewport and price scale. It
 * compares the two rendered charts pixel by pixel and counts native
 * `update()` / `setData()` calls; no wall-clock budget is asserted.
 */

type CompareResult = {
  total: number
  diff: number
  structural: number
  ink: [number, number]
  maxDelta: number
}

type HarnessStats = {
  devicePixelRatio: number
  rafFrames: number
  base: { updates: number; setData: number } | null
  consolidated: { updates: number; setData: number } | null
  primitive: Array<{
    rebuilds: number
    invalidations: number
    visitedPoints: number
    outlineRuns: number
    fillContours: number
    haloStrokes: number
  }>
  candles: number
  points: number
  visibleRange: { from: unknown; to: unknown } | null
  logicalRange: { from: number; to: number } | null
  barSpacing: number
  priceRange: { from: number; to: number } | null
  basePriceRange: { from: number; to: number } | null
}

type BandCoordinate = {
  key: string
  value: number | null
  projected: number | null
  baseY: number | null
  consolidatedY: number | null
  delta: number | null
}

async function openHarness(page: Page) {
  await page.setViewportSize({ width: 1800, height: 700 })
  await page.goto('/e2e/fixtures/rolling-vwap-band-primitive.html')
  await expect.poll(() => page.evaluate(() => typeof window.__rvwapHarness)).toBe('object')
}

async function create(
  page: Page,
  config: Record<string, unknown> = {},
): Promise<void> {
  await page.evaluate(async (input) => {
    await window.__rvwapHarness.create(input)
  }, config)
}

async function compare(page: Page): Promise<CompareResult> {
  return (await page.evaluate(() => window.__rvwapHarness.compare())) as CompareResult
}

async function stats(page: Page): Promise<HarnessStats> {
  return (await page.evaluate(() => window.__rvwapHarness.stats())) as HarnessStats
}

async function bandCoordinates(page: Page): Promise<BandCoordinate[]> {
  return (await page.evaluate(() =>
    window.__rvwapHarness.bandCoordinates(),
  )) as BandCoordinate[]
}

function expectSameInputParity(result: CompareResult, label: string): void {
  expect(result.diff, `${label}: differing pixels`).toBe(0)
  expect(result.ink[0], `${label}: base ink`).toBe(result.ink[1])
}

test.describe('Rolling VWAP consolidated band primitive', () => {
  test('default bands are pixel-identical and keep every autoscale/coordinate', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 5_000, visible: 60 })

    const result = await compare(page)
    expectSameInputParity(result, 'default bands')

    const current = await stats(page)
    expect(current.devicePixelRatio, 'pixel assertions assume devicePixelRatio 1').toBe(1)
    expect(current.basePriceRange).not.toBeNull()
    expect(current.priceRange).toEqual(current.basePriceRange)

    const coordinates = await bandCoordinates(page)
    expect(coordinates).toHaveLength(6)
    for (const coordinate of coordinates) {
      expect(coordinate.delta, `${coordinate.key} vertical delta`).not.toBeNull()
      expect(coordinate.delta ?? 99).toBeLessThanOrEqual(0.51)
    }
  })

  test('app default 0/0/0 draws no band outlines or fills and adds no band range', async ({
    page,
  }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60, multipliers: [0, 0, 0], fillOpacity: 0 })

    const result = await compare(page)
    expect(result.diff, 'app default differs').toBe(0)

    // With multipliers 0 the only ink is candles, the centre and the axes in
    // both variants; the bands contribute nothing.
    const zeroBand = await stats(page)
    expect(zeroBand.primitive[0].outlineRuns).toBe(0)
    expect(zeroBand.primitive[0].fillContours).toBe(0)

    const coordinates = await bandCoordinates(page)
    expect(coordinates).toHaveLength(6)
    for (const coordinate of coordinates) {
      expect(coordinate.baseY).toBeNull()
      expect(coordinate.consolidatedY).toBeNull()
    }
  })

  test('zero-opacity outlines and fills stay drawn, unfilled and pixel-identical', async ({
    page,
  }) => {
    await openHarness(page)
    await create(page, {
      n: 2_000,
      visible: 60,
      bandOpacities: [0, 0, 0],
      fillOpacity: 0,
    })
    const result = await compare(page)
    expectSameInputParity(result, 'opacity 0')
    const current = await stats(page)
    // The band sources still exist and contribute their range.
    expect(current.priceRange).toEqual(current.basePriceRange)
    expect(current.primitive[0].outlineRuns).toBe(6)
    expect(current.primitive[0].fillContours).toBe(3)
  })

  test('dotted styles are pixel-identical', async ({ page }) => {
    await openHarness(page)
    await create(page, {
      n: 2_000,
      visible: 60,
      bandLineStyles: ['dotted', 'dotted', 'dotted'],
      bandLineWidths: [1, 2, 3],
    })
    expectSameInputParity(await compare(page), 'dotted')
  })

  test('per-band widths and mixed solid/dotted styles are pixel-identical', async ({ page }) => {
    await openHarness(page)
    await create(page, {
      n: 2_000,
      visible: 60,
      bandLineStyles: ['dotted', 'solid', 'dotted'],
      bandLineWidths: [1, 3, 4],
    })
    expectSameInputParity(await compare(page), 'widths and styles')
  })

  test('null gaps break both variants the same way (same-input probe)', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60, gap: true })
    const result = await compare(page)
    const ratio = result.diff / result.total
    // Same inputs on both sides; any residual is endpoint AA at the break.
    expect(ratio, `gap diff ratio ${ratio}`).toBeLessThan(0.005)
    expect(result.ink[0]).toBe(result.ink[1])
  })

  test('log, inverted and scale-margin modes are pixel-identical', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })

    for (const options of [
      { mode: PriceScaleMode.Logarithmic },
      { mode: PriceScaleMode.Normal, invert: true },
      { mode: PriceScaleMode.Normal, margins: { top: 0.2, bottom: 0.3 } },
    ]) {
      await page.evaluate(async (scale) => {
        await window.__rvwapHarness.setScale(scale)
      }, options)
      expectSameInputParity(await compare(page), JSON.stringify(options))
    }
  })

  test('percentage and indexed-to-100 keep each native first-visible base', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })

    for (const mode of [PriceScaleMode.Percentage, PriceScaleMode.IndexedTo100]) {
      await page.evaluate(async (scaleMode) => {
        await window.__rvwapHarness.setScale({ mode: scaleMode as never })
      }, mode)
      const result = await compare(page)
      // Percentage/IndexedTo100 now convert each outline through its own first
      // visible base. The only residual is a last-bit floating-point difference
      // in the merged price range (~1e-12 px coordinates), which can flip AA on
      // individual centre-line pixels; it is not a base/geometry divergence.
      expect(result.ink[0], `mode ${mode} ink`).toBe(result.ink[1])
      expect(result.diff / result.total, `mode ${mode} diff ratio`).toBeLessThan(0.0005)
      expect(result.structural / result.total, `mode ${mode} structural`).toBeLessThan(0.0002)
      expect(result.maxDelta, `mode ${mode} max channel delta`).toBeLessThanOrEqual(64)

      const current = await stats(page)
      expect(current.priceRange, `mode ${mode} autoscale`).toEqual(current.basePriceRange)
      const coordinates = await bandCoordinates(page)
      for (const coordinate of coordinates) {
        expect(coordinate.delta ?? 99).toBeLessThanOrEqual(0.51)
      }
    }
  })

  test('manual price range keeps the same coordinates', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })
    const current = await stats(page)
    const range = current.priceRange
    expect(range).not.toBeNull()
    const from = (range as { from: number }).from
    const to = (range as { to: number }).to
    await page.evaluate(
      async (manualRange) => {
        await window.__rvwapHarness.setScale({ autoScale: false, range: manualRange })
      },
      { from: from + (to - from) * 0.1, to: to - (to - from) * 0.1 },
    )
    expectSameInputParity(await compare(page), 'manual range')
  })

  test('live ticks keep one native update per instance and stay pixel-identical', async ({
    page,
  }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })
    await page.evaluate(() => window.__rvwapHarness.resetCounters())
    await page.evaluate(async () => {
      await window.__rvwapHarness.tick(5)
    })

    const current = await stats(page)
    // One native centre update per instance per tick; the six band outlines are
    // one primitive and never call the native series API.
    expect(current.consolidated?.updates).toBe(5)
    expect(current.base?.updates).toBe(35)
    expect(current.consolidated?.setData).toBe(0)

    // Same-input visual parity after the live path.
    const result = await compare(page)
    expect(result.diff / result.total, 'live tick diff ratio').toBeLessThan(0.0005)
  })

  test('three instances update exactly once each per tick', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60, instanceCount: 3 })
    await page.evaluate(() => window.__rvwapHarness.resetCounters())
    await page.evaluate(async () => {
      await window.__rvwapHarness.tick(1)
    })
    const current = await stats(page)
    expect(current.consolidated?.updates).toBe(3)
    expect(current.base?.updates).toBe(21)
    expect(current.primitive).toHaveLength(3)
    for (const primitive of current.primitive) {
      expect(primitive.outlineRuns).toBe(6)
      expect(primitive.fillContours).toBe(3)
    }
  })

  test('history prepend keeps the viewport and stays pixel-identical', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })
    const before = await stats(page)
    await page.evaluate(async () => {
      await window.__rvwapHarness.prependCandles(500)
    })
    const after = await stats(page)
    expect(after.candles).toBe(2_500)
    expect(after.logicalRange?.from).toBe((before.logicalRange?.from ?? 0) + 500)
    const result = await compare(page)
    expect(result.diff / result.total, 'prepend diff ratio').toBeLessThan(0.0005)
  })

  test('an idle chart does not repaint, rebuild or invalidate', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })
    await page.evaluate(() => window.__rvwapHarness.resetCounters())
    await page.evaluate(() => window.__rvwapHarness.wait(350))
    const idle = await stats(page)
    expect(idle.consolidated?.updates).toBe(0)
    expect(idle.consolidated?.setData).toBe(0)
    expect(idle.primitive[0].invalidations).toBe(0)
    expect(idle.rafFrames).toBe(0)
  })

  test('hidden instance renders no band and stays bounded', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })
    await page.evaluate(async () => {
      await window.__rvwapHarness.setVisibility(false)
    })
    const current = await stats(page)
    expect(current.primitive[0].outlineRuns).toBe(0)
    expect(current.primitive[0].fillContours).toBe(0)
    expect(current.primitive[0].invalidations).toBe(1)
    const result = await compare(page)
    expect(result.diff, 'hidden instance differs').toBe(0)
  })

  test('zero-multiplier bands are absent while other bands keep drawing', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 2_000, visible: 60 })
    await page.evaluate(async () => {
      await window.__rvwapHarness.setVisibility(true, [1, 0, 1])
    })
    const current = await stats(page)
    expect(current.primitive[0].outlineRuns).toBe(4)
    expect(current.primitive[0].fillContours).toBe(2)
    expectSameInputParity(await compare(page), 'zero multiplier band')
  })

  test('the primitive adopts the full source with all seven values', async ({ page }) => {
    await openHarness(page)
    await create(page, { n: 1_000, visible: 60 })
    const snapshot = (await page.evaluate(() =>
      window.__rvwapHarness.pointSnapshot(),
    )) as Array<Record<string, unknown>>
    expect(snapshot).not.toBeNull()
    expect(snapshot.length).toBe(1_000)
    for (const [index, point] of snapshot.entries()) {
      expect(Object.keys(point).sort()).toEqual(
        ['lower1', 'lower2', 'lower3', 'stdev', 'time', 'upper1', 'upper2', 'upper3', 'vwap'].sort(),
      )
      expect(point.time).toBe(1_650_000_000 + index * 60)
    }
  })

  test('bounded visible work at large natural history', async ({ page }) => {
    test.setTimeout(120_000)
    await openHarness(page)
    await create(page, { n: 20_000, visible: 39 })
    await page.evaluate(() => window.__rvwapHarness.resetCounters())
    await page.evaluate(async () => {
      await window.__rvwapHarness.setRange(19_000, 19_038)
    })
    const current = await stats(page)
    // One rebuild per frame; each visits the visible window plus neighbours.
    for (const primitive of current.primitive) {
      expect(primitive.visitedPoints).toBeLessThanOrEqual(41)
    }
  })
})

declare global {
  interface Window {
    __rvwapHarness: {
      create: (config?: Record<string, unknown>) => Promise<void>
      tick: (count?: number) => Promise<void>
      setRange: (from: number, to: number) => Promise<void>
      setScale: (options: Record<string, unknown>) => Promise<void>
      setVisibility: (enabled: boolean, multipliers?: [number, number, number]) => Promise<void>
      setStyle: (patch: Record<string, unknown>) => Promise<void>
      prependCandles: (count: number) => Promise<void>
      stats: () => unknown
      compare: () => unknown
      bandCoordinates: () => unknown
      coordinateProbe: (prices: number[]) => unknown
      pointSnapshot: () => unknown
      resetCounters: () => void
      waitFrames: (count: number) => Promise<void>
      wait: (ms: number) => Promise<void>
      stepTickCadence: (options: unknown) => Promise<unknown>
      stepPages: (options: unknown) => Promise<unknown>
      destroy: () => void
    }
  }
}
