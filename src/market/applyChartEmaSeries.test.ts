import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  applyEmaIndicatorSeriesVisibility,
  type EmaIndicatorSeriesBundle,
} from './chartEmaIndicatorVisibility.ts'
import { setDualEmaHistoryData, updateDualEmaLive } from './chartDualEmaSeries.ts'
import { computeEmaLine, EMA_100_PERIOD, EMA_200_PERIOD } from './ema.ts'
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

describe('setDualEmaHistoryData', () => {
  it('leaves EMA 200 empty when fewer than 200 candles', () => {
    const ema100 = makeLineSeries()
    const ema200 = makeLineSeries()
    const candles = Array.from({ length: 50 }, (_, i) => makeCandle(1_700_000_000 + i * 60, i + 1))
    setDualEmaHistoryData(ema100.series, ema200.series, candles)
    assert.equal(ema200.setDataLog.length, 1)
    assert.deepEqual(ema200.setDataLog[0], [])
  })

  it('seeds EMA 200 at candle 200 with SMA of first 200 closes', () => {
    const ema100 = makeLineSeries()
    const ema200 = makeLineSeries()
    const candles = Array.from({ length: 200 }, (_, i) => makeCandle(1_700_000_000 + i * 60, 1))
    setDualEmaHistoryData(ema100.series, ema200.series, candles)
    const line = ema200.setDataLog[0]
    assert.equal(line.length, 1)
    assert.equal(line[0].time, candles[199].time)
    assert.equal(line[0].value, 1)
  })

  it('produces 51 EMA 200 points for 250 candles', () => {
    const ema100 = makeLineSeries()
    const ema200 = makeLineSeries()
    const candles = Array.from({ length: 250 }, (_, i) => makeCandle(1_700_000_000 + i * 60, i + 1))
    setDualEmaHistoryData(ema100.series, ema200.series, candles)
    const line = ema200.setDataLog[0]
    assert.equal(line.length, 51)
    assert.equal(line[0]?.value, computeEmaLine(candles, EMA_200_PERIOD)[0]?.value)
  })

  it('seeds EMA 100 when at least 100 candles are available', () => {
    const ema100 = makeLineSeries()
    const ema200 = makeLineSeries()
    const candles = Array.from({ length: 150 }, (_, i) => makeCandle(1_700_000_000 + i * 60, i + 1))
    setDualEmaHistoryData(ema100.series, ema200.series, candles)
    const line = ema100.setDataLog[0]
    assert.equal(line.length, 51)
    assert.equal(line[0]?.value, computeEmaLine(candles, EMA_100_PERIOD)[0]?.value)
  })
})

describe('updateDualEmaLive', () => {
  it('routes live updates to the EMA 200 series', () => {
    const ema100 = makeLineSeries()
    const ema200 = makeLineSeries()
    const candles = Array.from({ length: 200 }, (_, i) => makeCandle(1_700_000_000 + i * 60, 1))
    const next = makeCandle(1_700_000_000 + 200 * 60, 2)
    updateDualEmaLive(ema100.series, ema200.series, [...candles, next])
    assert.equal(ema200.updates.length, 1)
    const fullLine = computeEmaLine([...candles, next], EMA_200_PERIOD)
    assert.equal(ema200.updates[0]?.value, fullLine[fullLine.length - 1]?.value)
  })

  it('does not update EMA 200 when fewer than 200 candles', () => {
    const ema100 = makeLineSeries()
    const ema200 = makeLineSeries()
    const candles = Array.from({ length: 10 }, (_, i) => makeCandle(1_700_000_000 + i * 60, 1))
    const next = makeCandle(1_700_000_000 + 10 * 60, 2)
    updateDualEmaLive(ema100.series, ema200.series, [...candles, next])
    assert.equal(ema200.updates.length, 0)
  })

  it('routes live updates to the EMA 100 series when enough history exists', () => {
    const ema100 = makeLineSeries()
    const ema200 = makeLineSeries()
    const candles = Array.from({ length: 100 }, (_, i) => makeCandle(1_700_000_000 + i * 60, 1))
    const next = makeCandle(1_700_000_000 + 100 * 60, 2)
    updateDualEmaLive(ema100.series, ema200.series, [...candles, next])
    assert.equal(ema100.updates.length, 1)
    const fullLine = computeEmaLine([...candles, next], EMA_100_PERIOD)
    assert.equal(ema100.updates[0]?.value, fullLine[fullLine.length - 1]?.value)
  })
})

