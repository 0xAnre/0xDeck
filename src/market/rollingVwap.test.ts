import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MS_IN_DAY,
  MS_IN_HOUR,
  MS_IN_MIN,
  RollingVwapConfigError,
  computeRollingVwap,
  computeRollingVwapForInterval,
  fixedTimePeriodWindowMs,
  formatRollingVwapTimePeriodLabel,
  normalizeRollingVwapCandles,
  resolveRollingVwapWindowMs,
  rollingVwapAutoWindowMs,
  validateRollingVwapFixedTimePeriod,
} from './rollingVwap.ts'
import type { MarketCandle } from './types.ts'

function candle(overrides: Partial<MarketCandle> = {}): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_700_000_000,
    open: 1,
    high: 10,
    low: 4,
    close: 7,
    volume: 1,
    closed: true,
    ...overrides,
  }
}

function assertClose(actual: number | null, expected: number, tolerance = 1e-9) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) <= tolerance, `expected ${expected}, got ${actual}`)
}

describe('rollingVwapAutoWindowMs', () => {
  it('maps each supported interval to Pine timeStep windows', () => {
    assert.equal(rollingVwapAutoWindowMs('1m'), MS_IN_HOUR)
    assert.equal(rollingVwapAutoWindowMs('5m'), MS_IN_HOUR * 4)
    assert.equal(rollingVwapAutoWindowMs('30m'), MS_IN_DAY)
    assert.equal(rollingVwapAutoWindowMs('4h'), MS_IN_DAY * 3)
    assert.equal(rollingVwapAutoWindowMs('1d'), Math.trunc(MS_IN_DAY * 30.4375))
    assert.equal(rollingVwapAutoWindowMs('1w'), MS_IN_DAY * 90)
  })
})

describe('fixed time period window', () => {
  it('sums days, hours, and minutes into milliseconds', () => {
    const ms = fixedTimePeriodWindowMs({
      useFixedTimePeriod: true,
      days: 1,
      hours: 2,
      minutes: 30,
    })
    assert.equal(ms, MS_IN_DAY + 2 * MS_IN_HOUR + 30 * MS_IN_MIN)
  })

  it('uses fixed window when useFixedTimePeriod is true', () => {
    const period = { useFixedTimePeriod: true, days: 0, hours: 4, minutes: 0 }
    assert.equal(resolveRollingVwapWindowMs('1m', period), 4 * MS_IN_HOUR)
  })
})

describe('formatRollingVwapTimePeriodLabel', () => {
  it('formats 30.4375 day auto window as 1M', () => {
    const ms = rollingVwapAutoWindowMs('1d')
    assert.equal(formatRollingVwapTimePeriodLabel(ms), '1M')
  })

  it('formats 7 days as 1W', () => {
    assert.equal(formatRollingVwapTimePeriodLabel(MS_IN_DAY * 7), '1W')
  })

  it('formats mixed day hour minute spans', () => {
    const ms = MS_IN_DAY + 2 * MS_IN_HOUR + 30 * MS_IN_MIN
    assert.equal(formatRollingVwapTimePeriodLabel(ms), '1D 2H 30min')
  })
})

