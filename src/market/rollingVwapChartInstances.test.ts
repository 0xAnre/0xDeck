import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
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

function trackChartBundle() {
  const counters = { setData: 0, update: 0, remove: 0, add: 0 }
  const makeLine = () => ({
    setData: () => {
      counters.setData += 1
    },
    update: () => {
      counters.update += 1
    },
    applyOptions: () => {},
  })

  const chart = {
    addSeries: () => {
      counters.add += 1
      return makeLine()
    },
    removeSeries: () => {
      counters.remove += 1
    },
  } as IChartApi

  const bundle: ChartSeriesBundle = {
    candle: makeLine() as ChartSeriesBundle['candle'],
    emas: [],
    dailyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['dailyVwap'],
    weeklyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['weeklyVwap'],
    monthlyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['monthlyVwap'],
    quarterlyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['quarterlyVwap'],
    yearlyVwap: { byKey: {}, ordered: [] } as ChartSeriesBundle['yearlyVwap'],
    rollingVwaps: new Map(),
  }

  return { chart, bundle, counters }
}

describe('reconcileRollingVwapChartBundles', () => {
  it('creates seven series per instance and removes deleted instance series', () => {
    const { chart, bundle, counters } = trackChartBundle()
    const a = createRollingVwapInstance({ id: 'a', randomId: () => 'a' })
    const b = createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' })
    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, [a, b], '1m')
    assert.equal(bundle.rollingVwaps.size, 2)
    assert.equal(counters.add, 14)

    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, [a], '1m')
    assert.equal(bundle.rollingVwaps.size, 1)
    assert.equal(counters.remove, 7)
  })
})

describe('rolling vwap instance history and live', () => {
  it('uses setData for two instances with different settings', () => {
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
    const candles = [
      candle({ time: 1_700_000_000, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: 1_700_000_060, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    applyRollingVwapInstancesHistory(bundle, candles, instances)
    assert.equal(counters.setData, 14)
    assert.equal(counters.update, 0)
  })

  it('uses update for live ticks on each instance', () => {
    const { chart, bundle, counters } = trackChartBundle()
    const instances = [
      createRollingVwapInstance({ id: 'a', randomId: () => 'a' }),
      createRollingVwapInstance({ id: 'b', existingIds: new Set(['a']), randomId: () => 'b' }),
    ]
    reconcileRollingVwapChartBundles(chart, bundle.rollingVwaps, instances, '1m')
    counters.update = 0
    const candles = [candle({ close: 10, volume: 1 })]
    applyRollingVwapInstancesLive(candles, bundle, instances, '1m')
    assert.equal(counters.update, 14)
    assert.equal(counters.setData, 0)
  })
})
