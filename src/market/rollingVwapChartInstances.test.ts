import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi, ISeriesPrimitive } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  applyRollingVwapInstanceSettingsToChart,
  applyRollingVwapInstancesHistory,
  applyRollingVwapInstancesLive,
  reconcileRollingVwapChartBundles,
} from './rollingVwapChartInstances.ts'
import { createRollingVwapInstance } from './rollingVwapInstances.ts'
import { createDefaultRollingVwapSettings } from './rollingVwapSettings.ts'
import type { MarketCandle } from './types.ts'

function candle(overrides: Partial<MarketCandle> = {}): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_700_000_000,
    open: 1,
    high: 10,
    low: 4,
    close: 7,
    volume: 2,
    closed: true,
    ...overrides,
  }
}

type FakeSeries = {
  setDataCount: number
  updateCount: number
  options: Record<string, unknown>
  attachPrimitive: (primitive: ISeriesPrimitive) => void
  detachPrimitive: (primitive: ISeriesPrimitive) => void
  priceToCoordinate: (price: number) => number
  priceScale: () => { options: () => { mode: number } }
  barsInLogicalRange: () => null
}

function makeLine(): FakeSeries {
  const series: FakeSeries = {
    setDataCount: 0,
    updateCount: 0,
    options: {},
    attachPrimitive: () => {},
    detachPrimitive: () => {},
    priceToCoordinate: (price) => 1000 - price,
    priceScale: () => ({ options: () => ({ mode: 0 }) }),
    barsInLogicalRange: () => null,
  }
  return series
}

function trackChartBundle() {
  const counters = { setData: 0, update: 0, remove: 0, add: 0 }
  const makeTrackedLine = () => {
    const series = makeLine()
    const setData = () => {
      counters.setData += 1
      series.setDataCount += 1
    }
    const update = () => {
      counters.update += 1
      series.updateCount += 1
    }
    return { series, setData, update }
  }

  const chart = {
    addSeries: (_definition: unknown, options: Record<string, unknown> = {}) => {
      counters.add += 1
      const { series, setData, update } = makeTrackedLine()
      series.options = { ...options }
      return Object.assign(series, {
        setData,
        update,
        applyOptions: (next: Record<string, unknown>) => {
          Object.assign(series.options, next)
        },
      })
    },
    removeSeries: () => {
      counters.remove += 1
    },
    timeScale: () => ({
      getVisibleRange: () => null,
      timeToCoordinate: () => null,
      options: () => ({ barSpacing: 6 }),
    }),
  } as unknown as IChartApi

  const untracked = makeLine()
  const bundle: ChartSeriesBundle = {
    candle: untracked as unknown as ChartSeriesBundle['candle'],
    emas: [],
    ema100: untracked as unknown as ChartSeriesBundle['ema100'],
    ema200: untracked as unknown as ChartSeriesBundle['ema200'],
    dailyVwap: { byKey: {}, ordered: [] } as unknown as ChartSeriesBundle['dailyVwap'],
    weeklyVwap: { byKey: {}, ordered: [] } as unknown as ChartSeriesBundle['weeklyVwap'],
    monthlyVwap: { byKey: {}, ordered: [] } as unknown as ChartSeriesBundle['monthlyVwap'],
    quarterlyVwap: { byKey: {}, ordered: [] } as unknown as ChartSeriesBundle['quarterlyVwap'],
    yearlyVwap: { byKey: {}, ordered: [] } as unknown as ChartSeriesBundle['yearlyVwap'],
    rollingVwaps: new Map(),
    anchoredVwaps: new Map(),
    rsi: null,
  }

  return { chart, bundle, counters }
}

describe('applyRollingVwapInstanceSettingsToChart', () => {
  it('reapplies centre width and per-band primitive styles without recreating series', () => {
    const { chart, bundle, counters } = trackChartBundle()
    const instance = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, [instance], '1m')
    const chartBundle = bundle.rollingVwaps.get('a')
    assert.ok(chartBundle)
    const addsBefore = counters.add

    instance.settings.lineWidth = 2
    instance.settings.bandLineWidths = { band1: 2, band2: 3, band3: 4 }
    applyRollingVwapInstanceSettingsToChart(chartBundle, instance, '1m')

    assert.equal(counters.add, addsBefore)
    const center = chartBundle.center as unknown as FakeSeries
    assert.equal(center.options.lineWidth, 2)
    assert.equal(chartBundle.bands.getStyle().outlines.upper1.widthPx, 2)
    assert.equal(chartBundle.bands.getStyle().outlines.lower2.widthPx, 3)
    assert.equal(chartBundle.bands.getStyle().outlines.upper3.widthPx, 4)
  })
})

describe('reconcileRollingVwapChartBundles', () => {
  it('creates one native series per instance and removes deleted instance series', () => {
    const { chart, bundle, counters } = trackChartBundle()
    const a = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    const b = createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' })
    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, [a, b], '1m')
    assert.equal(bundle.rollingVwaps.size, 2)
    assert.equal(counters.add, 2)

    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, [a], '1m')
    assert.equal(bundle.rollingVwaps.size, 1)
    assert.equal(counters.remove, 1)
  })
})

describe('rolling vwap instance history and live', () => {
  it('uses one centre setData per instance with different settings', () => {
    const { chart, bundle, counters } = trackChartBundle()
    const settingsA = createDefaultRollingVwapSettings()
    settingsA.minBars = 2
    const settingsB = createDefaultRollingVwapSettings()
    settingsB.minBars = 4
    const instances = [
      createRollingVwapInstance({ id: 'a', settings: settingsA, randomId: () => 'a' }),
      createRollingVwapInstance({ id: 'b', settings: settingsB, existingIds: new Set(['a']), randomId: () => 'b' }),
    ]
    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, instances, '1m')
    counters.setData = 0
    counters.update = 0
    const candles = [
      candle({ time: 1_700_000_000, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: 1_700_000_060, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    applyRollingVwapInstancesHistory(bundle, candles, instances)
    // One native data write per instance; the six band outlines are one
    // primitive and never call the native series API.
    assert.equal(counters.setData, 2)
    assert.equal(counters.update, 0)
  })

  it('uses one centre update per instance for live ticks', () => {
    const { chart, bundle, counters } = trackChartBundle()
    const instances = [
      createRollingVwapInstance({ id: 'a', randomId: () => 'a' }),
      createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' }),
    ]
    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, instances, '1m')
    counters.update = 0
    counters.setData = 0
    const candles = [candle({ close: 10, volume: 1 })]
    applyRollingVwapInstancesLive(candles, bundle, instances, '1m')
    assert.equal(counters.update, 2)
    assert.equal(counters.setData, 0)
  })

  it('clears every instance centre when the candle source is empty', () => {
    const { chart, bundle, counters } = trackChartBundle()
    const instances = [createRollingVwapInstance({ id: 'a', randomId: () => 'a' })]
    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, instances, '1m')
    counters.setData = 0
    applyRollingVwapInstancesHistory(bundle, [], instances)
    assert.equal(counters.setData, 1)
  })
})
