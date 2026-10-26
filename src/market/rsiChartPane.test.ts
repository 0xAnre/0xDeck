import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AutoscaleInfoProvider, IChartApi, LineSeriesPartialOptions, PriceLineOptions } from 'lightweight-charts'
import {
  applyRsiPaneSettings,
  clearRsiPaneData,
  createRsiChartPane,
  removeRsiChartPane,
  RSI_PANE_STRETCH_FACTOR,
  setRsiPaneHistoryData,
  updateRsiPaneLiveData,
  type RsiChartPaneBundle,
} from './rsiChartPane.ts'
import { computeWilderRsi, RSI_MID_LEVEL, type RsiSettings } from './rsi.ts'
import type { MarketCandle } from './types.ts'

type FakePriceLine = {
  options: PriceLineOptions
  applyOptionsCalls: Partial<PriceLineOptions>[]
  applyOptions: (options: Partial<PriceLineOptions>) => void
}

function makeCandle(index: number, close: number): MarketCandle {
  return {
    symbol: 'BTCUSDT',
    interval: '1m',
    time: 1_700_000_000 + index * 60,
    open: close,
    high: close,
    low: close,
    close,
    volume: 1,
    closed: true,
  }
}

function makeSeries() {
  const setDataCalls: { time: number; value: number }[][] = []
  const updateCalls: { time: number; value: number }[] = []
  const createdPriceLines: FakePriceLine[] = []
  const applyOptionsCalls: LineSeriesPartialOptions[] = []
  const series = {
    setData: (data: { time: number; value: number }[]) => {
      setDataCalls.push(data)
    },
    update: (point: { time: number; value: number }) => {
      updateCalls.push(point)
    },
    applyOptions: (options: LineSeriesPartialOptions) => {
      applyOptionsCalls.push(options)
    },
    createPriceLine: (options: PriceLineOptions) => {
      const priceLine: FakePriceLine = {
        options,
        applyOptionsCalls: [],
        applyOptions: (next) => {
          priceLine.applyOptionsCalls.push(next)
          priceLine.options = { ...priceLine.options, ...next }
        },
      }
      createdPriceLines.push(priceLine)
      return priceLine
    },
    options: () => ({ color: '#D4D4D4' }),
  }
  return { series, setDataCalls, updateCalls, createdPriceLines, applyOptionsCalls }
}

function makeChart() {
  const calls: string[] = []
  const seriesBundle = makeSeries()
  let createdSeriesOptions: LineSeriesPartialOptions = {}

  const pane = {
    setStretchFactor: (factor: number) => {
      calls.push(`stretchFactor:${factor}`)
    },
    paneIndex: () => 1,
    addSeries: (_definition: unknown, options: LineSeriesPartialOptions) => {
      calls.push('pane.addSeries')
      createdSeriesOptions = options
      return seriesBundle.series
    },
  }

  const chart = {
    addPane: () => {
      calls.push('chart.addPane')
      return pane
    },
    removeSeries: (series: unknown) => {
      calls.push(series === seriesBundle.series ? 'removeSeries:rsi' : 'removeSeries:other')
    },
    removePane: () => {
      calls.push('removePane')
    },
    panes: () => [pane],
  }

  return {
    chart: chart as unknown as IChartApi,
    calls,
    pane,
    seriesBundle,
    createdSeriesOptions: () => createdSeriesOptions,
  }
}

const DEFAULTS: RsiSettings = { period: 14, overbought: 70, oversold: 30 }

describe('createRsiChartPane', () => {
  it('creates its own native pane and adds the line series inside it', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)

    assert.deepEqual(harness.calls, [
      'chart.addPane',
      `stretchFactor:${RSI_PANE_STRETCH_FACTOR}`,
      'pane.addSeries',
    ])
    assert.equal(bundle.pane, harness.pane)
    assert.equal(bundle.series, harness.seriesBundle.series)
    assert.deepEqual(bundle.settings, DEFAULTS)
  })

  it('bounds the RSI scale to 0-100 through the series autoscale provider', () => {
    const harness = makeChart()
    createRsiChartPane(harness.chart, DEFAULTS)
    const provider = harness.createdSeriesOptions().autoscaleInfoProvider as AutoscaleInfoProvider
    assert.deepEqual(provider(() => null), {
      priceRange: { minValue: 0, maxValue: 100 },
    })
  })

  it('creates overbought, mid and oversold reference lines from the settings', () => {
    const harness = makeChart()
    createRsiChartPane(harness.chart, { period: 21, overbought: 80, oversold: 20 })
    assert.deepEqual(
      harness.seriesBundle.createdPriceLines.map((line) => line.options.price),
      [80, RSI_MID_LEVEL, 20],
    )
  })
})

describe('applyRsiPaneSettings', () => {
  it('moves only the overbought/oversold lines and keeps the bundle settings in sync', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    applyRsiPaneSettings(bundle, { period: 21, overbought: 85, oversold: 15 })

    const [overbought, mid, oversold] = harness.seriesBundle.createdPriceLines
    assert.deepEqual(bundle.settings, { period: 21, overbought: 85, oversold: 15 })
    assert.deepEqual(overbought.applyOptionsCalls, [{ price: 85, title: '85' }])
    assert.deepEqual(oversold.applyOptionsCalls, [{ price: 15, title: '15' }])
    assert.deepEqual(mid.applyOptionsCalls, [])
  })

  it('sanitizes invalid settings before applying them', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    applyRsiPaneSettings(bundle, { period: 0, overbought: 10, oversold: 90 })
    assert.deepEqual(bundle.settings, { period: 2, overbought: 70, oversold: 30 })
  })
})

describe('RSI pane data', () => {
  function candles(): MarketCandle[] {
    return Array.from({ length: 20 }, (_, index) => makeCandle(index, 100 + index))
  }

  it('sets Wilder RSI history computed from the candles', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    setRsiPaneHistoryData(bundle, candles())

    const expected = computeWilderRsi(candles(), 14)
    assert.equal(harness.seriesBundle.setDataCalls.length, 1)
    assert.deepEqual(harness.seriesBundle.setDataCalls[0], expected)
  })

  it('updates only the last RSI point on a live candle', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    const live = [...candles(), makeCandle(20, 140)]
    updateRsiPaneLiveData(bundle, live)

    const expected = computeWilderRsi(live, 14)
    const last = expected[expected.length - 1]
    assert.deepEqual(harness.seriesBundle.updateCalls, [last])
  })

  it('skips live updates while there are not enough candles for the period', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    updateRsiPaneLiveData(bundle, [makeCandle(0, 100), makeCandle(1, 101)])
    assert.deepEqual(harness.seriesBundle.updateCalls, [])
  })

  it('clears the line without touching the pane', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    clearRsiPaneData(bundle)
    assert.deepEqual(harness.seriesBundle.setDataCalls, [[]])
    assert.deepEqual(harness.calls, [
      'chart.addPane',
      `stretchFactor:${RSI_PANE_STRETCH_FACTOR}`,
      'pane.addSeries',
    ])
  })
})

describe('removeRsiChartPane', () => {
  it('removes only the RSI series and never a pane index', () => {
    const harness = makeChart()
    const bundle: RsiChartPaneBundle = createRsiChartPane(harness.chart, DEFAULTS)
    removeRsiChartPane(harness.chart, bundle)

    assert.deepEqual(harness.calls.slice(-1), ['removeSeries:rsi'])
    assert.equal(harness.calls.includes('removePane'), false)
    assert.equal(harness.calls.includes('removeSeries:other'), false)
  })
})
