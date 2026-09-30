import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { applyLiveCandle } from './parseMarketCandle.ts'
import { computeRollingVwapForInterval, type RollingVwapPoint } from './rollingVwap.ts'
import {
  ROLLING_VWAP_LINE_CHART_OPTIONS,
  ROLLING_VWAP_LINE_COLOR,
  applyRollingVwapLiveFromCandles,
  rollingVwapPointToLinePoint,
  rollingVwapPointsToLineData,
  clearRollingVwapLineSeriesData,
  setRollingVwapLineSeriesData,
  setRollingVwapLineSeriesVisible,
  shouldShowRollingVwapLineSeries,
} from './rollingVwapChartSeries.ts'
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

function rollingPoint(overrides: Partial<RollingVwapPoint>): RollingVwapPoint {
  return {
    time: 1_700_000_000,
    vwap: 10,
    stdev: 1,
    upper1: 11,
    lower1: 9,
    upper2: 12,
    lower2: 8,
    upper3: 13,
    lower3: 7,
    ...overrides,
  }
}

function trackRollingBundle(): ChartSeriesBundle & {
  rollingCalls: { setData: number; update: number }
} {
  const rollingCalls = { setData: 0, update: 0 }
  const line = { setData: () => {}, update: () => {}, applyOptions: () => {} }
  const rollingVwap = {
    setData: () => {
      rollingCalls.setData += 1
    },
    update: () => {
      rollingCalls.update += 1
    },
    applyOptions: () => {},
  } as ChartSeriesBundle['rollingVwap']

  return {
    candle: { setData: () => {}, update: () => {} } as ChartSeriesBundle['candle'],
    emas: [line, line, line] as ChartSeriesBundle['emas'],
    dailyVwap: { byKey: {}, ordered: [line] } as ChartSeriesBundle['dailyVwap'],
    weeklyVwap: { byKey: {}, ordered: [line] } as ChartSeriesBundle['weeklyVwap'],
    monthlyVwap: { byKey: {}, ordered: [line] } as ChartSeriesBundle['monthlyVwap'],
    quarterlyVwap: { byKey: {}, ordered: [line] } as ChartSeriesBundle['quarterlyVwap'],
    yearlyVwap: { byKey: {}, ordered: [line] } as ChartSeriesBundle['yearlyVwap'],
    rollingVwap,
    rollingCalls,
  }
}

describe('rollingVwapPointsToLineData', () => {
  it('maps null vwap to whitespace points', () => {
    const data = rollingVwapPointsToLineData([rollingPoint({ vwap: null })])
    assert.equal('value' in data[0], false)
    assert.equal(data[0].time, 1_700_000_000)
  })

  it('maps finite vwap to line values', () => {
    const data = rollingVwapPointsToLineData([rollingPoint({ vwap: 42.25 })])
    assert.equal(data[0].value, 42.25)
  })
})

describe('ROLLING_VWAP_LINE_CHART_OPTIONS', () => {
  it('matches Stage 2 orange single-line style', () => {
    assert.equal(ROLLING_VWAP_LINE_COLOR, '#FF9800')
    assert.deepEqual(ROLLING_VWAP_LINE_CHART_OPTIONS, {
      color: '#FF9800',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
      crosshairMarkerVisible: false,
      pointMarkersVisible: false,
    })
  })
})

describe('shouldShowRollingVwapLineSeries', () => {
  it('is visible only when selected on a supported interval', () => {
    assert.equal(shouldShowRollingVwapLineSeries(['rolling-vwap'], '1m'), true)
    assert.equal(shouldShowRollingVwapLineSeries([], '1m'), false)
  })
})

function applyRollingLiveLikeChart(
  candles: MarketCandle[],
  incoming: MarketCandle,
  series: ChartSeriesBundle['rollingVwap'],
): 'ignore' | 'update' | 'append' {
  const result = applyLiveCandle(candles, incoming)
  if (result === 'ignore') return result
  applyRollingVwapLiveFromCandles(candles, series)
  return result
}

