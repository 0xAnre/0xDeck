import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeWilderRsi,
  createDefaultRsiSettings,
  DEFAULT_RSI_OVERBOUGHT,
  DEFAULT_RSI_OVERSOLD,
  DEFAULT_RSI_PERIOD,
  DEFAULT_RSI_THRESHOLD_GLOW,
  RSI_LEVEL_MAX,
  RSI_LEVEL_MIN,
  RSI_PERIOD_MAX,
  RSI_PERIOD_MIN,
  sanitizeRsiPeriod,
  sanitizeRsiSettings,
} from './rsi.ts'
import type { MarketCandle } from './types.ts'

function candlesFromCloses(closes: readonly number[]): MarketCandle[] {
  return closes.map((close, index) => ({
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_700_000_000 + index * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: true,
  }))
}

describe('computeWilderRsi', () => {
  it('returns no points until period + 1 candles are available', () => {
    const candles = candlesFromCloses(Array.from({ length: 14 }, (_, i) => i + 1))
    assert.deepEqual(computeWilderRsi(candles, 14), [])
  })

  it('aligns the first point with candle index = period', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const points = computeWilderRsi(candlesFromCloses(closes), 14)
    assert.equal(points.length, 6)
    assert.equal(points[0].time, 1_700_000_000 + 14 * 60)
    assert.equal(points[points.length - 1].time, 1_700_000_000 + 19 * 60)
  })

  it('is 100 for a strictly rising series', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i * 2)
    const points = computeWilderRsi(candlesFromCloses(closes), 14)
    assert.ok(points.every((point) => point.value === 100))
  })

  it('is 0 for a strictly falling series', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i * 2)
    const points = computeWilderRsi(candlesFromCloses(closes), 14)
    assert.ok(points.every((point) => point.value === 0))
  })

  it('reports neutral 50 for a perfectly flat series', () => {
    const closes = Array.from({ length: 20 }, () => 100)
    const points = computeWilderRsi(candlesFromCloses(closes), 14)
    assert.ok(points.every((point) => point.value === 50))
  })

  it('applies Wilder smoothing after the seeded first value (period 2)', () => {
    // Changes: +1, +1, -1. First window: avgGain 1, avgLoss 0 -> 100.
    // Next step: avgGain (1 + 0) / 2 = 0.5, avgLoss (0 + 1) / 2 = 0.5 -> 50.
    const points = computeWilderRsi(candlesFromCloses([1, 2, 3, 2]), 2)
    assert.deepEqual(
      points.map((point) => point.value),
      [100, 50],
    )
  })

  it('matches the reference Wilder RSI for the canonical period-14 series', () => {
    // Wilder/StockCharts sample closes. Over the first 14 changes the hand-summed
    // totals are gains 3.34 and losses 1.40, so the seeded averages are
    // 3.34 / 14 = 0.238571 and 1.40 / 14 = 0.1 -> RSI 70.4641.
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03,
      45.61, 46.28, 46.28, 46.0, 46.03, 46.41,
    ]
    const points = computeWilderRsi(candlesFromCloses(closes), 14)
    assert.equal(points.length, 4)
    assert.ok(Math.abs(points[0].value - 70.464135) < 0.0005)
  })

  it('sanitizes the requested period before computing', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i)
    const candles = candlesFromCloses(closes)
    assert.deepEqual(
      computeWilderRsi(candles, 1).map((point) => point.value),
      computeWilderRsi(candles, RSI_PERIOD_MIN).map((point) => point.value),
    )
  })
})

describe('sanitizeRsiPeriod', () => {
  it('defaults to 14 for non numeric input', () => {
    assert.equal(sanitizeRsiPeriod(undefined), DEFAULT_RSI_PERIOD)
    assert.equal(sanitizeRsiPeriod('14'), DEFAULT_RSI_PERIOD)
    assert.equal(sanitizeRsiPeriod(Number.NaN), DEFAULT_RSI_PERIOD)
    assert.equal(sanitizeRsiPeriod(Number.POSITIVE_INFINITY), DEFAULT_RSI_PERIOD)
  })

  it('rounds and clamps into the supported range', () => {
    assert.equal(sanitizeRsiPeriod(14.4), 14)
    assert.equal(sanitizeRsiPeriod(0), RSI_PERIOD_MIN)
    assert.equal(sanitizeRsiPeriod(-5), RSI_PERIOD_MIN)
    assert.equal(sanitizeRsiPeriod(10_000), RSI_PERIOD_MAX)
  })
})

describe('sanitizeRsiSettings', () => {
  it('falls back to defaults for invalid input', () => {
    assert.deepEqual(sanitizeRsiSettings(null), createDefaultRsiSettings())
    assert.deepEqual(sanitizeRsiSettings('nope'), createDefaultRsiSettings())
    assert.deepEqual(
      sanitizeRsiSettings({ period: 'x', overbought: null, oversold: [] }),
      createDefaultRsiSettings(),
    )
  })

  it('keeps valid custom settings', () => {
    assert.deepEqual(
      sanitizeRsiSettings({ period: 21, overbought: 80, oversold: 20, thresholdGlow: false }),
      {
        period: 21,
        overbought: 80,
        oversold: 20,
        thresholdGlow: false,
      },
    )
  })

  it('keeps the threshold glow on unless it is explicitly false', () => {
    assert.equal(DEFAULT_RSI_THRESHOLD_GLOW, true)
    assert.equal(createDefaultRsiSettings().thresholdGlow, true)
    for (const legacy of [undefined, null, 'false', 0, {}, true]) {
      assert.equal(
        sanitizeRsiSettings({ period: 21, overbought: 80, oversold: 20, thresholdGlow: legacy })
          .thresholdGlow,
        true,
      )
    }
  })

  it('clamps levels into 0-100 and rounds them', () => {
    assert.deepEqual(sanitizeRsiSettings({ period: 14, overbought: 170, oversold: -20 }), {
      period: 14,
      overbought: RSI_LEVEL_MAX,
      oversold: RSI_LEVEL_MIN,
      thresholdGlow: true,
    })
    assert.deepEqual(sanitizeRsiSettings({ period: 14, overbought: 72.6, oversold: 30.2 }), {
      period: 14,
      overbought: 73,
      oversold: 30,
      thresholdGlow: true,
    })
  })

  it('falls back to the default pair when the levels are inverted or equal', () => {
    assert.deepEqual(sanitizeRsiSettings({ period: 14, overbought: 20, oversold: 80 }), {
      period: 14,
      overbought: DEFAULT_RSI_OVERBOUGHT,
      oversold: DEFAULT_RSI_OVERSOLD,
      thresholdGlow: true,
    })
    assert.deepEqual(sanitizeRsiSettings({ period: 14, overbought: 50, oversold: 50 }), {
      period: 14,
      overbought: DEFAULT_RSI_OVERBOUGHT,
      oversold: DEFAULT_RSI_OVERSOLD,
      thresholdGlow: true,
    })
  })
})
