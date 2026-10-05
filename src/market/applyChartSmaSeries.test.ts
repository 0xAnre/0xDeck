import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyLiveCandle } from './parseMarketCandle.ts'
import { computeSmaLine, SMA_20_PERIOD } from './sma.ts'
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

function candlesWithCloses(closes: number[]): MarketCandle[] {
  return closes.map((close, index) => candle(index, close))
}

function smaLineData(candles: readonly MarketCandle[]) {
  return computeSmaLine([...candles], SMA_20_PERIOD).map((point) => ({
    time: point.time,
    value: point.value,
  }))
}

describe('BTC Perp SMA chart series (history)', () => {
  it('builds history line starting at candle 20', () => {
    const candles = candlesWithCloses(Array.from({ length: 22 }, (_, i) => i + 1))
    const data = smaLineData(candles)
    assert.equal(data.length, 3)
    assert.equal(data[0].time, candles[SMA_20_PERIOD - 1].time)
    assert.equal(data[0].value, 10.5)
  })

  it('recomputes when older history is prepended', () => {
    const newer = candlesWithCloses(Array.from({ length: 22 }, (_, i) => i + 100))
    const older = candlesWithCloses(Array.from({ length: 5 }, (_, i) => i + 1))
    const merged = [...older, ...newer]
    const data = smaLineData(merged)
    assert.equal(data.length, 3 + 5)
    assert.equal(data[0].time, merged[SMA_20_PERIOD - 1].time)
  })
})

describe('BTC Perp SMA chart series (live)', () => {
  it('updates last point when the live candle is replaced', () => {
    const candles = candlesWithCloses(Array.from({ length: 20 }, () => 10))
    const live = candle(19, 30)
    applyLiveCandle(candles, live)
    const line = computeSmaLine(candles, SMA_20_PERIOD)
    const last = line[line.length - 1]
    assert.equal(last.time, 19)
    assert.equal(last.value, (19 * 10 + 30) / 20)
  })

  it('updates when a new live candle is appended', () => {
    const candles = candlesWithCloses(Array.from({ length: 20 }, (_, i) => i + 1))
    const live = candle(20, 100)
    applyLiveCandle(candles, live)
    const line = computeSmaLine(candles, SMA_20_PERIOD)
    const last = line[line.length - 1]
    assert.equal(last.time, 20)
    assert.equal(last.value, (1 + 20) * 20 / 2 / 20)
  })
})
