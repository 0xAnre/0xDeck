import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeEmaLine, EMA_200_PERIOD, EMA_100_PERIOD, EMA_PERIODS } from './ema.ts'
import {
  computeRollingVwap,
  formatRollingVwapTimePeriodLabel,
  MS_IN_DAY,
  MS_IN_HOUR,
  MS_IN_MIN,
  rollingVwapAutoWindowMs,
} from './rollingVwap.ts'
import type { MarketCandle } from './types.ts'

function candle(overrides: Partial<MarketCandle>): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_700_000_000,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
    ...overrides,
  }
}

describe('indicator math stability', () => {
  it('keeps EMA periods and seeded-SMA formula unchanged', () => {
    assert.deepEqual([...EMA_PERIODS], [13, 21, 35])
    assert.equal(EMA_100_PERIOD, 100)
    assert.equal(EMA_200_PERIOD, 200)

    const candles = [1, 2, 3, 4, 5].map((close, index) =>
      candle({ time: 1000 + index * 60, close }),
    )
    const points = computeEmaLine(candles, 3)
    assert.deepEqual(
      points.map((point) => [point.time, point.value]),
      [
        [1120, 2],
        [1180, 3],
        [1240, 4],
      ],
    )
  })

  it('keeps EMA returning an empty series below its period', () => {
    const candles = [1, 2].map((close, index) => candle({ time: 1000 + index * 60, close }))
    assert.deepEqual(computeEmaLine(candles, 3), [])
  })

  it('keeps Rolling VWAP window mapping and HLC3 volume weighting unchanged', () => {
    assert.equal(rollingVwapAutoWindowMs('1m'), MS_IN_HOUR)
    assert.equal(rollingVwapAutoWindowMs('1d'), Math.trunc(MS_IN_DAY * 30.4375))
    assert.equal(formatRollingVwapTimePeriodLabel(rollingVwapAutoWindowMs('1d')), '1M')

    const candles = [
      candle({ time: 1000, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: 1060, high: 20, low: 20, close: 20, volume: 3 }),
    ]
    const points = computeRollingVwap(candles, MS_IN_DAY, { minBars: 1 })
    assert.equal(points.length, 2)
    assert.equal(points[0].vwap, 10)
    assert.equal(points[1].vwap, 17.5)
    assert.ok(Math.abs((points[1].stdev ?? 0) - Math.sqrt(18.75)) < 1e-12)
    assert.equal(MS_IN_MIN, 60_000)
  })
})
