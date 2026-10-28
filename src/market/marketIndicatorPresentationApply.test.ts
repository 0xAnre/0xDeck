import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { LineStyle } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  applyMarketIndicatorPresentationToBundle,
  marketIndicatorPresentationLineOptions,
  syncWidgetMarketIndicatorPresentations,
} from './marketIndicatorPresentationApply.ts'
import { saveWidgetMarketIndicatorPresentation } from '../marketIndicatorPresentationStorage.ts'

const memory = new Map<string, string>()

beforeEach(() => {
  memory.clear()
  globalThis.localStorage = {
    get length() {
      return memory.size
    },
    clear() {
      memory.clear()
    },
    getItem(key: string) {
      return memory.get(key) ?? null
    },
    setItem(key: string, value: string) {
      memory.set(key, value)
    },
    removeItem(key: string) {
      memory.delete(key)
    },
    key(index: number) {
      return [...memory.keys()][index] ?? null
    },
  } as Storage
})

afterEach(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (globalThis as any).localStorage
})

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

function createMockBand() {
  const fillStyles: string[] = []
  return {
    fillStyles,
    update: () => {},
    setFillStyle: (fillStyle: string) => {
      fillStyles.push(fillStyle)
    },
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
      band: createMockBand(),
    } as ChartSeriesBundle['dailyVwap'],
    weeklyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: createMockBand(),
    } as ChartSeriesBundle['weeklyVwap'],
    monthlyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: createMockBand(),
    } as ChartSeriesBundle['monthlyVwap'],
    quarterlyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: createMockBand(),
    } as ChartSeriesBundle['quarterlyVwap'],
    yearlyVwap: {
      byKey: { vwap: createMockLineSeries() },
      ordered: [],
      band: createMockBand(),
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
    anchoredVwaps: new Map(),
    rsi: null,
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

  it('folds the independent opacity into the presentation color', () => {
    const options = marketIndicatorPresentationLineOptions({
      color: '#112233',
      opacity: 40,
    })
    assert.equal(options.color, 'rgba(17, 34, 51, 0.4)')
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
      lineStyle: 'dotted',
    })
    for (const series of bundle.dailyVwap.ordered) {
      const mock = series as ReturnType<typeof createMockLineSeries>
      assert.equal(mock.applied[0]?.color, '#445566')
      assert.equal(mock.applied[0]?.lineStyle, LineStyle.Dotted)
    }
  })

  it('applies the background fill independently from line styling', () => {
    const bundle = createMockBundle()
    applyMarketIndicatorPresentationToBundle(bundle, 'daily-vwap', {
      fillColor: '#123456',
      fillOpacity: 60,
    })
    assert.deepEqual(bundle.dailyVwap.band.fillStyles, ['rgba(18, 52, 86, 0.6)'])
    const vwap = bundle.dailyVwap.byKey.vwap as ReturnType<typeof createMockLineSeries>
    assert.deepEqual(vwap.applied, [])
    assert.deepEqual(bundle.weeklyVwap.band.fillStyles, [])
  })

  it('restores the palette fill default for an empty presentation', () => {
    const bundle = createMockBundle()
    applyMarketIndicatorPresentationToBundle(bundle, 'weekly-vwap', {})
    assert.deepEqual(bundle.weeklyVwap.band.fillStyles, ['rgba(163, 163, 163, 0.25)'])
  })

  it('keeps fill and line changes independent when both are present', () => {
    const bundle = createMockBundle()
    applyMarketIndicatorPresentationToBundle(bundle, 'daily-vwap', {
      color: '#445566',
      fillColor: '#123456',
      fillOpacity: 0,
    })
    assert.deepEqual(bundle.dailyVwap.band.fillStyles, ['rgba(18, 52, 86, 0)'])
    const vwap = bundle.dailyVwap.byKey.vwap as ReturnType<typeof createMockLineSeries>
    assert.equal(vwap.applied[0]?.color, '#445566')
  })

  it('applies an opacity-only presentation to each series own color', () => {
    const bundle = createMockBundle()
    const withColors = bundle.emas as unknown as {
      options?: () => Record<string, unknown>
      applied: Record<string, unknown>[]
    }[]
    const baseColors = ['#111111', '#222222', '#333333']
    withColors.forEach((mock, index) => {
      mock.options = () => ({ color: baseColors[index] })
    })
    applyMarketIndicatorPresentationToBundle(bundle, 'triple-ema', { opacity: 50 })
    assert.deepEqual(
      withColors.map((mock) => mock.applied[0]?.color),
      ['rgba(17, 17, 17, 0.5)', 'rgba(34, 34, 34, 0.5)', 'rgba(51, 51, 51, 0.5)'],
    )
  })

  it('is a documented no-op for rolling-vwap, whose instances own presentation', () => {
    const bundle = createMockBundle()
    applyMarketIndicatorPresentationToBundle(bundle, 'rolling-vwap', {
      color: '#112233',
      opacity: 40,
      lineWidth: 4,
      lineStyle: 'dotted',
    })
    const center = bundle.rollingVwaps.get('rv-1')?.center as ReturnType<
      typeof createMockLineSeries
    >
    assert.deepEqual(center.applied, [])
  })

  it('cannot override per-instance rolling-vwap settings during a global sync', () => {
    const bundle = createMockBundle()
    const center = bundle.rollingVwaps.get('rv-1')?.center as ReturnType<
      typeof createMockLineSeries
    >
    // Mirrors the per-instance presentation effect in the chart panel.
    center.applyOptions({
      color: 'rgba(0, 255, 0, 0.55)',
      lineWidth: 2,
      lineStyle: LineStyle.Dotted,
    })
    const instanceApplied = [...center.applied]

    saveWidgetMarketIndicatorPresentation('panel-a', 'rolling-vwap', {
      color: '#112233',
      lineWidth: 4,
      lineStyle: 'solid',
    })
    syncWidgetMarketIndicatorPresentations('panel-a', bundle)

    // An unrelated-indicator sync (the panel effect depends on activeIndicators)
    // leaves the instance center line exactly as the instance settings applied it.
    assert.deepEqual(center.applied, instanceApplied)
  })
})
