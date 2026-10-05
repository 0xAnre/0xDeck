import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { computeSmaLine, SMA_20_PERIOD, SMA_50_PERIOD, SMA_100_PERIOD } from './sma.ts'
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

describe('computeSmaLine', () => {
  it('returns no points when fewer than period candles', () => {
    const candles = Array.from({ length: SMA_20_PERIOD - 1 }, (_, i) => candle(i, i + 1))
    assert.deepEqual(computeSmaLine(candles, SMA_20_PERIOD), [])
  })

  it('starts at the 20th candle with the mean of closes 1–20', () => {
    const candles = Array.from({ length: 25 }, (_, i) => candle(i, i + 1))
    const line = computeSmaLine(candles, SMA_20_PERIOD)
    assert.equal(line.length, 6)
    assert.equal(line[0].time, candles[19].time)
    assert.equal(line[0].value, (1 + 20) * 20 / 2 / 20)
    assert.equal(line[1].value, (2 + 21) * 20 / 2 / 20)
  })

  it('returns no points when fewer than 50 candles for period 50', () => {
    const candles = Array.from({ length: SMA_50_PERIOD - 1 }, (_, i) => candle(i, i + 1))
    assert.deepEqual(computeSmaLine(candles, SMA_50_PERIOD), [])
  })

  it('starts at the 50th candle with the mean of closes 1–50', () => {
    const candles = Array.from({ length: 55 }, (_, i) => candle(i, i + 1))
    const line = computeSmaLine(candles, SMA_50_PERIOD)
    assert.equal(line.length, 6)
    assert.equal(line[0].time, candles[49].time)
    assert.equal(line[0].value, (1 + 50) * 50 / 2 / 50)
    assert.equal(line[1].value, (2 + 51) * 50 / 2 / 50)
  })

  it('returns no points when fewer than 100 candles for period 100', () => {
    const candles = Array.from({ length: SMA_100_PERIOD - 1 }, (_, i) => candle(i, i + 1))
    assert.deepEqual(computeSmaLine(candles, SMA_100_PERIOD), [])
  })

  it('starts at the 100th candle with the mean of closes 1–100', () => {
    const candles = Array.from({ length: 105 }, (_, i) => candle(i, i + 1))
    const line = computeSmaLine(candles, SMA_100_PERIOD)
    assert.equal(line.length, 6)
    assert.equal(line[0].time, candles[99].time)
    assert.equal(line[0].value, (1 + 100) * 100 / 2 / 100)
    assert.equal(line[1].value, (2 + 101) * 100 / 2 / 100)
  })
})
