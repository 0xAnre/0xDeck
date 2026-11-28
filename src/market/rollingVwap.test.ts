import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  DEFAULT_ROLLING_VWAP_BAND_PERCENTAGES,
  DEFAULT_ROLLING_VWAP_BAND_TYPE,
  MAX_ROLLING_VWAP_BAND_PERCENTAGE,
  MS_IN_DAY,
  MS_IN_HOUR,
  MS_IN_MIN,
  RollingVwapConfigError,
  computeRollingVwap,
  computeRollingVwapForInterval,
  fixedTimePeriodWindowMs,
  formatRollingVwapTimePeriodLabel,
  isRollingVwapBandPercentage,
  isRollingVwapBandType,
  normalizeRollingVwapCandles,
  resolveRollingVwapWindowMs,
  rollingVwapAutoWindowMs,
  sanitizeRollingVwapBandPercentages,
  sanitizeRollingVwapBandType,
  validateRollingVwapBandPercentages,
  validateRollingVwapFixedTimePeriod,
  validateRollingVwapStdevMultipliers,
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
    assert.equal(rollingVwapAutoWindowMs('15m'), MS_IN_DAY)
    assert.equal(rollingVwapAutoWindowMs('30m'), MS_IN_DAY)
    assert.equal(rollingVwapAutoWindowMs('1h'), MS_IN_DAY)
    assert.equal(rollingVwapAutoWindowMs('2h'), MS_IN_DAY * 3)
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

  it('with zero window keeps only minBars newest bars', () => {
    const t0 = 8_000_000
    const candles = Array.from({ length: 5 }, (_, i) =>
      candle({ time: t0 + i * 60, high: i + 1, low: i + 1, close: i + 1, volume: 1 }),
    )
    const last = computeRollingVwap(candles, 0, { minBars: 3 }).at(-1)!
    assertClose(last.vwap, 4)
  })

  it('with zero window uses all bars when fewer than minBars exist', () => {
    const t0 = 8_100_000
    const candles = [
      candle({ time: t0, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: t0 + 60, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    const last = computeRollingVwap(candles, 0, { minBars: 3 }).at(-1)!
    assertClose(last.vwap, 15)
  })

  it('includes the bar exactly at currentTime minus window', () => {
    const windowMs = MS_IN_HOUR
    const boundary = 1_000_000
    const current = boundary + windowMs / 1000
    const candles = [
      candle({ time: boundary - 1, high: 1, low: 1, close: 1, volume: 1 }),
      candle({ time: boundary, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: current, high: 30, low: 30, close: 30, volume: 1 }),
    ]
    const last = computeRollingVwap(candles, windowMs, { minBars: 1 }).at(-1)!
    assertClose(last.vwap, 20)
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
  })

  it('allows fixed zero day hour minute (0ms window)', () => {
    const period = { useFixedTimePeriod: true, days: 0, hours: 0, minutes: 0 }
    validateRollingVwapFixedTimePeriod(period)
    assert.equal(resolveRollingVwapWindowMs('1m', period), 0)
  })
})

describe('validateRollingVwapStdevMultipliers', () => {
  const base = { multiplier1: 0, multiplier2: 0, multiplier3: 0 }

  it('rejects a negative value at each multiplier position', () => {
    for (const key of ['multiplier1', 'multiplier2', 'multiplier3'] as const) {
      assert.throws(
        () => validateRollingVwapStdevMultipliers({ ...base, [key]: -0.5 }),
        RollingVwapConfigError,
      )
    }
  })

  it('rejects NaN and infinite multipliers', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      assert.throws(
        () => validateRollingVwapStdevMultipliers({ ...base, multiplier2: bad }),
        RollingVwapConfigError,
      )
    }
  })

  it('accepts zero and positive fractional multipliers', () => {
    validateRollingVwapStdevMultipliers(base)
    validateRollingVwapStdevMultipliers({ multiplier1: 1.5, multiplier2: 0, multiplier3: 2.5 })
    const t0 = 9_000_000
    const candles = [
      candle({ time: t0, high: 8, low: 8, close: 8, volume: 2 }),
      candle({ time: t0 + 60, high: 12, low: 12, close: 12, volume: 2 }),
    ]
    const [, second] = computeRollingVwap(candles, MS_IN_DAY, {
      minBars: 1,
      multipliers: { multiplier1: 1.5, multiplier2: 0, multiplier3: 0 },
    })
    assertClose(second.vwap, 10)
    assertClose(second.upper1, second.vwap! + second.stdev! * 1.5)
    assertClose(second.upper2, second.vwap)
  })
})

