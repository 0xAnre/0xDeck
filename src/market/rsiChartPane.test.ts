import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AutoscaleInfoProvider, IChartApi, LineSeriesPartialOptions, PriceLineOptions } from 'lightweight-charts'
import {
  applyRsiPaneSettings,
  clearRsiPaneData,
  createRsiChartPane,
  moveRsiPaneAbove,
  removeRsiChartPane,
  RSI_PANE_STRETCH_FACTOR,
  setRsiPaneHistoryData,
  updateRsiPaneLiveData,
  type RsiChartPaneBundle,
} from './rsiChartPane.ts'
import { computeWilderRsi, RSI_MID_LEVEL, type RsiSettings } from './rsi.ts'
import {
  RSI_OVERBOUGHT_LINE_COLOR,
  RSI_OVERSOLD_LINE_COLOR,
} from './rsiLineColors.ts'
import type { MarketCandle } from './types.ts'

type FakeLinePoint = { time: number; value: number; color?: string }

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

/** Candles from a close series (index i gets time i), one candle per minute. */
function candlesFromCloses(closes: readonly number[]): MarketCandle[] {
  return closes.map((close, index) => makeCandle(index, close))
}

/** RSI 100 on every point: strictly rising closes are always overbought. */
function risingCandles(count = 20): MarketCandle[] {
  return candlesFromCloses(Array.from({ length: count }, (_, index) => 100 + index))
}

/** RSI 0 on every point: strictly falling closes are always oversold. */
function fallingCandles(count = 20): MarketCandle[] {
  return candlesFromCloses(Array.from({ length: count }, (_, index) => 120 - index))
}

/** RSI oscillates around 50 (48.2–53.6 for period 14): strictly between 70/30. */
function oscillatingCandles(count = 30): MarketCandle[] {
  const closes: number[] = [100]
  for (let index = 1; index < count; index += 1) {
    closes.push(closes[index - 1] + (index % 2 === 1 ? 1 : -1))
  }
  return candlesFromCloses(closes)
}

