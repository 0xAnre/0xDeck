import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeDailyVwap } from './dailyVwap.ts'
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

describe('computeDailyVwap', () => {
  it('single candle VWAP equals hlc3', () => {
    const c = candle({ high: 10, low: 4, close: 7, volume: 5 })
    const [point] = computeDailyVwap([c])
    assertClose(point.vwap, 7)
    assertClose(point.upper1, 7)
    assertClose(point.lower1, 7)
    assert.equal(point.previousVwap, null)
  })

  it('weights VWAP by volume across candles', () => {
    const candles = [
      candle({ time: 1_704_067_200, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: 1_704_067_260, high: 20, low: 20, close: 20, volume: 3 }),
    ]
    const [, second] = computeDailyVwap(candles)
    assertClose(second.vwap, 17.5)
  })

  it('matches Pine variance and band formulas', () => {
    const candles = [
      candle({ time: 1_704_067_200, high: 10, low: 10, close: 10, volume: 2 }),
      candle({ time: 1_704_067_260, high: 14, low: 14, close: 14, volume: 4 }),
    ]
    const [, second] = computeDailyVwap(candles)
    const vwap = 76 / 6
    const variance = 984 / 6 - vwap * vwap
    const stdev = Math.sqrt(variance)
    assertClose(second.vwap, vwap)
    assertClose(second.upper1, vwap + stdev)
    assertClose(second.lower1, vwap - stdev)
    assertClose(second.upper2, vwap + 2 * stdev)
    assertClose(second.lower2, vwap - 2 * stdev)
  })

  it('resets cumulative totals at UTC day boundary', () => {
    const day0 = 100 * 86_400
    const day1 = 101 * 86_400
    const candles = [
      candle({ time: day0 + 3_600, high: 30, low: 30, close: 30, volume: 2 }),
      candle({ time: day1 + 60, high: 10, low: 10, close: 10, volume: 1 }),
    ]
    const [, firstOfDay1] = computeDailyVwap(candles)
    assertClose(firstOfDay1.vwap, 10)
  })

  it('carries previous day final bands through the new UTC day', () => {
    const day0 = 200 * 86_400
    const day1 = 201 * 86_400
    const candles = [
      candle({ time: day0 + 60, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: day0 + 120, high: 20, low: 20, close: 20, volume: 1 }),
      candle({ time: day1 + 60, high: 5, low: 5, close: 5, volume: 2 }),
      candle({ time: day1 + 120, high: 5, low: 5, close: 5, volume: 2 }),
    ]
    const points = computeDailyVwap(candles)
    const lastDay0 = points[1]
    const firstDay1 = points[2]
    const secondDay1 = points[3]

    assertClose(firstDay1.previousVwap, lastDay0.vwap)
    assertClose(firstDay1.previousUpper1, lastDay0.upper1)
    assertClose(firstDay1.previousLower2, lastDay0.lower2)
    assertClose(secondDay1.previousVwap, lastDay0.vwap)
    assertClose(secondDay1.previousUpper1, lastDay0.upper1)
  })

  it('leaves previous values null on the first available day', () => {
    const [point] = computeDailyVwap([candle()])
    assert.equal(point.previousVwap, null)
    assert.equal(point.previousUpper1, null)
    assert.equal(point.previousLower2, null)
  })

  it('does not produce NaN or Infinity when cumulative volume is zero', () => {
    const [point] = computeDailyVwap([candle({ volume: 0 })])
    assert.equal(point.vwap, null)
    assert.equal(point.upper1, null)
    assert.equal(point.lower2, null)
  })

  it('does not double-count when the same timestamp is updated', () => {
    const time = 1_704_067_200
    const candles = [
      candle({ time, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time, high: 20, low: 20, close: 20, volume: 3 }),
    ]
    const [point] = computeDailyVwap(candles)
    assertClose(point.vwap, 20)
  })

  it('does not mutate the input candle array', () => {
    const candles = [candle({ time: 1_704_067_200 })]
    const snapshot = JSON.stringify(candles)
    computeDailyVwap(candles)
    assert.equal(JSON.stringify(candles), snapshot)
  })
})
