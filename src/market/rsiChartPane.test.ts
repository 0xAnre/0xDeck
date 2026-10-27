import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { AutoscaleInfoProvider, IChartApi, LineSeriesPartialOptions, PriceLineOptions } from 'lightweight-charts'
import {
  applyRsiPaneSettings,
  clearRsiPaneData,
  computeRsiPaneStretchFactor,
  createRsiChartPane,
  moveRsiPaneAbove,
  removeRsiChartPane,
  RSI_PANE_HEIGHT_SHARE,
  rsiPaneHeightShare,
  setRsiPaneHistoryData,
  sumPaneStretchFactors,
  updateRsiPaneLiveData,
  type RsiChartPaneBundle,
} from './rsiChartPane.ts'
import { computeWilderRsi, RSI_MID_LEVEL, type RsiSettings } from './rsi.ts'
import { resolveChartPaneRolePane } from './chartPaneRoles.ts'
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
    getPane: () => getPane(),
  }
  let getPane = () => ({}) as never
  return {
    series,
    setDataCalls,
    updateCalls,
    createdPriceLines,
    applyOptionsCalls,
    setPane: (pane: unknown) => {
      getPane = () => pane as never
    },
  }
}

/**
 * Fake chart with pane-level stretch-factor state, mirroring how Lightweight
 * Charts sizes panes (`height = factor / totalStretch * plotHeight`). Pane index
 * 0 is the candle pane, seeded by `createChart({ addDefaultPane })` with
 * `DEFAULT_STRETCH_FACTOR * 2` (= 2).
 */
function makeChart(initialPaneStretchFactors: readonly number[] = [2]) {
  const calls: string[] = []
  const seriesBundle = makeSeries()
  let createdSeriesOptions: LineSeriesPartialOptions = {}

  type PaneState = { stretchFactor: number; index: number }
  const paneStates: PaneState[] = initialPaneStretchFactors.map(
    (stretchFactor, index) => ({ stretchFactor, index }),
  )
  // The RSI pane is appended by `chart.addPane()`, like the library does.
  const rsiState: PaneState = { stretchFactor: 1, index: paneStates.length }

  const paneApi = (state: PaneState) => ({
    setStretchFactor: (factor: number) => {
      state.stretchFactor = factor
      calls.push(`stretchFactor:${factor}`)
    },
    getStretchFactor: () => state.stretchFactor,
    paneIndex: () => state.index,
    moveTo: (target: number) => {
      calls.push(`moveTo:${target}`)
      state.index = target
    },
    addSeries: (_definition: unknown, options: LineSeriesPartialOptions) => {
      calls.push('pane.addSeries')
      createdSeriesOptions = options
      return seriesBundle.series
    },
  })

  const pane = paneApi(rsiState)
  seriesBundle.setPane(pane)

  const chart = {
    addPane: () => {
      calls.push('chart.addPane')
      paneStates.push(rsiState)
      return pane
    },
    removeSeries: (series: unknown) => {
      calls.push(series === seriesBundle.series ? 'removeSeries:rsi' : 'removeSeries:other')
    },
    removePane: () => {
      calls.push('removePane')
    },
    // The library returns a fresh `IPaneApi` per call, so tests must never rely
    // on object identity here.
    panes: () => paneStates.map((state) => paneApi(state)),
  }

  return {
    chart: chart as unknown as IChartApi,
    calls,
    pane,
    paneStates,
    seriesBundle,
    setPaneIndex: (next: number) => {
      rsiState.index = next
    },
    /** Simulate a user dragging the candle/RSI separator: totals are preserved. */
    dragPaneSeparator: (candleStretchFactor: number, rsiStretchFactor: number) => {
      paneStates[0].stretchFactor = candleStretchFactor
      rsiState.stretchFactor = rsiStretchFactor
    },
    stretchFactorCalls: () =>
      calls.filter((call) => call.startsWith('stretchFactor:')),
    createdSeriesOptions: () => createdSeriesOptions,
  }
}

const DEFAULTS: RsiSettings = { period: 14, overbought: 70, oversold: 30 }

/** Candle pane baseline seeded by `createChart({ addDefaultPane })`. */
const CANDLE_BASELINE = 2

/** Stretch factor the RSI pane opens with on a fresh chart. */
const DEFAULT_STRETCH_FACTOR = computeRsiPaneStretchFactor(CANDLE_BASELINE)

function assertShare(actual: number, expected: number, message?: string): void {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    message ?? `expected share ${expected}, got ${actual}`,
  )
}

