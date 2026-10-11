import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { LineStyle } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { createEmptyRollingVwapChartInstanceMap } from './rollingVwapChartInstances.ts'
import {
  applyMarketIndicatorPresentationToBundle,
  marketIndicatorPresentationLineOptions,
} from './marketIndicatorPresentationApply.ts'

function createMockLineSeries() {
  const applied: Record<string, unknown>[] = []
  return {
    applied,
    applyOptions: (options: Record<string, unknown>) => {
      applied.push(options)
    },
    setData: () => {},
  }
}

function createMockBundle(): ChartSeriesBundle {
  const ema0 = createMockLineSeries()
  const ema1 = createMockLineSeries()
  const ema2 = createMockLineSeries()
  const ema100 = createMockLineSeries()
  const ema200 = createMockLineSeries()
  const dailyVwap = createMockLineSeries()
  const rollingCenter = createMockLineSeries()

  return {
    candle: { setData: () => {} } as ChartSeriesBundle['candle'],
    emas: [ema0, ema1, ema2] as ChartSeriesBundle['emas'],
    ema100: ema100 as ChartSeriesBundle['ema100'],
    ema200: ema200 as ChartSeriesBundle['ema200'],
    dailyVwap: {
      byKey: { vwap: dailyVwap },
      ordered: [dailyVwap],
      band: { update: () => {} },
    } as ChartSeriesBundle['dailyVwap'],
    weeklyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: { update: () => {} },
    } as ChartSeriesBundle['weeklyVwap'],
    monthlyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: { update: () => {} },
    } as ChartSeriesBundle['monthlyVwap'],
    quarterlyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: { update: () => {} },
    } as ChartSeriesBundle['quarterlyVwap'],
    yearlyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: { update: () => {} },
    } as ChartSeriesBundle['yearlyVwap'],
    rollingVwaps: new Map([
      [
        'rv-1',
        {
          center: rollingCenter,
          bands: {},
          ordered: [rollingCenter],
        },
      ],
    ]) as ChartSeriesBundle['rollingVwaps'],
  }
}

describe('marketIndicatorPresentationLineOptions', () => {
  it('maps presentation fields to line series options', () => {
    const options = marketIndicatorPresentationLineOptions({
      color: '#112233',
      lineWidth: 3,
      lineStyle: 'dotted',
    })
    assert.equal(options.color, '#112233')
    assert.equal(options.lineWidth, 3)
    assert.equal(options.lineStyle, LineStyle.Dotted)
  })
})

describe('applyMarketIndicatorPresentationToBundle', () => {
  it('applies triple-ema presentation to all EMA series', () => {
    const bundle = createMockBundle()
    applyMarketIndicatorPresentationToBundle(bundle, 'triple-ema', {
      color: '#abcdef',
      lineWidth: 2,
    })
    for (const series of bundle.emas) {
      const mock = series as ReturnType<typeof createMockLineSeries>
      assert.deepEqual(mock.applied[0], { color: '#abcdef', lineWidth: 2 })
    }
  })

  it('applies daily-vwap presentation to every rendered line in the bundle', () => {
    const bundle = createMockBundle()
    const previousUpper = createMockLineSeries()
    const previousLower = createMockLineSeries()
    bundle.dailyVwap.ordered.push(
      previousUpper as ChartSeriesBundle['dailyVwap']['ordered'][number],
      previousLower as ChartSeriesBundle['dailyVwap']['ordered'][number],
    )
    applyMarketIndicatorPresentationToBundle(bundle, 'daily-vwap', {
      color: '#445566',
      lineStyle: 'dashed',
    })
    for (const series of bundle.dailyVwap.ordered) {
      const mock = series as ReturnType<typeof createMockLineSeries>
      assert.equal(mock.applied[0]?.color, '#445566')
      assert.equal(mock.applied[0]?.lineStyle, LineStyle.Dashed)
    }
  })

  it('applies rolling-vwap presentation to each instance center line', () => {
    const bundle = createMockBundle()
    applyMarketIndicatorPresentationToBundle(bundle, 'rolling-vwap', { lineWidth: 4 })
    const center = bundle.rollingVwaps.get('rv-1')?.center as ReturnType<
      typeof createMockLineSeries
    >
    assert.equal(center.applied[0]?.lineWidth, 4)
    assert.equal(createEmptyRollingVwapChartInstanceMap().size, 0)
  })
})
