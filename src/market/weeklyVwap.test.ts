import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeWeeklyVwap, utcWeekKey } from './weeklyVwap.ts'
import type { MarketCandle } from './types.ts'

function candle(overrides: Partial<MarketCandle> = {}): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_704_067_200,
    open: 1,
    high: 10,
    low: 4,
    close: 7,
    volume: 5,
    closed: true,
    ...overrides,
  }
}

function assertClose(actual: number | null, expected: number, tolerance = 1e-9) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) <= tolerance, `expected ${expected}, got ${actual}`)
}

/** Monday 2024-01-01 00:00:00 UTC (week A opens). */
const WEEK_A_MONDAY = Math.floor(Date.UTC(2024, 0, 1, 0, 0, 0) / 1000)

/** Sunday 2024-01-07 23:00:00 UTC (still week A). */
const WEEK_A_SUNDAY_LATE = Math.floor(Date.UTC(2024, 0, 7, 23, 0, 0) / 1000)

/** Monday 2024-01-08 00:00:00 UTC (week B opens). */
const WEEK_B_MONDAY = Math.floor(Date.UTC(2024, 0, 8, 0, 0, 0) / 1000)

/** Monday 2024-12-30 00:00:00 UTC (week spanning year end). */
const YEAR_END_WEEK_MONDAY = Math.floor(Date.UTC(2024, 11, 30, 0, 0, 0) / 1000)

/** Wednesday 2025-01-01 12:00:00 UTC (same week as Dec 30 Monday). */
const YEAR_END_WEEK_WED = Math.floor(Date.UTC(2025, 0, 1, 12, 0, 0) / 1000)

/** Monday 2025-01-06 00:00:00 UTC (first week fully in 2025). */
const YEAR_START_WEEK_MONDAY = Math.floor(Date.UTC(2025, 0, 6, 0, 0, 0) / 1000)

describe('utcWeekKey', () => {
  it('groups Sunday late and following Monday 00:00 UTC into different weeks', () => {
    assert.equal(utcWeekKey(WEEK_A_SUNDAY_LATE), utcWeekKey(WEEK_A_MONDAY))
    assert.notEqual(utcWeekKey(WEEK_A_SUNDAY_LATE), utcWeekKey(WEEK_B_MONDAY))
  })
})

