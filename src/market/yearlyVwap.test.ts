import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeYearlyVwap, utcYearKey } from './yearlyVwap.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number, close = 100, volume = 1): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1w',
    time,
    open: close,
    high: close + 1,
    low: close - 1,
    close,
    volume,
    closed: true,
  }
}

function assertClose(actual: number | null, expected: number, tolerance = 1e-9) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) <= tolerance, `expected ${expected}, got ${actual}`)
}

describe('utcYearKey', () => {
  it('groups Dec 31 and Jan 1 UTC into different years', () => {
    const dec31 = Math.floor(Date.UTC(2024, 11, 31, 23) / 1000)
    const jan1 = Math.floor(Date.UTC(2025, 0, 1, 0) / 1000)
    assert.equal(utcYearKey(dec31), '2024')
    assert.equal(utcYearKey(jan1), '2025')
  })

  it('keeps leap-day candles in the leap year', () => {
    const leap = Math.floor(Date.UTC(2024, 1, 29, 12) / 1000)
    assert.equal(utcYearKey(leap), '2024')
  })
})

describe('computeYearlyVwap', () => {
  it('uses candle open time UTC year for 1w bars', () => {
    const ts = Math.floor(Date.UTC(2024, 5, 1) / 1000)
    assert.equal(utcYearKey(ts), '2024')
    const [point] = computeYearlyVwap([candle(ts)])
    assert.equal(point.time, ts)
  })

  it('carries previous year final values through the new year', () => {
    const y2024 = Math.floor(Date.UTC(2024, 11, 15) / 1000)
    const y2025 = Math.floor(Date.UTC(2025, 0, 15) / 1000)
    const points = computeYearlyVwap([
      candle(y2024, 100, 2),
      candle(y2024 + 86_400, 120, 2),
      candle(y2025, 40, 1),
      candle(y2025 + 86_400, 40, 1),
    ])
    const last2024 = points.find((p) => p.time === y2024 + 86_400)
    const first2025 = points.find((p) => p.time === y2025)
    assert.ok(last2024 && first2025)
    assertClose(first2025.previousVwap, last2024.vwap)
    assertClose(points[points.length - 1].previousVwap, last2024.vwap)
  })
})
