import { expect, test } from '@playwright/test'

/**
 * DPR-2 coverage for the liquidation-level profile primitive.
 *
 * Emulated `deviceScaleFactor` alone leaves the canvas bitmap at ratio 1 in this
 * Chromium build, so this file launches the browser with a real scale factor:
 * the fixture then reports the canvas's own bitmap ratio, and the assertions
 * check that geometry is expressed in that real ratio rather than assuming 2.
 */

test.use({
  deviceScaleFactor: 2,
  launchOptions: { args: ['--force-device-scale-factor=2'] },
})

test('uses the real canvas bitmap ratio and keeps CSS geometry', async ({ page }) => {
  await page.goto('/e2e/fixtures/liquidation-levels-primitive.html')
  await expect
    .poll(() => page.evaluate(() => typeof window.__liquidationLevelsHarness))
    .toBe('object')
  await page.evaluate(() => window.__liquidationLevelsHarness.create({ paneHeight: 400, rows: 5 }))
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      }),
  )

  const stats = await page.evaluate(
    () => window.__liquidationLevelsHarness.stats() as unknown as Record<string, number>,
  )
  // Honest report: the canvas bitmap ratio equals 2 here, not an assumption.
  expect(stats.devicePixelRatio).toBe(2)
  expect(stats.pixelRatio).toBe(2)
  expect(Math.abs(stats.lastFrameFillXMax - stats.plotWidthCss)).toBeLessThanOrEqual(1)

  const bars = await page.evaluate(() => window.__liquidationLevelsHarness.lastFrameBars())
  expect(bars.length).toBeGreaterThan(0)
  for (const bar of bars) {
    // Bars are reported in CSS px by dividing with the canvas's real ratio.
    expect(Math.abs(bar.x + bar.w - stats.plotWidthCss)).toBeLessThanOrEqual(1)
    expect(bar.y).toBeGreaterThanOrEqual(0)
    expect(bar.y + bar.h).toBeLessThanOrEqual(stats.paneHeightCss + 1)
  }

  const bitmap = await page.evaluate(() => {
    const canvases = Array.from(document.querySelectorAll('canvas'))
    return canvases.map((canvas) => canvas.width / (canvas.clientWidth || canvas.width))
  })
  expect(bitmap.some((ratio) => ratio === 2)).toBe(true)
})