function trackEmaVisibilityBundle(emaCount = 3) {
  const tripleEmaVisibility: boolean[] = []
  const dualEma100Visibility: boolean[] = []
  const dualEma200Visibility: boolean[] = []

  const makeLine = (log: boolean[]) =>
    ({
      applyOptions: (opts: { visible?: boolean }) => {
        if (typeof opts.visible === 'boolean') log.push(opts.visible)
      },
    }) as EmaIndicatorSeriesBundle['ema200']

  const bundle: EmaIndicatorSeriesBundle = {
    emas: Array.from({ length: emaCount }, () => makeLine(tripleEmaVisibility)),
    ema100: makeLine(dualEma100Visibility),
    ema200: makeLine(dualEma200Visibility),
  }

  return { bundle, tripleEmaVisibility, dualEma100Visibility, dualEma200Visibility }
}

function lastTripleEmaVisibility(tripleEmaVisibility: boolean[], emaCount: number) {
  assert.equal(tripleEmaVisibility.length % emaCount, 0)
  const start = tripleEmaVisibility.length - emaCount
  return tripleEmaVisibility.slice(start)
}

describe('applyEmaIndicatorSeriesVisibility', () => {
  const emaCount = 3

  it('shows triple EMA lines and hides 2 EMA when only triple-ema is selected', () => {
    const { bundle, tripleEmaVisibility, dualEma100Visibility, dualEma200Visibility } =
      trackEmaVisibilityBundle(emaCount)
    applyEmaIndicatorSeriesVisibility(bundle, ['triple-ema'])
    assert.deepEqual(lastTripleEmaVisibility(tripleEmaVisibility, emaCount), [true, true, true])
    assert.deepEqual(dualEma100Visibility, [false])
    assert.deepEqual(dualEma200Visibility, [false])
  })

  it('hides triple EMA lines and shows both 2 EMA lines when only dual-ema is selected', () => {
    const { bundle, tripleEmaVisibility, dualEma100Visibility, dualEma200Visibility } =
      trackEmaVisibilityBundle(emaCount)
    applyEmaIndicatorSeriesVisibility(bundle, ['dual-ema'])
    assert.deepEqual(lastTripleEmaVisibility(tripleEmaVisibility, emaCount), [false, false, false])
    assert.deepEqual(dualEma100Visibility, [true])
    assert.deepEqual(dualEma200Visibility, [true])
  })

  it('shows both bundles when both indicators are selected', () => {
    const { bundle, tripleEmaVisibility, dualEma100Visibility, dualEma200Visibility } =
      trackEmaVisibilityBundle(emaCount)
    applyEmaIndicatorSeriesVisibility(bundle, ['triple-ema', 'dual-ema'])
    assert.deepEqual(lastTripleEmaVisibility(tripleEmaVisibility, emaCount), [true, true, true])
    assert.deepEqual(dualEma100Visibility, [true])
    assert.deepEqual(dualEma200Visibility, [true])
  })

  it('leaves 2 EMA visibility unchanged when toggling triple-ema', () => {
    const { bundle, tripleEmaVisibility, dualEma100Visibility, dualEma200Visibility } =
      trackEmaVisibilityBundle(emaCount)
    applyEmaIndicatorSeriesVisibility(bundle, ['dual-ema'])
    applyEmaIndicatorSeriesVisibility(bundle, ['triple-ema', 'dual-ema'])
    applyEmaIndicatorSeriesVisibility(bundle, ['dual-ema'])
    assert.deepEqual(dualEma100Visibility, [true, true, true])
    assert.deepEqual(dualEma200Visibility, [true, true, true])
    assert.deepEqual(lastTripleEmaVisibility(tripleEmaVisibility, emaCount), [false, false, false])
  })

  it('leaves triple EMA visibility unchanged when toggling dual-ema', () => {
    const { bundle, tripleEmaVisibility, dualEma100Visibility, dualEma200Visibility } =
      trackEmaVisibilityBundle(emaCount)
    applyEmaIndicatorSeriesVisibility(bundle, ['triple-ema'])
    applyEmaIndicatorSeriesVisibility(bundle, ['triple-ema', 'dual-ema'])
    applyEmaIndicatorSeriesVisibility(bundle, ['triple-ema'])
    assert.deepEqual(lastTripleEmaVisibility(tripleEmaVisibility, emaCount), [true, true, true])
    assert.deepEqual(dualEma100Visibility, [false, true, false])
    assert.deepEqual(dualEma200Visibility, [false, true, false])
  })
})