describe('computeRollingVwap', () => {
  const largeWindow = MS_IN_DAY

  it('uses hlc3 as the source price', () => {
    const c = candle({ high: 10, low: 4, close: 7, volume: 2 })
    const [point] = computeRollingVwap([c], largeWindow, { minBars: 1 })
    assertClose(point.vwap, 7)
  })

  it('weights VWAP by volume', () => {
    const base = 1_700_000_000
    const candles = [
      candle({ time: base, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: base + 60, high: 20, low: 20, close: 20, volume: 3 }),
    ]
    const [, second] = computeRollingVwap(candles, largeWindow, { minBars: 1 })
    assertClose(second.vwap, 17.5)
  })

  it('matches Pine variance and three band pairs', () => {
    const base = 1_700_000_000
    const candles = [
      candle({ time: base, high: 10, low: 10, close: 10, volume: 2 }),
      candle({ time: base + 60, high: 14, low: 14, close: 14, volume: 4 }),
    ]
    const [, second] = computeRollingVwap(candles, largeWindow, {
      minBars: 1,
      multipliers: { multiplier1: 1, multiplier2: 2, multiplier3: 3 },
    })
    const vwap = 76 / 6
    const variance = 984 / 6 - vwap * vwap
    const stdev = Math.sqrt(variance)
    assertClose(second.vwap, vwap)
    assertClose(second.stdev, stdev)
    assertClose(second.upper1, vwap + stdev)
    assertClose(second.lower1, vwap - stdev)
    assertClose(second.upper2, vwap + 2 * stdev)
    assertClose(second.lower2, vwap - 2 * stdev)
    assertClose(second.upper3, vwap + 3 * stdev)
    assertClose(second.lower3, vwap - 3 * stdev)
  })

  it('drops candles outside the rolling time window', () => {
    const t0 = 2_000_000
    const windowMs = MS_IN_HOUR
    const candles = [
      candle({ time: t0, high: 100, low: 100, close: 100, volume: 1 }),
      candle({ time: t0 + 1800, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: t0 + 3600, high: 20, low: 20, close: 20, volume: 1 }),
      candle({ time: t0 + 5400, high: 30, low: 30, close: 30, volume: 1 }),
    ]
    const [, , , last] = computeRollingVwap(candles, windowMs, { minBars: 1 })
    assertClose(last.vwap, 20)
  })

  it('keeps minBars newest candles even when outside the time window', () => {
    const t0 = 3_000_000
    const windowMs = 60_000
    const candles = [
      candle({ time: t0, high: 1, low: 1, close: 1, volume: 1 }),
      candle({ time: t0 + 100_000, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: t0 + 100_060, high: 20, low: 20, close: 20, volume: 1 }),
      candle({ time: t0 + 100_120, high: 30, low: 30, close: 30, volume: 1 }),
    ]
    const [, , , last] = computeRollingVwap(candles, windowMs, { minBars: 3 })
    assertClose(last.vwap, 20)
  })

  it('preserves minBars across an irregular large gap', () => {
    const t0 = 4_000_000
    const windowMs = 30_000
    const candles = [
      candle({ time: t0, high: 5, low: 5, close: 5, volume: 2 }),
      candle({ time: t0 + 500_000, high: 50, low: 50, close: 50, volume: 1 }),
      candle({ time: t0 + 500_060, high: 60, low: 60, close: 60, volume: 1 }),
    ]
    const [, , last] = computeRollingVwap(candles, windowMs, { minBars: 2 })
    assertClose(last.vwap, 55)
  })

  it('uses the last candle for duplicate timestamps', () => {
    const t = 5_000_000
    const candles = [
      candle({ time: t, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: t, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    const [point] = computeRollingVwap(candles, largeWindow, { minBars: 1 })
    assertClose(point.vwap, 20)
  })

  it('normalizes unsorted input', () => {
    const t0 = 6_000_000
    const candles = [
      candle({ time: t0 + 120, high: 30, low: 30, close: 30, volume: 1 }),
      candle({ time: t0, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: t0 + 60, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    const [, , last] = computeRollingVwap(candles, largeWindow, { minBars: 1 })
    assertClose(last.vwap, 20)
  })

  it('does not mutate the input array', () => {
    const t0 = 6_100_000
    const input = [
      candle({ time: t0 + 60, high: 20, low: 20, close: 20, volume: 1 }),
      candle({ time: t0, high: 10, low: 10, close: 10, volume: 1 }),
    ]
    const snapshot = input.map((c) => ({ ...c }))
    computeRollingVwap(input, largeWindow, { minBars: 1 })
    assert.deepEqual(input, snapshot)
  })

  it('returns null metrics when volume sums to zero', () => {
    const c = candle({ volume: 0 })
    const [point] = computeRollingVwap([c], largeWindow, { minBars: 1 })
    assert.equal(point.vwap, null)
    assert.equal(point.stdev, null)
    assert.equal(point.upper1, null)
    assert.ok(!Number.isNaN(point.vwap as unknown as number))
  })

  it('keeps bands equal to vwap when multipliers are zero', () => {
    const base = 7_000_000
    const candles = [
      candle({ time: base, high: 8, low: 8, close: 8, volume: 2 }),
      candle({ time: base + 60, high: 12, low: 12, close: 12, volume: 2 }),
    ]
    const [, second] = computeRollingVwap(candles, largeWindow, { minBars: 1 })
    assertClose(second.vwap, 10)
    assertClose(second.upper1, 10)
    assertClose(second.lower3, 10)
  })

  it('returns an empty array for empty input', () => {
    assert.deepEqual(computeRollingVwap([], largeWindow), [])
    assert.deepEqual(computeRollingVwapForInterval([], '1m'), [])
  })
})

describe('validateRollingVwapFixedTimePeriod', () => {
  it('rejects invalid hour and minute fields', () => {
    assert.throws(
      () =>
        validateRollingVwapFixedTimePeriod({
          useFixedTimePeriod: true,
          days: 1,
          hours: 24,
          minutes: 0,
        }),
      RollingVwapConfigError,
    )
    assert.throws(
      () =>
        validateRollingVwapFixedTimePeriod({
          useFixedTimePeriod: true,
          days: 0,
          hours: 0,
          minutes: 60,
        }),
      RollingVwapConfigError,
    )
    assert.throws(
      () =>
        validateRollingVwapFixedTimePeriod({
          useFixedTimePeriod: true,
          days: 0,
          hours: 0,
          minutes: 0,
        }),
      RollingVwapConfigError,
    )
  })
})

describe('normalizeRollingVwapCandles', () => {
  it('sorts and deduplicates without mutating input', () => {
    const input = [
      candle({ time: 3, volume: 1 }),
      candle({ time: 1, volume: 1 }),
      candle({ time: 3, volume: 9 }),
    ]
    const copy = input.map((c) => ({ ...c }))
    const normalized = normalizeRollingVwapCandles(input)
    assert.deepEqual(input, copy)
    assert.deepEqual(normalized.map((c) => c.time), [1, 3])
    assert.equal(normalized[1].volume, 9)
  })
})
