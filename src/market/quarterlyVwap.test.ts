import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeQuarterlyVwap, utcQuarterKey } from './quarterlyVwap.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number, close = 100, volume = 1): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '4h',
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

describe('utcQuarterKey', () => {
  it('maps Q1 and Q2 boundaries', () => {
    const mar = Math.floor(Date.UTC(2025, 2, 15) / 1000)
    const apr = Math.floor(Date.UTC(2025, 3, 1) / 1000)
    assert.equal(utcQuarterKey(mar), '2025-Q1')
    assert.equal(utcQuarterKey(apr), '2025-Q2')
  })

  it('maps Q4 to Q1 across year boundary', () => {
    const dec = Math.floor(Date.UTC(2024, 11, 31, 12) / 1000)
    const jan = Math.floor(Date.UTC(2025, 0, 15) / 1000)
    assert.equal(utcQuarterKey(dec), '2024-Q4')
    assert.equal(utcQuarterKey(jan), '2025-Q1')
  })
})

describe('computeQuarterlyVwap', () => {
  it('carries previous quarter final bands into the new quarter', () => {
    const q1 = Math.floor(Date.UTC(2025, 1, 15) / 1000)
    const q2 = Math.floor(Date.UTC(2025, 3, 15) / 1000)
    const points = computeQuarterlyVwap([
      candle(q1, 100, 2),
      candle(q1 + 3600, 120, 2),
      candle(q2, 50, 1),
      candle(q2 + 3600, 50, 1),
    ])
    const lastQ1 = points.find((p) => p.time === q1 + 3600)
    const firstQ2 = points.find((p) => p.time === q2)
    assert.ok(lastQ1 && firstQ2)
    assertClose(firstQ2.previousVwap, lastQ1.vwap)
    assertClose(firstQ2.previousUpper1, lastQ1.upper1)
    assertClose(firstQ2.previousLower1, lastQ1.lower1)
    assertClose(points[points.length - 1].previousVwap, lastQ1.vwap)
  })
})