describe('computeWeeklyVwap', () => {
  it('single candle VWAP equals hlc3', () => {
    const c = candle({ time: WEEK_A_MONDAY + 60, high: 10, low: 4, close: 7, volume: 5 })
    const [point] = computeWeeklyVwap([c])
    assertClose(point.vwap, 7)
    assertClose(point.upper1, 7)
    assertClose(point.lower1, 7)
    assert.equal(point.previousVwap, null)
  })

  it('weights VWAP by volume across candles', () => {
    const candles = [
      candle({ time: WEEK_A_MONDAY + 60, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: WEEK_A_MONDAY + 120, high: 20, low: 20, close: 20, volume: 3 }),
    ]
    const [, second] = computeWeeklyVwap(candles)
    assertClose(second.vwap, 17.5)
  })

  it('matches Pine variance and band formulas', () => {
    const candles = [
      candle({ time: WEEK_A_MONDAY + 60, high: 10, low: 10, close: 10, volume: 2 }),
      candle({ time: WEEK_A_MONDAY + 120, high: 14, low: 14, close: 14, volume: 4 }),
    ]
    const [, second] = computeWeeklyVwap(candles)
    const vwap = 76 / 6
    const variance = 984 / 6 - vwap * vwap
    const stdev = Math.sqrt(variance)
    assertClose(second.vwap, vwap)
    assertClose(second.upper1, vwap + stdev)
    assertClose(second.lower1, vwap - stdev)
    assertClose(second.upper2, vwap + 2 * stdev)
    assertClose(second.lower2, vwap - 2 * stdev)
  })

  it('resets cumulative totals at Monday 00:00 UTC after Sunday', () => {
    const candles = [
      candle({ time: WEEK_A_SUNDAY_LATE, high: 30, low: 30, close: 30, volume: 2 }),
      candle({ time: WEEK_B_MONDAY + 60, high: 10, low: 10, close: 10, volume: 1 }),
    ]
    const [, firstOfWeekB] = computeWeeklyVwap(candles)
    assertClose(firstOfWeekB.vwap, 10)
  })

  it('carries previous week final bands into the new UTC week', () => {
    const candles = [
      candle({ time: WEEK_A_MONDAY + 60, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: WEEK_A_MONDAY + 120, high: 20, low: 20, close: 20, volume: 1 }),
      candle({ time: WEEK_B_MONDAY + 60, high: 5, low: 5, close: 5, volume: 2 }),
      candle({ time: WEEK_B_MONDAY + 120, high: 5, low: 5, close: 5, volume: 2 }),
    ]
    const points = computeWeeklyVwap(candles)
    const lastWeekA = points[1]
    const firstWeekB = points[2]
    const secondWeekB = points[3]

    assertClose(firstWeekB.previousVwap, lastWeekA.vwap)
    assertClose(firstWeekB.previousUpper1, lastWeekA.upper1)
    assertClose(firstWeekB.previousLower2, lastWeekA.lower2)
    assertClose(secondWeekB.previousVwap, lastWeekA.vwap)
    assertClose(secondWeekB.previousUpper1, lastWeekA.upper1)
  })

  it('keeps previous values fixed for every candle in the new week', () => {
    const candles = [
      candle({ time: WEEK_A_MONDAY + 60, high: 12, low: 12, close: 12, volume: 1 }),
      candle({ time: WEEK_B_MONDAY + 60, high: 8, low: 8, close: 8, volume: 1 }),
      candle({ time: WEEK_B_MONDAY + 3600, high: 9, low: 9, close: 9, volume: 1 }),
    ]
    const points = computeWeeklyVwap(candles)
    const [, firstB, secondB] = points
    assert.deepEqual(
      {
        previousVwap: firstB.previousVwap,
        previousUpper1: firstB.previousUpper1,
        previousLower1: firstB.previousLower1,
      },
      {
        previousVwap: secondB.previousVwap,
        previousUpper1: secondB.previousUpper1,
        previousLower1: secondB.previousLower1,
      },
    )
  })

  it('leaves previous values null on the first available week', () => {
    const [point] = computeWeeklyVwap([candle({ time: WEEK_A_MONDAY + 60 })])
    assert.equal(point.previousVwap, null)
    assert.equal(point.previousUpper1, null)
    assert.equal(point.previousLower2, null)
  })

  it('groups year-end and year-start candles in the correct UTC weeks', () => {
    const candles = [
      candle({ time: YEAR_END_WEEK_WED, high: 40, low: 40, close: 40, volume: 1 }),
      candle({ time: YEAR_START_WEEK_MONDAY + 60, high: 10, low: 10, close: 10, volume: 1 }),
    ]
    const [, firstNewYearWeek] = computeWeeklyVwap(candles)
    assertClose(firstNewYearWeek.vwap, 10)
    assertClose(firstNewYearWeek.previousVwap, 40)
    assert.equal(utcWeekKey(YEAR_END_WEEK_WED), utcWeekKey(YEAR_END_WEEK_MONDAY))
    assert.notEqual(utcWeekKey(YEAR_END_WEEK_WED), utcWeekKey(YEAR_START_WEEK_MONDAY))
  })

  it('does not produce NaN or Infinity when cumulative volume is zero', () => {
    const [point] = computeWeeklyVwap([candle({ time: WEEK_A_MONDAY + 60, volume: 0 })])
    assert.equal(point.vwap, null)
    assert.equal(point.upper1, null)
    assert.equal(point.lower2, null)
  })

  it('does not double-count when the same timestamp is updated', () => {
    const time = WEEK_A_MONDAY + 60
    const candles = [
      candle({ time, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time, high: 20, low: 20, close: 20, volume: 3 }),
    ]
    const [point] = computeWeeklyVwap(candles)
    assertClose(point.vwap, 20)
  })

  it('normalizes unsorted input to ascending unique times', () => {
    const candles = [
      candle({ time: WEEK_A_MONDAY + 120, high: 20, low: 20, close: 20, volume: 1 }),
      candle({ time: WEEK_A_MONDAY + 60, high: 10, low: 10, close: 10, volume: 1 }),
    ]
    const points = computeWeeklyVwap(candles)
    assert.equal(points.length, 2)
    assert.ok(points[0].time < points[1].time)
    assertClose(points[1].vwap, 15)
  })

  it('does not mutate the input candle array', () => {
    const candles = [candle({ time: WEEK_A_MONDAY + 60 })]
    const snapshot = JSON.stringify(candles)
    computeWeeklyVwap(candles)
    assert.equal(JSON.stringify(candles), snapshot)
  })
})
