import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildLiquidationLevelsProfile,
  hitTestLiquidationLevelsProfile,
  liquidationLevelsMaxBarWidthPx,
  liquidationLevelsRowPriceBand,
  LIQUIDATION_LEVELS_MAX_ROWS,
  type LiquidationLevelsProfile,
} from './liquidationLevelsProfileGeometry.ts'
import type { LiquidationLevelPosition } from './liquidationLevelsProtocol.ts'

function position(user: string, price: number, size: number): LiquidationLevelPosition {
  return { user, price, size, ts: 1 }
}

function profileOf(
  positions: LiquidationLevelPosition[],
  over: Partial<{ topPrice: number; bottomPrice: number; paneHeight: number }> = {},
): LiquidationLevelsProfile {
  return buildLiquidationLevelsProfile({
    positions,
    topPrice: over.topPrice ?? 200,
    bottomPrice: over.bottomPrice ?? 100,
    paneHeight: over.paneHeight ?? 200,
  })
}

describe('liquidation level profile geometry', () => {
  it('shares one magnitude scale between the long and the short side', () => {
    const profile = profileOf([
      position('long', 150, 10),
      position('short', 120, -10),
    ])
    const longRow = profile.rows.find((row) => row.long > 0)
    const shortRow = profile.rows.find((row) => row.short > 0)
    assert.ok(longRow && shortRow)
    assert.equal(longRow.long, 10)
    assert.equal(shortRow.short, 10)
    assert.equal(longRow.longFraction, 1)
    assert.equal(shortRow.shortFraction, 1)
    assert.equal(profile.domain, 10)
  })

  it('keeps the largest row at full bar extent and smaller rows proportional', () => {
    const profile = profileOf([
      position('a', 150, 12),
      position('b', 140, 3),
    ])
    const largest = profile.rows.find((row) => row.long === 12)
    const smaller = profile.rows.find((row) => row.long === 3)
    assert.ok(largest && smaller)
    assert.equal(largest.longFraction, 1)
    assert.equal(smaller.longFraction, 0.25)
  })

  it('maps the highest price to the top row and counts both sides per row', () => {
    const profile = profileOf([
      position('top', 199.9, 2),
      position('same', 150, 1),
      position('same-side', 150, -3),
    ])
    assert.equal(profile.topRow, 0)
    const top = profile.rows.find((row) => row.row === 0)
    assert.ok(top)
    assert.ok(top.priceHigh > top.priceLow)
    const middle = profile.rows.find((row) => row.count === 2)
    assert.ok(middle)
    assert.equal(middle.long, 1)
    assert.equal(middle.short, 3)
    assert.equal(middle.count, 2)
    assert.equal(middle.longFraction, 1 / 3)
    assert.equal(middle.shortFraction, 1)
  })

  it('ignores positions outside the visible price band and unusable rows', () => {
    const profile = profileOf([
      position('visible', 150, 1),
      position('above', 250, 5),
      position('below', 50, 5),
      position('zero', 150, 0),
      position('nan', Number.NaN, 1),
      position('infinite', 150, Number.POSITIVE_INFINITY),
    ])
    assert.equal(profile.visibleCount, 1)
    assert.equal(profile.domain, 1)
    assert.equal(profile.rows.length, 1)
  })

  it('bins by the visible price window, not by the book size', () => {
    const positions: LiquidationLevelPosition[] = []
    for (let index = 0; index < 2_000; index += 1) {
      positions.push(position(`p${index}`, 101 + (index % 100), 1))
    }
    const profile = profileOf(positions, { paneHeight: 200 })
    assert.equal(profile.visibleCount, 2_000)
    assert.ok(profile.rows.length <= 200)
  })

  it('covers the whole pane when the row cap applies', () => {
    const profile = buildLiquidationLevelsProfile({
      positions: [position('top', 199.999, 1), position('bottom', 100, 2)],
      topPrice: 200,
      bottomPrice: 100,
      paneHeight: 5_000,
    })
    assert.equal(profile.rowCount, 2_000)
    // Rows grow instead of leaving the bottom of the pane uncovered.
    assert.equal(profile.rowHeight, 2.5)
    assert.equal(profile.rowHeight * profile.rowCount, 5_000)
    assert.equal(profile.topRow, 0)
    assert.equal(profile.bottomRow, 1_999)

    // The bottom price row is mapped to the bottom of the pane, not to y≈1999.
    const bottomBand = liquidationLevelsRowPriceBand(profile, 200, 100, 1_999)
    assert.deepEqual(bottomBand, { min: 100, max: 100.05 })

    const bottomRow = profile.rows.find((row) => row.row === 1_999)
    assert.ok(bottomRow)
    assert.equal(bottomRow.long, 2)
    // Hit testing uses the same derived row height: the pane's last pixels hit
    // the bottom row, and one past the bottom does not.
    const hitArgs = { profile, plotWidth: 800, maxWidthPercent: 25 }
    assert.equal(
      hitTestLiquidationLevelsProfile({ ...hitArgs, x: 800, y: 1_999 * 2.5 + 0.1 })?.row,
      1_999,
    )
    assert.equal(
      hitTestLiquidationLevelsProfile({ ...hitArgs, x: 800, y: 5_000 - 0.1 })?.row,
      1_999,
    )
    assert.equal(
      hitTestLiquidationLevelsProfile({ ...hitArgs, x: 800, y: 5_000 }),
      null,
    )
  })

  it('keeps one-CSS-pixel rows on a normal pane', () => {
    const profile = buildLiquidationLevelsProfile({
      positions: [position('a', 150, 1)],
      topPrice: 200,
      bottomPrice: 100,
      paneHeight: 400,
    })
    assert.equal(profile.rowCount, 400)
    assert.equal(profile.rowHeight, 1)
    assert.equal(profile.rowHeight * profile.rowCount, 400)
  })

  it('caps the row count and returns an empty profile for unusable conversions', () => {
    const rows = Array.from({ length: 5 }, (_, index) =>
      position(`p${index}`, 150 + index, 1),
    )
    const tall = profileOf(rows, { paneHeight: 20_000 })
    assert.ok(tall.rowCount <= LIQUIDATION_LEVELS_MAX_ROWS)
    assert.deepEqual(
      profileOf(rows, { topPrice: 100, bottomPrice: 100 }).rows,
      [],
    )
    assert.deepEqual(profileOf(rows, { paneHeight: 0 }).rows, [])
    assert.deepEqual(profileOf(rows, { topPrice: Number.NaN }).rows, [])
  })

  it('derives the row price band from the same conversion as the paint', () => {
    const profile = profileOf([], { topPrice: 200, bottomPrice: 100, paneHeight: 200 })
    const band = liquidationLevelsRowPriceBand(profile, 200, 100, 100)
    assert.deepEqual(band, { min: 149.5, max: 150 })
    const topBand = liquidationLevelsRowPriceBand(profile, 200, 100, 0)
    assert.deepEqual(topBand, { min: 199.5, max: 200 })
  })

  it('anchors bars to the right edge and hit-tests only the drawn extent', () => {
    const profile = profileOf([
      position('a', 150, 10),
      position('b', 140, 5),
    ])
    const row = profile.rows.find((item) => item.long === 10)
    assert.ok(row)
    assert.equal(liquidationLevelsMaxBarWidthPx(800, 25), 200)
    assert.equal(liquidationLevelsMaxBarWidthPx(800, 0), 8) // clamped to 1%
    assert.equal(liquidationLevelsMaxBarWidthPx(800, 500), 800)

    const y = row.row + 0.5
    assert.ok(
      hitTestLiquidationLevelsProfile({
        profile,
        x: 800,
        y,
        plotWidth: 800,
        maxWidthPercent: 25,
      }),
    )
    assert.ok(
      hitTestLiquidationLevelsProfile({
        profile,
        x: 601,
        y,
        plotWidth: 800,
        maxWidthPercent: 25,
      }),
    )
    // Just outside the bar's left edge, or over candles: no hit.
    assert.equal(
      hitTestLiquidationLevelsProfile({
        profile,
        x: 599,
        y,
        plotWidth: 800,
        maxWidthPercent: 25,
      }),
      null,
    )
    // Empty row or outside the pane: no hit.
    assert.equal(
      hitTestLiquidationLevelsProfile({
        profile,
        x: 800,
        y: -1,
        plotWidth: 800,
        maxWidthPercent: 25,
      }),
      null,
    )
    const emptyRow = Array.from({ length: profile.rowCount }, (_, index) => index).find(
      (index) => profile.rows.every((item) => item.row !== index),
    )
    if (emptyRow !== undefined) {
      assert.equal(
        hitTestLiquidationLevelsProfile({
          profile,
          x: 800,
          y: emptyRow + 0.5,
          plotWidth: 800,
          maxWidthPercent: 25,
        }),
        null,
      )
    }
  })

  it('returns the same profile shape when nothing is visible', () => {
    const profile = profileOf([])
    assert.deepEqual(profile.rows, [])
    assert.equal(profile.topRow, -1)
    assert.equal(profile.bottomRow, -1)
    assert.equal(profile.domain, 0)
  })
})
