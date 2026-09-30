import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeFixedRangeVolumeProfile,
  normalizeFixedRangeVolumeProfileCandles,
} from './fixedRangeVolumeProfile.ts'
import type { MarketCandle } from './types.ts'

const TICK = 1

function candle(overrides: Partial<MarketCandle> = {}): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_700_000_000,
    open: 100,
    high: 110,
    low: 90,
    close: 105,
    volume: 10,
    closed: true,
    ...overrides,
  }
}

function compute(
  candles: MarketCandle[],
  fromTime: number,
  toTime: number,
  options?: { rowCount?: number; valueAreaPercent?: number; tickSize?: number },
) {
  return computeFixedRangeVolumeProfile({
    candles,
    fromTime,
    toTime,
    rowCount: options?.rowCount,
    valueAreaPercent: options?.valueAreaPercent,
    tickSize: options?.tickSize ?? TICK,
  })
}

function assertRowsWellFormed(
  rows: ReturnType<typeof computeFixedRangeVolumeProfile>['rows'],
  tickSize: number,
) {
  for (const row of rows) {
    assert.ok(row.priceHigh > row.priceLow)
    assert.ok(row.priceHigh - row.priceLow > 0)
  }
  for (let index = 1; index < rows.length; index += 1) {
    assert.ok(Math.abs(rows[index].priceLow - rows[index - 1].priceHigh) <= tickSize * 1e-6)
  }
}

function assertFiniteResult(result: ReturnType<typeof computeFixedRangeVolumeProfile>) {
  const numbers = [
    result.profileLow,
    result.profileHigh,
    result.rowHeight,
    result.totalVolume,
    result.valueAreaVolume,
    result.valueAreaPercentAchieved,
    ...result.rows.flatMap((row) => [
      row.priceLow,
      row.priceHigh,
      row.upVolume,
      row.downVolume,
      row.totalVolume,
    ]),
  ]
  if (result.pocPrice !== null) numbers.push(result.pocPrice)
  if (result.pocVolume !== null) numbers.push(result.pocVolume)
  if (result.vah !== null) numbers.push(result.vah)
  if (result.val !== null) numbers.push(result.val)
  for (const value of numbers) {
    assert.equal(Number.isFinite(value), true)
    assert.equal(Number.isNaN(value), false)
  }
}

