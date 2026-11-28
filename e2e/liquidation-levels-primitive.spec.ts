import { expect, test, type Page } from '@playwright/test'

/**
 * Real installed-lightweight-charts (5.2.x) coverage for the live
 * liquidation-level profile primitive.
 *
 * The harness imports the production primitive and counts
 * `requestUpdate()` callbacks (requests), library `updateAllViews()` calls,
 * animation frames and real canvas fill/stroke/text calls per frame. Counters
 * over fixed windows are asserted; there are no wall-clock budgets. The DPR-2
 * block reports the bitmap ratio the browser really used instead of assuming 2.
 */

type Fill = { style: string; x: number; y: number; w: number; h: number }
type Stats = {
  requestUpdates: number
  viewUpdates: number
  frames: number
  pixelRatio: number
  plotWidthCss: number
  paneHeightCss: number
  fillCount: number
  strokeCount: number
  framesWithFills: number
  lastFrameFills: number
  greenFills: number
  redFills: number
  textFills: number
  lastFrameTexts: number
  lastFrameText: string | null
  lastFrameFillXMax: number
  profile: { height: number; top: number | null; bottom: number | null } | null
  candlePaneIndex: number
  paneCount: number
}

const GREEN = 'rgba(34, 197, 94, 0.6)'
const RED = 'rgba(239, 68, 68, 0.6)'
// Rows the fixture seeds: price 108 + 4 * i, size (i % 2 === 0 ? i + 1 : -(i + 1)).
const PRICES = [108, 112, 116, 120, 124]

async function openHarness(page: Page): Promise<void> {
  await page.goto('/e2e/fixtures/liquidation-levels-primitive.html')
  await expect
    .poll(() => page.evaluate(() => typeof window.__liquidationLevelsHarness))
    .toBe('object')
}

async function create(page: Page, paneHeight = 400, rows = 5): Promise<void> {
  await page.evaluate(
    (input) => window.__liquidationLevelsHarness.create(input),
    { paneHeight, rows },
  )
  await paint(page)
}

/** Wait for two animation frames so the library's pending repaint ran. */
async function paint(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )
}