/**
 * Fixed 16-bar fixture with one zero-volume bar (index 5) and a large price
 * range, used to pin the pre-#282 standard-deviation output exactly and to
 * exercise percentage bands on the same rolling sums.
 */
function parityCandles(): MarketCandle[] {
  const start = 1_700_000_000
  const base = [42000, 42100, 41950, 42300, 42150, 42025, 42400, 42250]
  return Array.from({ length: 16 }, (_, index) => {
    const close = base[index % base.length] + index * 7
    return candle({
      interval: '1h',
      time: start + index * 3600,
      open: close,
      high: close + 55,
      low: close - 45,
      close: close + 10,
      volume: index === 5 ? 0 : 12 + index * 3.5,
    })
  })
}

describe('rolling VWAP standard-deviation compatibility', () => {
  it('keeps the pre-#282 standard-deviation outputs bit-for-bit', () => {
    const points = computeRollingVwapForInterval(parityCandles(), '1h', undefined, {
      minBars: 3,
      multipliers: { multiplier1: 1, multiplier2: 2, multiplier3: 0.5 },
    })
    assert.equal(points.length, 16)
    // Snapshot produced from the pre-#282 implementation (a4be022), so any
    // arithmetic drift in the legacy band offsets fails here.
    assert.deepEqual([points[0], points[5], points[15]], [
      {
        time: 1_700_000_000,
        vwap: 42006.666666666664,
        stdev: 0.00048828125,
        upper1: 42006.667154947914,
        lower1: 42006.666178385414,
        upper2: 42006.667643229164,
        lower2: 42006.665690104164,
        upper3: 42006.66691080729,
        lower3: 42006.66642252604,
      },
      {
        time: 1_700_018_000,
        vwap: 42141.666666666664,
        stdev: 130.29985660719282,
        upper1: 42271.966523273855,
        lower1: 42011.36681005947,
        upper2: 42402.266379881046,
        lower2: 41881.06695345228,
        upper3: 42206.81659497026,
        lower3: 42076.51673836307,
      },
      {
        time: 1_700_054_000,
        vwap: 42247.37911301859,
        stdev: 159.2247815106235,
        upper1: 42406.60389452922,
        lower1: 42088.15433150797,
        upper2: 42565.82867603984,
        lower2: 41928.929549997345,
        upper3: 42326.991503773905,
        lower3: 42167.76672226328,
      },
    ])
  })

  it('stays the default and ignores percentage distances in stdev mode', () => {
    const withPercentages = computeRollingVwapForInterval(parityCandles(), '1h', undefined, {
      minBars: 3,
      multipliers: { multiplier1: 1, multiplier2: 2, multiplier3: 0.5 },
      bandType: 'stdev',
      percentages: { band1: 7, band2: 12.5, band3: 40 },
    })
    const withoutPercentages = computeRollingVwapForInterval(parityCandles(), '1h', undefined, {
      minBars: 3,
      multipliers: { multiplier1: 1, multiplier2: 2, multiplier3: 0.5 },
    })
    assert.deepEqual(withPercentages, withoutPercentages)
  })
})