describe('history rolling integration', () => {
  it('setData on history load and clears when candles are empty', () => {
    const tracked = trackRollingBundle()
    const candles = [
      candle({ time: 1_700_000_000, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: 1_700_000_060, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    setRollingVwapLineSeriesData(
      tracked.rollingVwap,
      computeRollingVwapForInterval(candles, '1m'),
    )
    assert.equal(tracked.rollingCalls.setData, 1)
    assert.equal(tracked.rollingCalls.update, 0)

    clearRollingVwapLineSeriesData(tracked.rollingVwap)
    assert.equal(tracked.rollingCalls.setData, 2)
  })
})

describe('live rolling integration', () => {
  it('updates the same open bar without setData', () => {
    const tracked = trackRollingBundle()
    const candles = [candle({ time: 1_700_000_000, close: 10, volume: 1 })]
    const openUpdate = candle({ time: 1_700_000_000, close: 12, volume: 3 })
    applyRollingLiveLikeChart(candles, openUpdate, tracked.rollingVwap)
    assert.equal(candles.length, 1)
    assert.equal(candles[0].volume, 3)
    assert.equal(tracked.rollingCalls.update, 1)
    assert.equal(tracked.rollingCalls.setData, 0)
  })

  it('appends a new bar with update only', () => {
    const tracked = trackRollingBundle()
    const candles = [candle({ time: 1_700_000_000, close: 10, volume: 1 })]
    const next = candle({ time: 1_700_000_060, close: 20, volume: 1 })
    applyRollingLiveLikeChart(candles, next, tracked.rollingVwap)
    assert.equal(candles.length, 2)
    assert.equal(tracked.rollingCalls.update, 1)
    assert.equal(tracked.rollingCalls.setData, 0)
  })

  it('ignores stale candles without touching rolling series', () => {
    const tracked = trackRollingBundle()
    const candles = [candle({ time: 1_700_000_120 })]
    const stale = candle({ time: 1_700_000_000 })
    applyRollingLiveLikeChart(candles, stale, tracked.rollingVwap)
    assert.equal(candles.length, 1)
    assert.equal(tracked.rollingCalls.update, 0)
    assert.equal(tracked.rollingCalls.setData, 0)
  })
})

describe('rolling visibility', () => {
  it('toggles from indicator selection without anchored vwap context', () => {
    const visible: boolean[] = []
    const series = {
      applyOptions: (opts: { visible?: boolean }) => {
        if (typeof opts.visible === 'boolean') visible.push(opts.visible)
      },
    } as Parameters<typeof setRollingVwapLineSeriesVisible>[0]

    setRollingVwapLineSeriesVisible(series, shouldShowRollingVwapLineSeries(['rolling-vwap'], '1m'))
    setRollingVwapLineSeriesVisible(series, shouldShowRollingVwapLineSeries([], '1m'))
    assert.deepEqual(visible, [true, false])
  })
})

describe('rollingVwapPointToLinePoint', () => {
  it('feeds applyRollingVwapLiveFromCandles with a single update call', () => {
    let updates = 0
    const series = {
      update: () => {
        updates += 1
      },
    } as Parameters<typeof applyRollingVwapLiveFromCandles>[1]

    applyRollingVwapLiveFromCandles(
      [
        candle({ time: 1_700_000_000, high: 10, low: 10, close: 10, volume: 1 }),
        candle({ time: 1_700_000_060, high: 20, low: 20, close: 20, volume: 1 }),
      ],
      series,
    )
    assert.equal(updates, 1)
    const point = rollingVwapPointToLinePoint(
      rollingPoint({ time: 1_700_000_060, vwap: 15 }),
    )
    assert.equal(point.value, 15)
  })
})

describe('setRollingVwapLineSeriesVisible', () => {
  it('applies visible option on the line series', () => {
    let last: boolean | undefined
    const series = {
      applyOptions: (opts: { visible?: boolean }) => {
        last = opts.visible
      },
    } as Parameters<typeof setRollingVwapLineSeriesVisible>[0]
    setRollingVwapLineSeriesVisible(series, true)
    assert.equal(last, true)
  })
})
