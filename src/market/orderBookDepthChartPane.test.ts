import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type {
  AutoscaleInfoProvider,
  IChartApi,
  LineSeriesPartialOptions,
  PriceLineOptions,
} from 'lightweight-charts'
import {
  applyOrderBookDepthPaneSettings,
  clearOrderBookDepthPaneData,
  createOrderBookDepthChartPane,
  moveOrderBookDepthPaneTo,
  removeOrderBookDepthChartPane,
  setOrderBookDepthPaneHistoryData,
  type OrderBookDepthChartPaneBundle,
} from './orderBookDepthChartPane.ts'
import { resolveChartPaneRolePane } from './chartPaneRoles.ts'
import {
  ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR,
  ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR,
} from './orderBookDepthThresholdColors.ts'
import {
  DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
  type OrderBookDepthSettings,
} from './orderBookDepthSettings.ts'
import { parseOrderBookDepthSample, type OrderBookDepthSample } from './orderBookDepth.ts'

type FakePoint = { time: number; value: number; color?: string }
type FakePriceLine = {
  options: PriceLineOptions
  applyOptionsCalls: Partial<PriceLineOptions>[]
  applyOptions: (options: Partial<PriceLineOptions>) => void
}

const BASE_TIME_MS = Date.UTC(2026, 9, 14, 17, 45)
const MINUTE = 60_000

function sample(
  id: string,
  time: number,
  imbalance: number,
  overrides: Record<string, unknown> = {},
): OrderBookDepthSample {
  const parsed = parseOrderBookDepthSample({
    id,
    source: 'binance',
    exchange: 'binance',
    symbol: 'BTCUSDT',
    distance: 2.5,
    time,
    mid: 80_000,
    bid_notional: 1_000_000,
    ask_notional: 900_000,
    imbalance,
    bid_coverage_pct: 0.153,
    ask_coverage_pct: 0.18,
    complete: true,
    ...overrides,
  })
  assert.ok(parsed)
  return parsed
}

function createHarness() {
  const setDataCalls: FakePoint[][] = []
  const applyOptionsCalls: LineSeriesPartialOptions[] = []
  const createdPriceLines: FakePriceLine[] = []
  const movedTo: number[] = []
  let paneIndex = 2
  let removedSeries: unknown = null

  const pane = {
    setStretchFactor: () => {},
    addSeries: (_type: unknown, options: LineSeriesPartialOptions) => {
      applyOptionsCalls.push(options)
      return series
    },
    paneIndex: () => paneIndex,
    moveTo: (next: number) => {
      movedTo.push(next)
      paneIndex = next
    },
  }
  const series = {
    setData: (data: FakePoint[]) => {
      setDataCalls.push(data)
    },
    update: () => {},
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
    getPane: () => pane,
  }
  const chart = {
    addPane: () => pane,
    panes: () => [pane],
    removeSeries: (seriesToRemove: unknown) => {
      removedSeries = seriesToRemove
    },
  }
  return {
    chart,
    series,
    setDataCalls,
    applyOptionsCalls,
    createdPriceLines,
    movedTo,
    getPaneIndex: () => paneIndex,
    getRemovedSeries: () => removedSeries,
  }
}

function settings(
  overrides: Partial<OrderBookDepthSettings> = {},
): OrderBookDepthSettings {
  return { ...DEFAULT_ORDER_BOOK_DEPTH_SETTINGS, ...overrides }
}

describe('createOrderBookDepthChartPane', () => {
  it('creates a bounded −100…100 line pane and three reference lines', () => {
    const harness = createHarness()
    const bundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )

    const options = harness.applyOptionsCalls[0]
    const autoscale = options.autoscaleInfoProvider as AutoscaleInfoProvider
    assert.deepEqual(autoscale(), {
      priceRange: { minValue: -100, maxValue: 100 },
    })
    assert.equal(options.priceLineVisible, false)
    assert.deepEqual(
      harness.createdPriceLines.map((line) => line.options.price),
      [25, 0, -25],
    )
    assert.equal(
      resolveChartPaneRolePane(
        harness.chart as unknown as IChartApi,
        'order-book-depth',
      ),
      bundle.pane,
    )
  })
})

