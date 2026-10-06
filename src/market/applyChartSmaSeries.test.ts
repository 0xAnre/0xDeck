import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyLiveCandle } from './parseMarketCandle.ts'
import {
  computeLatestSmaPoint,
  computeSmaLine,
  SMA_20_PERIOD,
  SMA_50_PERIOD,
  SMA_100_PERIOD,
  SMA_200_PERIOD,
} from './sma.ts'
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

function smaLineData(candles: readonly MarketCandle[], period: number) {
  return computeSmaLine([...candles], period).map((point) => ({
    time: point.time,
    value: point.value,
  }))
}

describe('BTC Perp SMA chart series (history)', () => {
  it('builds history line starting at candle 20', () => {
    const candles = candlesWithCloses(Array.from({ length: 22 }, (_, i) => i + 1))
    const data = smaLineData(candles, SMA_20_PERIOD)
    assert.equal(data.length, 3)
    assert.equal(data[0].time, candles[SMA_20_PERIOD - 1].time)
    assert.equal(data[0].value, 10.5)
  })

  it('recomputes when older history is prepended', () => {
    const newer = candlesWithCloses(Array.from({ length: 22 }, (_, i) => i + 100))
    const older = candlesWithCloses(Array.from({ length: 5 }, (_, i) => i + 1))
    const merged = [...older, ...newer]
    const data = smaLineData(merged, SMA_20_PERIOD)
    assert.equal(data.length, 3 + 5)
    assert.equal(data[0].time, merged[SMA_20_PERIOD - 1].time)
  })

  it('builds SMA 50 history line starting at candle 50', () => {
    const candles = candlesWithCloses(Array.from({ length: 52 }, (_, i) => i + 1))
    const data = smaLineData(candles, SMA_50_PERIOD)
    assert.equal(data.length, 3)
    assert.equal(data[0].time, candles[SMA_50_PERIOD - 1].time)
    assert.equal(data[0].value, (1 + 50) * 50 / 2 / 50)
  })

  it('recomputes SMA 50 when older history is prepended', () => {
    const newer = candlesWithCloses(Array.from({ length: 52 }, (_, i) => i + 100))
    const older = candlesWithCloses(Array.from({ length: 5 }, (_, i) => i + 1))
    const merged = [...older, ...newer]
    const data = smaLineData(merged, SMA_50_PERIOD)
    assert.equal(data.length, 3 + 5)
    assert.equal(data[0].time, merged[SMA_50_PERIOD - 1].time)
  })

  it('builds SMA 100 history line starting at candle 100', () => {
    const candles = candlesWithCloses(Array.from({ length: 102 }, (_, i) => i + 1))
    const data = smaLineData(candles, SMA_100_PERIOD)
    assert.equal(data.length, 3)
    assert.equal(data[0].time, candles[SMA_100_PERIOD - 1].time)
    assert.equal(data[0].value, (1 + 100) * 100 / 2 / 100)
  })

  it('recomputes SMA 100 when older history is prepended', () => {
    const newer = candlesWithCloses(Array.from({ length: 102 }, (_, i) => i + 100))
    const older = candlesWithCloses(Array.from({ length: 5 }, (_, i) => i + 1))
    const merged = [...older, ...newer]
    const data = smaLineData(merged, SMA_100_PERIOD)
    assert.equal(data.length, 3 + 5)
    assert.equal(data[0].time, merged[SMA_100_PERIOD - 1].time)
  })

  it('builds SMA 200 history line starting at candle 200', () => {
    const candles = candlesWithCloses(Array.from({ length: 202 }, (_, i) => i + 1))
    const data = smaLineData(candles, SMA_200_PERIOD)
    assert.equal(data.length, 3)
    assert.equal(data[0].time, candles[SMA_200_PERIOD - 1].time)
    assert.equal(data[0].value, (1 + 200) * 200 / 2 / 200)
  })

  it('recomputes SMA 200 when older history is prepended', () => {
    const newer = candlesWithCloses(Array.from({ length: 202 }, (_, i) => i + 100))
    const older = candlesWithCloses(Array.from({ length: 5 }, (_, i) => i + 1))
    const merged = [...older, ...newer]
    const data = smaLineData(merged, SMA_200_PERIOD)
    assert.equal(data.length, 3 + 5)
    assert.equal(data[0].time, merged[SMA_200_PERIOD - 1].time)
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
    const windowCloses = candles.slice(-SMA_20_PERIOD).map((c) => c.close)
    const expected =
      windowCloses.reduce((sum, close) => sum + close, 0) / SMA_20_PERIOD
    assert.equal(last.value, expected)
  })
})

describe('BTC Perp SMA 50 chart series (live)', () => {
  it('updates last point when the live candle is replaced', () => {
    const candles = candlesWithCloses(Array.from({ length: 50 }, () => 10))
    const live = candle(49, 30)
    applyLiveCandle(candles, live)
    const line = computeSmaLine(candles, SMA_50_PERIOD)
    const last = line[line.length - 1]
    assert.equal(last.time, 49)
    assert.equal(last.value, (49 * 10 + 30) / 50)
  })

  it('updates when a new live candle is appended', () => {
    const candles = candlesWithCloses(Array.from({ length: 50 }, (_, i) => i + 1))
    const live = candle(50, 100)
    applyLiveCandle(candles, live)
    const line = computeSmaLine(candles, SMA_50_PERIOD)
    const last = line[line.length - 1]
    assert.equal(last.time, 50)
    const windowCloses = candles.slice(-SMA_50_PERIOD).map((c) => c.close)
    const expected =
      windowCloses.reduce((sum, close) => sum + close, 0) / SMA_50_PERIOD
    assert.equal(last.value, expected)
  })
})

