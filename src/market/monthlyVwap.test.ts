import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeMonthlyVwap, utcMonthKey } from './monthlyVwap.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number, volume = 1, close = 100): MarketCandle {
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

describe('utcMonthKey', () => {
  it('groups December and January into different months across year boundary', () => {
    const dec = Math.floor(Date.UTC(2024, 11, 31, 12) / 1000)
    const jan = Math.floor(Date.UTC(2025, 0, 1, 0) / 1000)
    assert.equal(utcMonthKey(dec), '2024-12')
    assert.equal(utcMonthKey(jan), '2025-1')
  })
})

describe('computeMonthlyVwap', () => {
  it('carries previous month snapshot into the new month', () => {
    const jan = Math.floor(Date.UTC(2025, 0, 15, 12) / 1000)
    const feb = Math.floor(Date.UTC(2025, 1, 2, 12) / 1000)
    const points = computeMonthlyVwap([candle(jan, 2, 100), candle(feb, 1, 110)])
    assert.equal(points.length, 2)
    assert.equal(points[1].previousVwap, points[0].vwap)
  })

  it('does not mutate input candles', () => {
    const input = [candle(1_700_000_000)]
    const copy = input.map((c) => ({ ...c }))
    computeMonthlyVwap(input)
    assert.deepEqual(input, copy)
  })
})