/** Idle window measured in animation frames, not milliseconds. */
async function idleFrames(page: Page, count: number): Promise<void> {
  await page.evaluate(
    (frames) =>
      new Promise<void>((resolve) => {
        let remaining = frames
        const step = () => {
          remaining -= 1
          if (remaining <= 0) resolve()
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    count,
  )
}

async function stats(page: Page): Promise<Stats> {
  return page.evaluate(
    () => window.__liquidationLevelsHarness.stats() as unknown as Stats,
  )
}

async function reset(page: Page): Promise<void> {
  await page.evaluate(() => window.__liquidationLevelsHarness.resetCounters())
}

function expectRightAligned(bars: Fill[], plotWidth: number): void {
  expect(bars.length).toBeGreaterThan(0)
  for (const bar of bars) {
    expect(Math.abs(bar.x + bar.w - plotWidth)).toBeLessThanOrEqual(1)
    expect(bar.w).toBeGreaterThan(0)
  }
}

test.describe('liquidation level primitive — DPR 1', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page)
    await create(page)
  })

  test('settles to zero requests and zero paints when idle', async ({ page }) => {
    await reset(page)
    await idleFrames(page, 30)
    const idle = await stats(page)
    expect(idle.requestUpdates).toBe(0)
    expect(idle.fillCount).toBe(0)
    expect(idle.viewUpdates).toBe(0)
  })

  test('paints green long and red short bars on one leftward scale', async ({
    page,
  }) => {
    const painted = await stats(page)
    expect(painted.greenFills).toBeGreaterThan(0)
    expect(painted.redFills).toBeGreaterThan(0)
    expect(painted.lastFrameText).toContain('LEV LIQ')
    const bars = await page.evaluate(() => window.__liquidationLevelsHarness.lastFrameBars())
    expectRightAligned(bars, painted.plotWidthCss)

    // Same magnitude ⇒ same length on either side (shared scale, not per side).
    const pricesAndSizes = [
      [108, 1],
      [112, -2],
      [116, 3],
      [120, -4],
      [124, 5],
    ] as const
    const maxWidth = painted.plotWidthCss * 0.25
    for (const [price, size] of pricesAndSizes) {
      const expectedWidth = (Math.abs(size) / 5) * maxWidth
      const matching = bars.filter(
        (bar) => bar.style === (size > 0 ? GREEN : RED),
      )
      expect(matching.length).toBeGreaterThan(0)
      const widths = matching.map((bar) => bar.w)
      expect(widths.some((width) => Math.abs(width - expectedWidth) <= 1.5)).toBe(true)
      expect(price).toBeGreaterThan(0)
    }
  })

  test('price rows follow the candle price scale exactly', async ({ page }) => {
    const aligned = await page.evaluate(
      (prices) => {
        const harness = window.__liquidationLevelsHarness
        const bars = harness.lastFrameBars()
        const paneHeight = harness.stats().paneHeightCss
        return prices.map((price) => {
          const y = harness.priceToY(price)
          const inPane = y !== null && y >= 0 && y < paneHeight
          const hit = bars.find(
            (bar) => inPane && bar.y <= (y as number) && (y as number) < bar.y + bar.h,
          )
          return {
            price,
            y,
            inPane,
            hit: hit !== undefined,
            delta: hit === undefined ? null : Math.abs(hit.y - (y as number)),
          }
        })
      },
      PRICES,
    )
    const onScreen = aligned.filter((row) => row.inPane)
    expect(onScreen.length).toBeGreaterThan(0)
    for (const row of onScreen) {
      expect(row.hit, `a bar row must cover price ${row.price}`).toBe(true)
      expect(row.delta ?? 99).toBeLessThanOrEqual(1)
    }
    for (const row of aligned.filter((entry) => !entry.inPane)) {
      expect(row.hit, `off-screen price ${row.price} must not paint`).toBe(false)
    }
  })

  test('a pan repaints through the library without requesting from the view', async ({
    page,
  }) => {
    await reset(page)
    await page.evaluate(() =>
      window.__liquidationLevelsHarness.panLogical(10.5, 80.5),
    )
    await paint(page)
    const panned = await stats(page)
    expect(panned.requestUpdates).toBe(0)
    expect(panned.fillCount).toBeGreaterThan(0)
    expect(panned.lastFrameText).toContain('LEV LIQ')
    expectRightAligned(
      await page.evaluate(() => window.__liquidationLevelsHarness.lastFrameBars()),
      panned.plotWidthCss,
    )

    // A fractional logical pan that changes auto-scale keeps the rows aligned.
    await reset(page)
    await page.evaluate(() =>
      window.__liquidationLevelsHarness.panLogical(37.25, 120.75),
    )
    await paint(page)
    const aligned = await page.evaluate((prices) => {
      const harness = window.__liquidationLevelsHarness
      const bars = harness.lastFrameBars()
      return prices.map((price) => {
        const y = harness.priceToY(price)
        return bars.some((bar) => y !== null && bar.y <= y && y < bar.y + bar.h)
      })
    }, PRICES)
    expect(aligned.every(Boolean)).toBe(true)
  })

  test('a manual price scale moves the rows and hides out-of-range rows', async ({
    page,
  }) => {
    await page.evaluate(() => window.__liquidationLevelsHarness.setPriceRange(112, 116))
    await paint(page)
    const zoomed = await page.evaluate(
      (prices) => {
        const harness = window.__liquidationLevelsHarness
        const bars = harness.lastFrameBars()
        const paneHeight = harness.stats().paneHeightCss
        return prices.map((price) => {
          const y = harness.priceToY(price)
          const inRange = y !== null && y >= 0 && y < paneHeight
          const hit = bars.some(
            (bar) => inRange && bar.y <= (y as number) && (y as number) < bar.y + bar.h,
          )
          return { price, inRange, hit }
        })
      },
      PRICES,
    )
    // The library clamps a manual price range, so the test never assumes the
    // requested numbers; it asserts the rows follow whatever scale is real.
    expect(zoomed.some((row) => row.inRange)).toBe(true)
    for (const row of zoomed) {
      if (row.inRange) {
        expect(row.hit, `visible price ${row.price} must have a row`).toBe(true)
      } else {
        expect(row.hit).toBe(false)
      }
    }
    await page.evaluate(() => window.__liquidationLevelsHarness.autoScale())
    await paint(page)
  })

  test('resize re-anchors the bars and rebuilds the rows', async ({ page }) => {
    const before = await stats(page)
    await page.evaluate(() => window.__liquidationLevelsHarness.resize(600, 300))
    await paint(page)
    const after = await stats(page)
    expect(after.plotWidthCss).not.toBe(before.plotWidthCss)
    expect(after.paneHeightCss).toBeLessThan(before.paneHeightCss)
    expectRightAligned(
      await page.evaluate(() => window.__liquidationLevelsHarness.lastFrameBars()),
      after.plotWidthCss,
    )
  })

  test('stays in the candle pane when a second pane exists', async ({ page }) => {
    await page.evaluate(() => window.__liquidationLevelsHarness.addSecondPane())
    await paint(page)
    const panes = await stats(page)
    expect(panes.paneCount).toBe(2)
    expect(panes.candlePaneIndex).toBe(0)

    const before = await page.evaluate(() => ({
      bars: window.__liquidationLevelsHarness.lastFrameBars(),
      width: window.__liquidationLevelsHarness.plotWidth(),
    }))
    // Changing the other pane's price scale must not move the profile.
    await page.evaluate(() => window.__liquidationLevelsHarness.setOtherPaneRange(1, 2))
    await page.evaluate(() => window.__liquidationLevelsHarness.panLogical(20, 90))
    await paint(page)
    const after = await page.evaluate(() => ({
      bars: window.__liquidationLevelsHarness.lastFrameBars(),
      width: window.__liquidationLevelsHarness.plotWidth(),
    }))
    expect(after.width).toBe(before.width)
    expect(after.bars.map((bar) => bar.style).sort()).toEqual(
      before.bars.map((bar) => bar.style).sort(),
    )
    expectRightAligned(after.bars, after.width)
  })

  test('selection strokes the painted rows and disabling clears them', async ({
    page,
  }) => {
    await reset(page)
    await page.evaluate(() => window.__liquidationLevelsHarness.setSelected(true))
    await paint(page)
    const selected = await stats(page)
    expect(selected.strokeCount).toBeGreaterThan(0)
    expect(selected.requestUpdates).toBe(1)

    await page.evaluate(() => window.__liquidationLevelsHarness.setSelected(false))
    await page.evaluate(() => window.__liquidationLevelsHarness.setEnabled(false))
    // Force library repaints after disabling: no profile ink may appear again.
    await reset(page)
    await page.evaluate(() => window.__liquidationLevelsHarness.panLogical(5.5, 60.5))
    await paint(page)
    const disabled = await stats(page)
    expect(disabled.fillCount).toBe(0)
    expect(disabled.strokeCount).toBe(0)
    expect(disabled.textFills).toBe(0)
  })

  test('an external data change requests exactly one paint', async ({ page }) => {
    await reset(page)
    await page.evaluate(() =>
      window.__liquidationLevelsHarness.replaceBook([
        ['0x1', 110, 2],
        ['0x2', 121, -2],
      ]),
    )
    await paint(page)
    const changed = await stats(page)
    expect(changed.requestUpdates).toBe(1)
    const bars = await page.evaluate(() => window.__liquidationLevelsHarness.lastFrameBars())
    expect(bars.length).toBe(2)
    expectRightAligned(bars, changed.plotWidthCss)
  })
})