describe('rolling VWAP percentage bands', () => {
  /** Two-bar fixture whose volume-weighted VWAP is exactly 76 / 6. */
  function knownVwapCandles(): MarketCandle[] {
    const base = 1_700_000_000
    return [
      candle({ time: base, high: 10, low: 10, close: 10, volume: 2 }),
      candle({ time: base + 60, high: 14, low: 14, close: 14, volume: 4 }),
    ]
  }

  it('places all three pairs at VWAP * (1 +/- p/100), not at stdev or candle price', () => {
    const vwap = 76 / 6
    const [, point] = computeRollingVwap(knownVwapCandles(), MS_IN_DAY, {
      minBars: 1,
      bandType: 'percentage',
      percentages: { band1: 2.5, band2: 5, band3: 10 },
    })
    assertClose(point.vwap, vwap)
    const pairs = [
      ['upper1', 'lower1', 2.5],
      ['upper2', 'lower2', 5],
      ['upper3', 'lower3', 10],
    ] as const
    for (const [upperKey, lowerKey, distance] of pairs) {
      // Independent oracle: the accepted percentage formula around the known VWAP.
      assertClose(point[upperKey], vwap * (1 + distance / 100))
      assertClose(point[lowerKey], vwap * (1 - distance / 100))
    }
    // Not a percentage of the candle price (the last high is 14) ...
    assert.notEqual(point.upper3, 14 * (1 + 10 / 100))
    // ... and not the standard-deviation offsets either.
    const [, stdevPoint] = computeRollingVwap(knownVwapCandles(), MS_IN_DAY, {
      minBars: 1,
      multipliers: { multiplier1: 2.5, multiplier2: 5, multiplier3: 10 },
    })
    assert.notEqual(point.upper1, stdevPoint.upper1)
    // The VWAP/stdev centre math is untouched by the band type.
    assert.equal(point.vwap, stdevPoint.vwap)
    assert.equal(point.stdev, stdevPoint.stdev)
  })

  it('handles zero, fractional and maximum distances, ordering the pairs', () => {
    const vwap = 76 / 6
    const [, point] = computeRollingVwap(knownVwapCandles(), MS_IN_DAY, {
      minBars: 1,
      bandType: 'percentage',
      percentages: { band1: 0, band2: 0.125, band3: MAX_ROLLING_VWAP_BAND_PERCENTAGE },
    })
    // A 0 distance collapses that pair onto the centre (visibility hides it).
    assertClose(point.upper1, vwap)
    assertClose(point.lower1, vwap)
    assertClose(point.upper2, vwap * (1 + 0.125 / 100))
    assertClose(point.lower2, vwap * (1 - 0.125 / 100))
    assertClose(point.upper3, vwap * 2)
    assertClose(point.lower3, 0)
    assert.ok(point.upper3! > point.upper2!)
    assert.ok(point.upper2! > point.vwap!)
    assert.ok(point.lower1! > point.lower2!)
    assert.ok(point.lower2! > point.lower3!)
  })

  it('keeps warmup, gaps and zero-volume null points identical to stdev mode', () => {
    const start = 5_000_000
    const candles = [
      candle({ time: start, high: 10, low: 10, close: 10, volume: 0 }),
      candle({ time: start + 60, high: 20, low: 20, close: 20, volume: 1 }),
      // Large irregular gap: no candles during this window.
      candle({ time: start + 3_600_000, high: 40, low: 40, close: 40, volume: 2 }),
      candle({ time: start + 3_600_060, high: 30, low: 30, close: 30, volume: 0 }),
      candle({ time: start + 3_600_120, high: 50, low: 50, close: 50, volume: 3 }),
    ]
    const stdev = computeRollingVwap(candles, MS_IN_DAY, { minBars: 2 })
    const percentage = computeRollingVwap(candles, MS_IN_DAY, {
      minBars: 2,
      bandType: 'percentage',
      percentages: { band1: 1, band2: 2, band3: 3 },
    })
    assert.deepEqual(
      percentage.map((point) => [point.time, point.vwap, point.stdev]),
      stdev.map((point) => [point.time, point.vwap, point.stdev]),
    )
    // The zero-volume first bar has no VWAP/stdev, so no band value exists.
    assert.equal(percentage[0].vwap, null)
    for (const key of ['upper1', 'lower1', 'upper2', 'lower2', 'upper3', 'lower3'] as const) {
      assert.equal(percentage[0][key], null, key)
    }
    // Every other fulfilled point shifts purely by the VWAP distance.
    for (const point of percentage.slice(1)) {
      if (point.vwap === null) continue
      assertClose(point.upper1, point.vwap * (1 + 1 / 100))
      assertClose(point.lower3, point.vwap * (1 - 3 / 100))
    }
  })

  it('projects the same value through the interval helper', () => {
    const points = computeRollingVwapForInterval(parityCandles(), '1h', undefined, {
      minBars: 3,
      bandType: 'percentage',
      percentages: { band1: 2, band2: 0, band3: 5 },
    })
    const last = points.at(-1)!
    assertClose(last.upper1, last.vwap! * (1 + 2 / 100))
    assertClose(last.upper2, last.vwap!)
    assertClose(last.lower3, last.vwap! * (1 - 5 / 100))
    assert.equal(last.stdev, computeRollingVwap(parityCandles(), MS_IN_DAY, { minBars: 3 }).at(-1)!.stdev)
  })
})

