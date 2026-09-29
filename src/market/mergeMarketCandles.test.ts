import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeOlderMarketCandles } from './mergeMarketCandles.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number, close: number): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: true,
  }
}

describe('mergeOlderMarketCandles', () => {
  it('keeps existing candle on duplicate timestamp', () => {
    const merged = mergeOlderMarketCandles(
      [candle(100, 2)],
      [candle(100, 1), candle(50, 1)],
    )
    assert.deepEqual(merged.map((item) => item.time), [50, 100])
    assert.equal(merged[1].close, 2)
  })
})