describe('setOrderBookDepthPaneHistoryData', () => {
  it('renders only complete samples, bucketed to candle opens', () => {
    const harness = createHarness()
    const bundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )

    setOrderBookDepthPaneHistoryData(
      bundle,
      [
        sample('first', BASE_TIME_MS + 5_000, 40),
        sample('last', BASE_TIME_MS + 55_000, -40),
        sample('incomplete', BASE_TIME_MS + 2 * MINUTE, 90, { complete: false }),
      ],
      '1m',
      [BASE_TIME_MS / 1000],
    )

    assert.deepEqual(harness.setDataCalls[0], [
      {
        time: BASE_TIME_MS / 1000,
        value: -40,
        color: ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR,
      },
    ])
  })

  it('recolors already-loaded history when thresholds change', () => {
    const harness = createHarness()
    const bundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )
    const samples = [
      sample('up', BASE_TIME_MS + 5_000, 40),
      sample('down', BASE_TIME_MS + 65_000, -40),
    ]

    const candleTimes = [BASE_TIME_MS / 1000, BASE_TIME_MS / 1000 + 60]
    setOrderBookDepthPaneHistoryData(bundle, samples, '1m', candleTimes)
    assert.equal(
      harness.setDataCalls[0][0].color,
      ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR,
    )
    assert.equal(
      harness.setDataCalls[0][1].color,
      ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR,
    )

    applyOrderBookDepthPaneSettings(bundle, settings({ positiveThreshold: 60 }))
    setOrderBookDepthPaneHistoryData(bundle, samples, '1m', candleTimes)
    assert.equal(harness.setDataCalls[1][0].color, undefined)
    assert.equal(
      harness.setDataCalls[1][1].color,
      ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR,
    )

    applyOrderBookDepthPaneSettings(bundle, settings({ negativeThreshold: -50 }))
    setOrderBookDepthPaneHistoryData(bundle, samples, '1m', candleTimes)
    assert.equal(harness.setDataCalls[2][1].color, undefined)
  })

  it('clips points to the loaded candle window', () => {
    const harness = createHarness()
    const bundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )

    setOrderBookDepthPaneHistoryData(
      bundle,
      [
        sample('loaded', BASE_TIME_MS + 5_000, 40),
        sample('outside', BASE_TIME_MS + MINUTE + 5_000, -40),
      ],
      '1m',
      [BASE_TIME_MS / 1000],
    )

    assert.deepEqual(
      harness.setDataCalls[0].map((point) => point.time),
      [BASE_TIME_MS / 1000],
    )
  })

  it('clears the pane without removing other panes', () => {
    const harness = createHarness()
    const bundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )
    clearOrderBookDepthPaneData(bundle)
    assert.deepEqual(harness.setDataCalls.at(-1), [])
  })
})

describe('applyOrderBookDepthPaneSettings', () => {
  it('moves the reference lines and updates thresholds', () => {
    const harness = createHarness()
    const bundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )

    applyOrderBookDepthPaneSettings(
      bundle,
      settings({ positiveThreshold: 60, negativeThreshold: -50 }),
    )

    assert.deepEqual(
      harness.createdPriceLines.map((line) => line.options.price),
      [60, 0, -50],
    )
    assert.equal(bundle.settings.positiveThreshold, 60)
    assert.equal(bundle.settings.negativeThreshold, -50)
  })
})

describe('moveOrderBookDepthPaneTo', () => {
  it('only moves to a lower pane index', () => {
    const harness = createHarness()
    const bundle: OrderBookDepthChartPaneBundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )

    moveOrderBookDepthPaneTo(bundle, 4)
    assert.deepEqual(harness.movedTo, [])

    moveOrderBookDepthPaneTo(bundle, 1)
    assert.deepEqual(harness.movedTo, [1])
    assert.equal(harness.getPaneIndex(), 1)
  })
})

describe('removeOrderBookDepthChartPane', () => {
  it('removes only its series and unregisters the pane role', () => {
    const harness = createHarness()
    const bundle = createOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      settings(),
    )

    removeOrderBookDepthChartPane(
      harness.chart as unknown as IChartApi,
      bundle,
    )

    assert.equal(harness.getRemovedSeries(), harness.series)
    assert.equal(
      resolveChartPaneRolePane(
        harness.chart as unknown as IChartApi,
        'order-book-depth',
      ),
      null,
    )
  })
})