function makeSeries() {
  const setDataCalls: FakeLinePoint[][] = []
  const updateCalls: FakeLinePoint[] = []
  const createdPriceLines: FakePriceLine[] = []
  const applyOptionsCalls: LineSeriesPartialOptions[] = []
  const series = {
    setData: (data: FakeLinePoint[]) => {
      setDataCalls.push(data)
    },
    update: (point: FakeLinePoint) => {
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
  let paneIndex = 1

  const pane = {
    setStretchFactor: (factor: number) => {
      calls.push(`stretchFactor:${factor}`)
    },
    paneIndex: () => paneIndex,
    moveTo: (target: number) => {
      calls.push(`moveTo:${target}`)
      paneIndex = target
    },
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
    setPaneIndex: (next: number) => {
      paneIndex = next
    },
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
    return risingCandles(20)
  }

  function pointColors(points: readonly FakeLinePoint[]): (string | undefined)[] {
    return points.map((point) => point.color)
  }

  it('sets Wilder RSI history computed from the candles', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    setRsiPaneHistoryData(bundle, candles())

    const expected = computeWilderRsi(candles(), 14)
    assert.equal(harness.seriesBundle.setDataCalls.length, 1)
    // Points also carry a threshold color now, so compare the RSI values only.
    assert.deepEqual(
      harness.seriesBundle.setDataCalls[0].map(({ time, value }) => ({ time, value })),
      expected,
    )
  })

  it('colors every history point from the thresholds, not just the last one', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)

    setRsiPaneHistoryData(bundle, risingCandles(20))
    const overboughtPoints = harness.seriesBundle.setDataCalls.at(-1) ?? []
    assert.equal(overboughtPoints.length, computeWilderRsi(risingCandles(20), 14).length)
    assert.deepEqual(pointColors(overboughtPoints), [
      ...Array.from({ length: overboughtPoints.length }, () => RSI_OVERBOUGHT_LINE_COLOR),
    ])

    setRsiPaneHistoryData(bundle, fallingCandles(20))
    const oversoldPoints = harness.seriesBundle.setDataCalls.at(-1) ?? []
    assert.equal(oversoldPoints.length, computeWilderRsi(fallingCandles(20), 14).length)
    assert.deepEqual(pointColors(oversoldPoints), [
      ...Array.from({ length: oversoldPoints.length }, () => RSI_OVERSOLD_LINE_COLOR),
    ])
  })

  it('keeps the series line color for history points between the thresholds', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    setRsiPaneHistoryData(bundle, oscillatingCandles(30))

    const points = harness.seriesBundle.setDataCalls[0] ?? []
    const values = computeWilderRsi(oscillatingCandles(30), 14)
    assert.equal(points.length, values.length)
    for (const [index, point] of points.entries()) {
      assert.equal(point.value, values[index].value)
      assert.ok(point.value > DEFAULTS.oversold && point.value < DEFAULTS.overbought)
      assert.equal('color' in point, false)
    }
  })

  it('recolors the already-loaded line when only the thresholds change', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    const history = oscillatingCandles(30)
    setRsiPaneHistoryData(bundle, history)
    assert.deepEqual(pointColors(harness.seriesBundle.setDataCalls[0] ?? []), [
      ...Array.from({ length: computeWilderRsi(history, 14).length }, () => undefined),
    ])

    // Mirrors `handleRsiSettingsChange`: apply the settings, then recolor from
    // the candles that are already loaded (no refetch).
    applyRsiPaneSettings(bundle, { period: 14, overbought: 40, oversold: 20 })
    setRsiPaneHistoryData(bundle, history)
    const redPoints = harness.seriesBundle.setDataCalls.at(-1) ?? []
    assert.deepEqual(pointColors(redPoints), [
      ...Array.from({ length: redPoints.length }, () => RSI_OVERBOUGHT_LINE_COLOR),
    ])

    applyRsiPaneSettings(bundle, { period: 14, overbought: 90, oversold: 60 })
    setRsiPaneHistoryData(bundle, history)
    const greenPoints = harness.seriesBundle.setDataCalls.at(-1) ?? []
    assert.deepEqual(pointColors(greenPoints), [
      ...Array.from({ length: greenPoints.length }, () => RSI_OVERSOLD_LINE_COLOR),
    ])
  })

  it('updates only the last RSI point on a live candle', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    const live = [...candles(), makeCandle(20, 140)]
    updateRsiPaneLiveData(bundle, live)

    const expected = computeWilderRsi(live, 14)
    const last = expected[expected.length - 1]
    // The live point is overbought here, so it also carries the red override.
    assert.deepEqual(harness.seriesBundle.updateCalls, [
      { ...last, color: RSI_OVERBOUGHT_LINE_COLOR },
    ])
  })

  it('carries the threshold color on live updates in both directions', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)

    updateRsiPaneLiveData(bundle, fallingCandles(20))
    assert.deepEqual(pointColors(harness.seriesBundle.updateCalls), [
      RSI_OVERSOLD_LINE_COLOR,
    ])

    updateRsiPaneLiveData(bundle, risingCandles(20))
    assert.deepEqual(pointColors(harness.seriesBundle.updateCalls), [
      RSI_OVERSOLD_LINE_COLOR,
      RSI_OVERBOUGHT_LINE_COLOR,
    ])
  })

  it('omits the color on a live update between the thresholds', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    const live = oscillatingCandles(31)
    updateRsiPaneLiveData(bundle, live)

    const [update] = harness.seriesBundle.updateCalls
    const values = computeWilderRsi(live, 14)
    assert.deepEqual(update, values[values.length - 1])
    assert.equal('color' in update, false)
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

describe('moveRsiPaneAbove', () => {
  it('moves the new RSI pane above a pane that must stay last (Bottom liquidations)', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    // `chart.addPane()` always appends, so the RSI pane starts below the
    // liquidations pane and has to move up one slot.
    harness.setPaneIndex(2)
    harness.calls.length = 0

    moveRsiPaneAbove(bundle, 1)

    assert.deepEqual(harness.calls, ['moveTo:1'])
    assert.equal(harness.pane.paneIndex(), 1)
  })

  it('never moves the RSI pane when it already sits at or above the target', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    harness.setPaneIndex(1)
    harness.calls.length = 0

    moveRsiPaneAbove(bundle, 1)
    moveRsiPaneAbove(bundle, 2)

    assert.deepEqual(harness.calls, [])
  })
})