describe('rolling VWAP band type guards', () => {
  it('sanitizes missing/invalid band types to standard deviation', () => {
    assert.equal(isRollingVwapBandType('stdev'), true)
    assert.equal(isRollingVwapBandType('percentage'), true)
    for (const bad of [undefined, null, 'percent', '', 0, {}, Number.NaN]) {
      assert.equal(isRollingVwapBandType(bad), false)
      assert.equal(sanitizeRollingVwapBandType(bad), DEFAULT_ROLLING_VWAP_BAND_TYPE)
    }
  })

  it('accepts bounded finite fractional percentages only', () => {
    for (const good of [0, 0.125, 2.5, MAX_ROLLING_VWAP_BAND_PERCENTAGE]) {
      assert.equal(isRollingVwapBandPercentage(good), true)
    }
    for (const bad of [
      -0.1,
      MAX_ROLLING_VWAP_BAND_PERCENTAGE + 0.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '2.5',
      null,
      undefined,
      {},
      true,
    ]) {
      assert.equal(isRollingVwapBandPercentage(bad), false)
    }
  })

  it('falls back per band without trusting malformed records', () => {
    assert.deepEqual(sanitizeRollingVwapBandPercentages(null), DEFAULT_ROLLING_VWAP_BAND_PERCENTAGES)
    assert.deepEqual(
      sanitizeRollingVwapBandPercentages({ band1: 2.5, band2: '3', band3: Number.NaN }),
      { band1: 2.5, band2: 0, band3: 0 },
    )
    assert.deepEqual(
      sanitizeRollingVwapBandPercentages({ band1: -1, band2: 1000, band3: 50 }, {
        band1: 4,
        band2: 5,
        band3: 6,
      }),
      { band1: 4, band2: 5, band3: 50 },
    )
  })

  it('validates percentages and rejects them from compute options', () => {
    validateRollingVwapBandPercentages({ band1: 0, band2: 0.5, band3: 100 })
    for (const bad of [
      { band1: -1, band2: 0, band3: 0 },
      { band1: 0, band2: Number.NaN, band3: 0 },
      { band1: 0, band2: 0, band3: MAX_ROLLING_VWAP_BAND_PERCENTAGE + 1 },
    ]) {
      assert.throws(() => validateRollingVwapBandPercentages(bad), RollingVwapConfigError)
      assert.throws(
        () =>
          computeRollingVwap(parityCandles(), MS_IN_DAY, {
            bandType: 'percentage',
            percentages: bad,
          }),
        RollingVwapConfigError,
      )
    }
  })

  it('rejects an unsupported runtime band type', () => {
    assert.throws(
      () =>
        computeRollingVwap(parityCandles(), MS_IN_DAY, {
          // Deliberately outside the union: storage sanitization is the only
          // trusted producer, compute still fails closed on a bad value.
          bandType: 'percent' as unknown as 'percentage',
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
