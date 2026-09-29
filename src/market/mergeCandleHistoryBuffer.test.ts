import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mergeHistoryWithStreamBuffer } from './mergeCandleHistoryBuffer.ts'
import type { MarketCandle } from './types.ts'

function candle(time: number, volume: number): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time,
    open: 1,
    high: 2,
    low: 0.5,
    close: 1.5,
    volume,
    closed: false,
  }
}

describe('mergeHistoryWithStreamBuffer', () => {
  it('prefers stream buffer volume for the same timestamp', () => {
    const history = [candle(100, 10)]
    const buffer = new Map([[100, candle(100, 42)]])
    const merged = mergeHistoryWithStreamBuffer(history, buffer)
    assert.equal(merged.length, 1)
    assert.equal(merged[0].volume, 42)
  })
})
