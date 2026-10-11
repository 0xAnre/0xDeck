import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { olderHistoryPageMadeProgress } from './btcPerpetualHistoryPageProgress.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: 1,
    high: 1,
    low: 1,
    close: 1,
    volume: 1,
    closed: true,
  }
}

describe('olderHistoryPageMadeProgress', () => {
  it('is false when candle count and oldest time are unchanged', () => {
    const candles = [candle(100), candle(200)]
    assert.equal(olderHistoryPageMadeProgress(2, 100, candles), false)
  })

  it('is true when older candles were prepended', () => {
    const candles = [candle(40), candle(100), candle(200)]
    assert.equal(olderHistoryPageMadeProgress(2, 100, candles), true)
  })
})