describe('computeFixedRangeVolumeProfile', () => {
  it('returns empty result for empty candle list', () => {
    const result = compute([], 1, 2)
    assert.equal(result.candleCount, 0)
    assert.equal(result.rows.length, 0)
    assert.equal(result.pocRowIndex, null)
    assert.equal(result.vah, null)
    assert.equal(result.val, null)
  })

  it('applies inclusive selected time range', () => {
    const candles = [
      candle({ time: 10, low: 100, high: 100, volume: 1 }),
      candle({ time: 20, low: 100, high: 100, volume: 2 }),
      candle({ time: 30, low: 100, high: 100, volume: 3 }),
    ]
    const result = compute(candles, 20, 20)
    assert.equal(result.fromTime, 20)
    assert.equal(result.toTime, 20)
    assert.equal(result.candleCount, 1)
    assert.equal(result.totalVolume, 2)
  })

  it('normalizes reversed from/to times', () => {
    const result = compute([candle({ time: 5 })], 20, 10)
    assert.equal(result.fromTime, 10)
    assert.equal(result.toTime, 20)
  })

  it('sorts unsorted input and keeps last duplicate timestamp', () => {
    const input = [
      candle({ time: 30, volume: 1, low: 100, high: 100 }),
      candle({ time: 10, volume: 2, low: 100, high: 100 }),
      candle({ time: 20, volume: 3, low: 100, high: 100 }),
      candle({ time: 20, volume: 9, low: 100, high: 100 }),
    ]
    const copy = input.map((item) => ({ ...item }))
    const result = compute(input, 10, 30, { rowCount: 1 })
    assert.deepEqual(
      normalizeFixedRangeVolumeProfileCandles(copy).map((item) => item.time),
      [10, 20, 30],
    )
    assert.equal(copy[3].volume, 9)
    assert.equal(result.totalVolume, 12)
  })

  it('does not mutate the input candle array', () => {
    const input = [candle({ time: 10, volume: 1 })]
    const before = JSON.stringify(input)
    compute(input, 10, 10)
    assert.equal(JSON.stringify(input), before)
  })

  it('assigns flat candles to a single intersecting row', () => {
    const result = compute(
      [candle({ time: 10, open: 100, close: 101, low: 105, high: 105, volume: 7 })],
      10,
      10,
      { rowCount: 3 },
    )
    assert.equal(result.totalVolume, 7)
    assert.equal(result.rows.reduce((sum, row) => sum + row.upVolume, 0), 7)
  })

  it('conserves volume across multiple rows for ranged candles', () => {
    const result = compute(
      [candle({ time: 10, open: 100, close: 90, low: 100, high: 104, volume: 100 })],
      10,
      10,
      { rowCount: 4 },
    )
    const distributed = result.rows.reduce((sum, row) => sum + row.totalVolume, 0)
    assert.ok(Math.abs(distributed - 100) <= 1e-9)
    assert.equal(result.rows.reduce((sum, row) => sum + row.downVolume, 0), distributed)
  })

  it('classifies up and down volume by candle direction', () => {
    const up = compute(
      [candle({ time: 10, open: 100, close: 110, low: 100, high: 110, volume: 5 })],
      10,
      10,
      { rowCount: 1 },
    )
    const down = compute(
      [candle({ time: 10, open: 110, close: 100, low: 100, high: 110, volume: 5 })],
      10,
      10,
      { rowCount: 1 },
    )
    assert.equal(up.rows[0].upVolume, 5)
    assert.equal(down.rows[0].downVolume, 5)
  })

  it('selects POC at highest total volume row', () => {
    const result = compute(
      [
        candle({ time: 10, low: 100, high: 102, volume: 1 }),
        candle({ time: 11, low: 102, high: 104, volume: 50 }),
        candle({ time: 12, low: 104, high: 106, volume: 1 }),
      ],
      10,
      12,
      { rowCount: 3 },
    )
    assert.notEqual(result.pocRowIndex, null)
    assert.equal(result.pocVolume, result.rows[result.pocRowIndex!].totalVolume)
  })

  it('breaks POC ties toward the lower price row', () => {
    const result = compute(
      [
        candle({ time: 10, low: 100, high: 101, volume: 10 }),
        candle({ time: 11, low: 103, high: 104, volume: 10 }),
      ],
      10,
      11,
      { rowCount: 4 },
    )
    const tiedRows = result.rows.filter((row) => row.totalVolume === 10)
    assert.ok(tiedRows.length >= 2)
    assert.equal(result.pocRowIndex, 0)
    assert.equal(result.rows[0].priceLow, 100)
  })

  it('expands value area to about seventy percent of total volume', () => {
    const result = compute(
      [
        candle({ time: 10, low: 100, high: 101, volume: 10 }),
        candle({ time: 11, low: 101, high: 102, volume: 20 }),
        candle({ time: 12, low: 102, high: 103, volume: 30 }),
        candle({ time: 13, low: 103, high: 104, volume: 40 }),
      ],
      10,
      13,
      { rowCount: 4, valueAreaPercent: 70 },
    )
    assert.ok(result.valueAreaPercentAchieved >= 0.7)
    assert.ok(result.val !== null && result.vah !== null)
    assert.ok(result.val! <= result.vah!)
  })

  it('prefers the upper neighbor on equal adjacent volumes during value area expansion', () => {
    const result = compute(
      [
        candle({ time: 10, low: 100, high: 100, volume: 10 }),
        candle({ time: 11, low: 101, high: 101, volume: 30 }),
        candle({ time: 12, low: 102, high: 102, volume: 10 }),
        candle({ time: 13, low: 103, high: 103, volume: 10 }),
      ],
      10,
      13,
      { rowCount: 4, valueAreaPercent: 70 },
    )
    const pocIndex = result.pocRowIndex!
    assert.equal(pocIndex, 1)
    assert.equal(result.rows[pocIndex + 1].inValueArea, true)
    assert.equal(result.rows[pocIndex - 1].inValueArea, false)
  })

  it('ignores zero-volume candles without producing invalid numbers', () => {
    const result = compute(
      [candle({ time: 10, volume: 0 }), candle({ time: 11, low: 100, high: 101, volume: 4 })],
      10,
      11,
      { rowCount: 2 },
    )
    assert.equal(result.totalVolume, 4)
    assertFiniteResult(result)
  })

  it('never returns NaN or Infinity', () => {
    const result = compute(
      [
        candle({ time: 10, low: 99.2, high: 100.8, open: 100, close: 100.5, volume: 12 }),
        candle({ time: 11, low: 100.1, high: 102.3, open: 101, close: 99.5, volume: 18 }),
      ],
      10,
      11,
      { rowCount: 24, valueAreaPercent: 70, tickSize: 0.1 },
    )
    assertFiniteResult(result)
  })

  it('chooses tick-aligned row height close to requested row count', () => {
    const result = compute(
      [candle({ time: 10, low: 100, high: 124, volume: 10 })],
      10,
      10,
      { rowCount: 24, tickSize: 1 },
    )
    assert.equal(result.rowHeight % 1, 0)
    assert.equal(result.rows.length, 24)
    assert.equal(result.rows[0].priceLow, 100)
    assert.equal(result.rows[result.rows.length - 1].priceHigh, 124)
    assert.ok(result.rows.every((row) => row.totalVolume > 0))
    assert.ok(Math.abs(result.totalVolume - 10) <= 1e-9)
  })

  it('does not add empty upper row for integer range 100–124', () => {
    const result = compute(
      [candle({ time: 10, low: 100, high: 124, volume: 10 })],
      10,
      10,
      { rowCount: 24, tickSize: 1 },
    )
    assert.equal(result.rows.length, 24)
    assert.equal(result.rows[result.rows.length - 1].priceHigh, 124)
    assert.ok(!result.rows.some((row) => row.priceLow === 124 && row.priceHigh === 125))
    assert.ok(Math.abs(result.totalVolume - 10) <= 1e-9)
  })

  it('uses sixteen rows ending at 100.8 for fractional range 99.2–100.8', () => {
    const tickSize = 0.1
    const result = compute(
      [candle({ time: 10, low: 99.2, high: 100.8, open: 100, close: 100, volume: 16 })],
      10,
      10,
      { rowCount: 24, tickSize },
    )
    assert.equal(result.rows.length, 16)
    assert.ok(Math.abs(result.rows[result.rows.length - 1].priceHigh - 100.8) <= tickSize * 1e-6)
    assert.ok(
      !result.rows.some(
        (row) =>
          Math.abs(row.priceLow - 100.8) <= tickSize * 1e-6 &&
          Math.abs(row.priceHigh - 100.9) <= tickSize * 1e-6,
      ),
    )
    assert.ok(result.rows.every((row) => row.totalVolume > 0))
    assert.ok(Math.abs(result.totalVolume - 16) <= 1e-6)
  })

  it('ceil-aligns upper boundary for off-grid high with tick 0.1', () => {
    const tickSize = 0.1
    const result = compute(
      [candle({ time: 10, low: 99.2, high: 100.85, open: 100, close: 100, volume: 20 })],
      10,
      10,
      { rowCount: 24, tickSize },
    )
    assert.ok(Math.abs(result.rows[result.rows.length - 1].priceHigh - 100.9) <= tickSize * 1e-6)
    assert.ok(result.rows[result.rows.length - 1].totalVolume > 0)
    assert.ok(Math.abs(result.totalVolume - 20) <= 1e-6)
  })

  it('builds one tick-tall row for flat profile at fractional tick price 83442.7', () => {
    const tickSize = 0.1
    const result = compute(
      [candle({ time: 10, low: 83442.7, high: 83442.7, volume: 5 })],
      10,
      10,
      { rowCount: 24, tickSize },
    )
    assert.equal(result.rows.length, 1)
    assert.ok(Math.abs(result.rows[0].priceLow - 83442.7) <= tickSize * 1e-6)
    assert.ok(Math.abs(result.rows[0].priceHigh - 83442.8) <= tickSize * 1e-6)
    assert.ok(result.rows[0].priceHigh - result.rows[0].priceLow >= tickSize - tickSize * 1e-6)
    assertRowsWellFormed(result.rows, tickSize)
    assertFiniteResult(result)
  })

  it('builds one positive row for flat profile at 0.3 with tick 0.1', () => {
    const tickSize = 0.1
    const result = compute(
      [candle({ time: 10, low: 0.3, high: 0.3, volume: 2 })],
      10,
      10,
      { rowCount: 24, tickSize },
    )
    assert.equal(result.rows.length, 1)
    assert.ok(Math.abs(result.rows[0].priceLow - 0.3) <= tickSize * 1e-6)
    assert.ok(result.rows[0].priceHigh > result.rows[0].priceLow)
    assertRowsWellFormed(result.rows, tickSize)
  })

  it('avoids zero-height trailing rows for fractional range 99.2–100.8', () => {
    const tickSize = 0.1
    const result = compute(
      [candle({ time: 10, low: 99.2, high: 100.8, open: 100, close: 100, volume: 16 })],
      10,
      10,
      { rowCount: 24, tickSize },
    )
    assertRowsWellFormed(result.rows, tickSize)
    const distributed = result.rows.reduce((sum, row) => sum + row.totalVolume, 0)
    assert.ok(Math.abs(distributed - 16) <= 1e-6)
    assert.ok(Math.abs(result.rows[result.rows.length - 1].priceHigh - 100.8) <= tickSize * 1e-6)
    assert.equal(result.rows.length, 16)
    assertFiniteResult(result)
  })

  it('keeps rows sorted contiguous with positive height for fractional ticks', () => {
    const tickSize = 0.1
    const result = compute(
      [
        candle({ time: 10, low: 99.2, high: 100.8, volume: 8 }),
        candle({ time: 11, low: 100.1, high: 102.3, volume: 12 }),
      ],
      10,
      11,
      { rowCount: 12, tickSize },
    )
    assert.ok(result.rows.length >= 1)
    assertRowsWellFormed(result.rows, tickSize)
  })

  it('selects lower POC row when volumes differ only by floating point noise', () => {
    const result = computeFixedRangeVolumeProfile({
      candles: [
        candle({ time: 10, low: 100, high: 100, volume: 1 / 3 }),
        candle({ time: 11, low: 101, high: 101, volume: 1 / 3 }),
        candle({ time: 12, low: 102, high: 102, volume: 1 / 3 }),
        candle({ time: 13, low: 103, high: 103, volume: 0 }),
      ],
      fromTime: 10,
      toTime: 13,
      rowCount: 3,
      tickSize: 1,
    })
    assert.equal(result.pocRowIndex, 0)
  })

  it('prefers upper neighbor on volume-equal value area expansion with float noise', () => {
    const result = computeFixedRangeVolumeProfile({
      candles: [
        candle({ time: 10, low: 100, high: 100, volume: 10 }),
        candle({ time: 11, low: 101, high: 101, volume: 30 }),
        candle({ time: 12, low: 102, high: 102, volume: 10 + 1e-15 }),
        candle({ time: 13, low: 103, high: 103, volume: 10 }),
      ],
      fromTime: 10,
      toTime: 13,
      rowCount: 4,
      valueAreaPercent: 70,
      tickSize: 1,
    })
    const pocIndex = result.pocRowIndex!
    assert.equal(pocIndex, 1)
    assert.equal(result.rows[pocIndex + 1].inValueArea, true)
    assert.equal(result.rows[pocIndex - 1].inValueArea, false)
  })

  it('returns finite empty result for non-finite time bounds', () => {
    const result = computeFixedRangeVolumeProfile({
      candles: [candle({ time: 10 })],
      fromTime: Number.NaN,
      toTime: Number.POSITIVE_INFINITY,
      tickSize: 1,
    })
    assert.equal(result.candleCount, 0)
    assert.equal(Number.isFinite(result.fromTime), true)
    assert.equal(Number.isFinite(result.toTime), true)
    assertFiniteResult(result)
  })

  it('rejects fractional or zero rowCount with safe empty result', () => {
    const base = [candle({ time: 10, low: 100, high: 101, volume: 1 })]
    for (const rowCount of [0, -1, 1.5]) {
      const result = compute(base, 10, 10, { rowCount })
      assert.equal(result.candleCount, 0)
      assert.equal(result.rows.length, 0)
      assertFiniteResult(result)
    }
  })

  it('handles valueAreaPercent boundaries 0 and 100 and rejects out of range', () => {
    const candles = [
      candle({ time: 10, low: 100, high: 100, volume: 10 }),
      candle({ time: 11, low: 101, high: 101, volume: 20 }),
      candle({ time: 12, low: 102, high: 102, volume: 30 }),
    ]
    const zero = compute(candles, 10, 12, { rowCount: 3, valueAreaPercent: 0 })
    assert.equal(zero.rows[zero.pocRowIndex!].inValueArea, true)
    assert.equal(zero.rows.filter((row) => row.inValueArea).length, 1)

    const full = compute(candles, 10, 12, { rowCount: 3, valueAreaPercent: 100 })
    assert.equal(full.rows.every((row) => row.inValueArea), true)
    assert.ok(Math.abs(full.valueAreaPercentAchieved - 1) <= 1e-9)

    for (const valueAreaPercent of [-1, 101]) {
      const rejected = compute(candles, 10, 12, { rowCount: 3, valueAreaPercent })
      assert.equal(rejected.candleCount, 0)
      assertFiniteResult(rejected)
    }
  })
})