describe('createRsiChartPane', () => {
  it('creates its own native pane and adds the line series inside it', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)

    assert.deepEqual(harness.calls, [
      'chart.addPane',
      `stretchFactor:${DEFAULT_STRETCH_FACTOR}`,
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

describe('RSI pane role registration', () => {
  it('registers the pane by series identity and forgets it on removal', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    assert.equal(resolveChartPaneRolePane(harness.chart, 'rsi'), harness.pane)

    removeRsiChartPane(harness.chart, bundle)
    assert.equal(resolveChartPaneRolePane(harness.chart, 'rsi'), null)
    assert.equal(harness.calls.at(-1), 'removeSeries:rsi')
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
      `stretchFactor:${DEFAULT_STRETCH_FACTOR}`,
      'pane.addSeries',
    ])
  })
})

describe('RSI pane default height', () => {
  it('derives the stretch factor from the candle-pane baseline so the pane opens at 25 %', () => {
    const factor = computeRsiPaneStretchFactor(CANDLE_BASELINE)
    // The old constant 0.35 only produced 0.35 / (2 + 0.35) ≈ 14.9 %.
    assert.equal(factor, (CANDLE_BASELINE * RSI_PANE_HEIGHT_SHARE) / (1 - RSI_PANE_HEIGHT_SHARE))
    assertShare(factor / (CANDLE_BASELINE + factor), RSI_PANE_HEIGHT_SHARE)
    assert.ok(Math.abs(RSI_PANE_HEIGHT_SHARE - 0.25) < 1e-9)
  })

  it('keeps the share at 25 % for any other-pane total (dragged candles, extra panes)', () => {
    for (const otherStretchTotal of [1, 1.4, 2, 3.5, 8]) {
      const factor = computeRsiPaneStretchFactor(otherStretchTotal)
      assertShare(factor / (otherStretchTotal + factor), RSI_PANE_HEIGHT_SHARE)
    }
  })

  it('falls back to the candle-pane baseline when the chart reports no other panes', () => {
    const fallback = computeRsiPaneStretchFactor(CANDLE_BASELINE)
    assert.equal(computeRsiPaneStretchFactor(0), fallback)
    assert.equal(computeRsiPaneStretchFactor(-1), fallback)
    assert.equal(computeRsiPaneStretchFactor(Number.NaN), fallback)
    assert.equal(computeRsiPaneStretchFactor(Number.POSITIVE_INFINITY), fallback)
  })

  it('clamps a degenerate remembered share instead of collapsing the pane', () => {
    const clampedMax = computeRsiPaneStretchFactor(CANDLE_BASELINE, 0.8)
    assert.equal(computeRsiPaneStretchFactor(CANDLE_BASELINE, 0.99), clampedMax)
    assert.ok(computeRsiPaneStretchFactor(CANDLE_BASELINE, 0) > 0)
    assert.equal(
      computeRsiPaneStretchFactor(CANDLE_BASELINE, Number.NaN),
      computeRsiPaneStretchFactor(CANDLE_BASELINE),
    )
  })

  it('sets the sizing factor once, on creation, using the live total of other panes', () => {
    // Candle pane only: 2.
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    assert.equal(sumPaneStretchFactors(harness.chart), CANDLE_BASELINE + DEFAULT_STRETCH_FACTOR)
    assertShare(rsiPaneHeightShare(harness.chart, bundle.pane) ?? 0, RSI_PANE_HEIGHT_SHARE)

    // Candle pane plus a fixed-height liquidations pane that is already there.
    const withLiquidations = makeChart([CANDLE_BASELINE, 0.7])
    const liquidationsBundle = createRsiChartPane(withLiquidations.chart, DEFAULTS)
    assertShare(
      rsiPaneHeightShare(withLiquidations.chart, liquidationsBundle.pane) ?? 0,
      RSI_PANE_HEIGHT_SHARE,
    )
  })

  it('never re-applies the default factor on later RSI updates (manual drag wins)', () => {
    const harness = makeChart()
    const bundle = createRsiChartPane(harness.chart, DEFAULTS)
    // The user drags the candle/RSI separator: the pair keeps its stretch total.
    const draggedRsiStretch = 1.5
    harness.dragPaneSeparator(
      CANDLE_BASELINE + DEFAULT_STRETCH_FACTOR - draggedRsiStretch,
      draggedRsiStretch,
    )

    applyRsiPaneSettings(bundle, { period: 21, overbought: 80, oversold: 20 })
    setRsiPaneHistoryData(bundle, risingCandles(20))
    updateRsiPaneLiveData(bundle, risingCandles(20))
    clearRsiPaneData(bundle)
    moveRsiPaneAbove(bundle, 0)

    assert.deepEqual(harness.stretchFactorCalls(), [`stretchFactor:${DEFAULT_STRETCH_FACTOR}`])
    assert.equal(bundle.pane.getStretchFactor(), 1.5)
  })

  it('restores a user-dragged share when the pane is re-created after a toggle', () => {
    const harness = makeChart()
    const firstBundle = createRsiChartPane(harness.chart, DEFAULTS)
    // Drag the RSI pane taller than the default 25 %.
    const draggedRsiStretch = 1.5
    harness.dragPaneSeparator(
      CANDLE_BASELINE + DEFAULT_STRETCH_FACTOR - draggedRsiStretch,
      draggedRsiStretch,
    )
    const draggedShare = rsiPaneHeightShare(harness.chart, firstBundle.pane)
    assert.ok(draggedShare !== null && draggedShare > RSI_PANE_HEIGHT_SHARE)

    // Indicator toggled off …
    removeRsiChartPane(harness.chart, firstBundle)
    harness.paneStates.pop()
    // … and on again with the remembered share.
    const secondBundle = createRsiChartPane(harness.chart, DEFAULTS, draggedShare)
    assertShare(rsiPaneHeightShare(harness.chart, secondBundle.pane) ?? 0, draggedShare)
    assert.ok(Math.abs(secondBundle.pane.getStretchFactor() - draggedRsiStretch) < 1e-9)
  })

  it('returns null instead of a bogus share when no stretch total is available', () => {
    const harness = makeChart([])
    assert.equal(sumPaneStretchFactors(harness.chart), 0)
    assert.equal(rsiPaneHeightShare(harness.chart, harness.pane), null)
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