describe('BTC Perp SMA 100 chart series (live)', () => {
  it('updates last point when the live candle is replaced', () => {
    const candles = candlesWithCloses(Array.from({ length: 100 }, () => 10))
    const live = candle(99, 30)
    applyLiveCandle(candles, live)
    const latest = computeLatestSmaPoint(candles, SMA_100_PERIOD)
    const line = computeSmaLine(candles, SMA_100_PERIOD)
    assert.deepEqual(latest, line[line.length - 1])
    assert.equal(latest?.time, 99)
    assert.equal(latest?.value, (99 * 10 + 30) / 100)
  })

  it('updates when a new live candle is appended', () => {
    const candles = candlesWithCloses(Array.from({ length: 100 }, (_, i) => i + 1))
    const live = candle(100, 200)
    applyLiveCandle(candles, live)
    const latest = computeLatestSmaPoint(candles, SMA_100_PERIOD)
    const line = computeSmaLine(candles, SMA_100_PERIOD)
    assert.deepEqual(latest, line[line.length - 1])
    assert.equal(latest?.time, 100)
    const windowCloses = candles.slice(-SMA_100_PERIOD).map((c) => c.close)
    const expected =
      windowCloses.reduce((sum, close) => sum + close, 0) / SMA_100_PERIOD
    assert.equal(latest?.value, expected)
  })

  it('uses the latest 100 closes when history is longer than the period', () => {
    const candles = candlesWithCloses(Array.from({ length: 800 }, (_, i) => i + 1))
    const live = candle(800, 900)
    applyLiveCandle(candles, live)
    const latest = computeLatestSmaPoint(candles, SMA_100_PERIOD)
    const line = computeSmaLine(candles, SMA_100_PERIOD)
    assert.equal(line.length, 702)
    assert.deepEqual(latest, line[line.length - 1])
    assert.equal(latest?.time, 800)
  })
})

describe('BTC Perp SMA 200 chart series (live)', () => {
  it('updates last point when the live candle is replaced', () => {
    const candles = candlesWithCloses(Array.from({ length: 200 }, () => 10))
    const live = candle(199, 30)
    applyLiveCandle(candles, live)
    const latest = computeLatestSmaPoint(candles, SMA_200_PERIOD)
    const line = computeSmaLine(candles, SMA_200_PERIOD)
    assert.deepEqual(latest, line[line.length - 1])
    assert.equal(latest?.time, 199)
    assert.equal(latest?.value, (199 * 10 + 30) / 200)
  })

  it('updates when a new live candle is appended', () => {
    const candles = candlesWithCloses(Array.from({ length: 200 }, (_, i) => i + 1))
    const live = candle(200, 400)
    applyLiveCandle(candles, live)
    const latest = computeLatestSmaPoint(candles, SMA_200_PERIOD)
    const line = computeSmaLine(candles, SMA_200_PERIOD)
    assert.deepEqual(latest, line[line.length - 1])
    assert.equal(latest?.time, 200)
    const windowCloses = candles.slice(-SMA_200_PERIOD).map((c) => c.close)
    const expected =
      windowCloses.reduce((sum, close) => sum + close, 0) / SMA_200_PERIOD
    assert.equal(latest?.value, expected)
  })

  it('uses the latest 200 closes when history is longer than the period', () => {
    const candles = candlesWithCloses(Array.from({ length: 800 }, (_, i) => i + 1))
    const live = candle(800, 900)
    applyLiveCandle(candles, live)
    const latest = computeLatestSmaPoint(candles, SMA_200_PERIOD)
    const line = computeSmaLine(candles, SMA_200_PERIOD)
    assert.equal(line.length, 602)
    assert.deepEqual(latest, line[line.length - 1])
    assert.equal(latest?.time, 800)
  })
})

describe('independent SMA 20, SMA 50, SMA 100, and SMA 200 series', () => {
  it('produces different point counts and values for the same candles', () => {
    const candles = candlesWithCloses(Array.from({ length: 210 }, (_, i) => i + 1))
    const sma20 = computeSmaLine(candles, SMA_20_PERIOD)
    const sma50 = computeSmaLine(candles, SMA_50_PERIOD)
    const sma100 = computeSmaLine(candles, SMA_100_PERIOD)
    const sma200 = computeSmaLine(candles, SMA_200_PERIOD)
    assert.equal(sma20.length, 191)
    assert.equal(sma50.length, 161)
    assert.equal(sma100.length, 111)
    assert.equal(sma200.length, 11)
    assert.notEqual(sma20[0].value, sma50[0].value)
    assert.notEqual(sma50[0].value, sma100[0].value)
    assert.notEqual(sma100[0].value, sma200[0].value)
    assert.notEqual(sma20[sma20.length - 1].value, sma50[sma50.length - 1].value)
    assert.notEqual(sma50[sma50.length - 1].value, sma100[sma100.length - 1].value)
    assert.notEqual(sma100[sma100.length - 1].value, sma200[sma200.length - 1].value)
  })
})
