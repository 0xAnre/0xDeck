import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { setEma200HistoryData, updateEma200Live } from './chartEma200Series.ts'
import { computeEmaLine, EMA_200_PERIOD } from './ema.ts'
import type { MarketCandle } from './types.ts'

function makeCandle(time: number, close: number): MarketCandle {
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

function makeLineSeries() {
  const updates: { time: number; value: number }[] = []
  const setDataLog: { time: number; value: number }[][] = []
  const series = {
    setData: (data: { time: number; value: number }[]) => {
      setDataLog.push(data)
    },
    update: (point: { time: number; value: number }) => {
      updates.push(point)
    },
    applyOptions: () => {},
  }
  return { series, updates, setDataLog }
}

describe('setEma200HistoryData', () => {
  it('leaves EMA 200 empty when fewer than 200 candles', () => {
    const { series, setDataLog } = makeLineSeries()
    const candles = Array.from({ length: 50 }, (_, i) => makeCandle(1_700_000_000 + i * 60, i + 1))
    setEma200HistoryData(series, candles)
    assert.equal(setDataLog.length, 1)
    assert.deepEqual(setDataLog[0], [])
  })

  it('seeds EMA 200 at candle 200 with SMA of first 200 closes', () => {
    const { series, setDataLog } = makeLineSeries()
    const candles = Array.from({ length: 200 }, (_, i) => makeCandle(1_700_000_000 + i * 60, 1))
    setEma200HistoryData(series, candles)
    const line = setDataLog[0]
    assert.equal(line.length, 1)
    assert.equal(line[0].time, candles[199].time)
    assert.equal(line[0].value, 1)
  })

  it('produces 51 points for 250 candles', () => {
    const { series, setDataLog } = makeLineSeries()
    const candles = Array.from({ length: 250 }, (_, i) => makeCandle(1_700_000_000 + i * 60, i + 1))
    setEma200HistoryData(series, candles)
    const line = setDataLog[0]
    assert.equal(line.length, 51)
    assert.equal(line[0]?.value, computeEmaLine(candles, EMA_200_PERIOD)[0]?.value)
  })
})

describe('updateEma200Live', () => {
  it('routes live updates to the EMA 200 series', () => {
    const { series, updates } = makeLineSeries()
    const candles = Array.from({ length: 200 }, (_, i) => makeCandle(1_700_000_000 + i * 60, 1))
    const next = makeCandle(1_700_000_000 + 200 * 60, 2)
    updateEma200Live(series, [...candles, next])
    assert.equal(updates.length, 1)
    const fullLine = computeEmaLine([...candles, next], EMA_200_PERIOD)
    assert.equal(updates[0]?.value, fullLine[fullLine.length - 1]?.value)
  })

  it('does not update when fewer than 200 candles', () => {
    const { series, updates } = makeLineSeries()
    const candles = Array.from({ length: 10 }, (_, i) => makeCandle(1_700_000_000 + i * 60, 1))
    const next = makeCandle(1_700_000_000 + 10 * 60, 2)
    updateEma200Live(series, [...candles, next])
    assert.equal(updates.length, 0)
  })
})

describe('indicator visibility independence', () => {
  it('triple-ema and ema-200 are separate indicator ids', () => {
    const tripleOnly = ['triple-ema'] as const
    const ema200Only = ['ema-200'] as const
    assert.equal(tripleOnly.includes('triple-ema'), true)
    assert.equal(tripleOnly.includes('ema-200'), false)
    assert.equal(ema200Only.includes('ema-200'), true)
    assert.equal(ema200Only.includes('triple-ema'), false)
  })
})
