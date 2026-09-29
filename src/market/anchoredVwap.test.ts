import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ANCHORED_VWAP_BAND_1_MULT,
  ANCHORED_VWAP_BAND_2_MULT,
  computeAnchoredVwap,
} from './anchoredVwap.ts'
import type { MarketCandle } from './types.ts'

function candle(overrides: Partial<MarketCandle> = {}): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '4h',
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

const dayKey = (t: number) => String(Math.floor(t / 86_400))

describe('computeAnchoredVwap', () => {
  it('single candle VWAP equals hlc3', () => {
    const c = candle({ high: 10, low: 4, close: 7, volume: 5 })
    const [point] = computeAnchoredVwap([c], dayKey)
    assertClose(point.vwap, 7)
  })

  it('matches Pine variance and band formulas', () => {
    const candles = [
      candle({ time: 1_704_067_200, high: 10, low: 10, close: 10, volume: 2 }),
      candle({ time: 1_704_067_260, high: 14, low: 14, close: 14, volume: 4 }),
    ]
    const [, second] = computeAnchoredVwap(candles, dayKey)
    const vwap = 76 / 6
    const variance = 984 / 6 - vwap * vwap
    const stdev = Math.sqrt(variance)
    assertClose(second.vwap, vwap)
    assertClose(second.upper1, vwap + ANCHORED_VWAP_BAND_1_MULT * stdev)
    assertClose(second.lower1, vwap - ANCHORED_VWAP_BAND_1_MULT * stdev)
    assertClose(second.upper2, vwap + ANCHORED_VWAP_BAND_2_MULT * stdev)
    assertClose(second.lower2, vwap - ANCHORED_VWAP_BAND_2_MULT * stdev)
  })

  it('replaces duplicate timestamps with the last candle', () => {
    const candles = [
      candle({ time: 100, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: 100, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    const [point] = computeAnchoredVwap(candles, dayKey)
    assertClose(point.vwap, 20)
  })

  it('sorts unsorted input ascending', () => {
    const later = candle({ time: 200, close: 20, high: 20, low: 20, volume: 1 })
    const earlier = candle({ time: 100, close: 10, high: 10, low: 10, volume: 1 })
    const points = computeAnchoredVwap([later, earlier], dayKey)
    assert.equal(points[0].time, 100)
    assert.equal(points[1].time, 200)
  })

  it('does not produce NaN or Infinity when volume is zero', () => {
    const [point] = computeAnchoredVwap([candle({ volume: 0 })], dayKey)
    assert.equal(point.vwap, null)
    assert.equal(point.upper1, null)
  })

  it('does not mutate input candles', () => {
    const input = [candle({ time: 1 })]
    const copy = input.map((c) => ({ ...c }))
    computeAnchoredVwap(input, dayKey)
    assert.deepEqual(input, copy)
  })

  it('carries previous period snapshot into the next period', () => {
    const day0 = 100 * 86_400
    const day1 = 101 * 86_400
    const candles = [
      candle({ time: day0 + 60, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: day0 + 120, high: 20, low: 20, close: 20, volume: 1 }),
      candle({ time: day1 + 60, high: 5, low: 5, close: 5, volume: 2 }),
    ]
    const [, , firstOfDay1] = computeAnchoredVwap(candles, dayKey)
    assertClose(firstOfDay1.previousVwap, 15)
    assertClose(firstOfDay1.vwap, 5)
  })
})
