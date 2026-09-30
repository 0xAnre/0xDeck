import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyLiveCandle } from './parseMarketCandle.ts'
import {
  computeRollingVwapPointsForSettings,
  createDefaultRollingVwapSettings,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import type { IChartApi } from 'lightweight-charts'
import {
  ROLLING_VWAP_BAND_SERIES_KEYS,
  ROLLING_VWAP_LINE_CHART_OPTIONS,
  applyRollingVwapLiveFromCandles,
  createRollingVwapChartSeriesBundle,
  rollingVwapPointToLinePoint,
  rollingVwapPointsToLineData,
  setRollingVwapChartSeriesData,
  setRollingVwapInstanceSeriesVisibility,
  type RollingVwapChartSeriesBundle,
} from './rollingVwapChartSeries.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
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

function trackBundle() {
  const counters = { setDataCount: 0, updateCount: 0 }
  const visibility: boolean[] = []

  const makeLine = () =>
    ({
      setData: () => {
        counters.setDataCount += 1
      },
      update: () => {
        counters.updateCount += 1
      },
      applyOptions: (opts: { visible?: boolean; color?: string }) => {
        if (typeof opts.visible === 'boolean') visibility.push(opts.visible)
      },
    }) as RollingVwapChartSeriesBundle['center']

  const center = makeLine()
  const bands = {} as RollingVwapChartSeriesBundle['bands']
  const ordered = [center]
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const series = makeLine()
    bands[key] = series
    ordered.push(series)
  }

  const bundle: RollingVwapChartSeriesBundle = { center, bands, ordered }
  return { bundle, counters, visibility }
}

describe('rollingVwap chart series defaults', () => {
  it('uses gray center style and six band keys', () => {
    assert.equal(ROLLING_VWAP_LINE_CHART_OPTIONS.color, '#9e9e9e')
    assert.equal(ROLLING_VWAP_BAND_SERIES_KEYS.length, 6)
  })

  it('creates center plus six band series with default thin-line options', () => {
    const createdOptions: Record<string, unknown>[] = []
    const chart = {
      addSeries: (_type: unknown, options: Record<string, unknown>) => {
        createdOptions.push(options)
        return {
          setData: () => {},
          update: () => {},
          applyOptions: () => {},
        }
      },
    } as IChartApi
    const defaults = createDefaultRollingVwapSettings()
    const bundle = createRollingVwapChartSeriesBundle(chart, defaults.bandColors)
    assert.equal(bundle.ordered.length, 7)
    assert.equal(createdOptions[0].color, '#9e9e9e')
    assert.equal(createdOptions[0].lineWidth, 1)
    assert.equal(createdOptions[0].priceLineVisible, false)
    assert.equal(createdOptions[0].lastValueVisible, true)
    assert.equal(createdOptions[1].color, '#4caf50')
    assert.equal(createdOptions[3].color, '#ffeb3b')
    assert.equal(createdOptions[5].color, '#ff5252')
    for (const options of createdOptions.slice(1)) {
      assert.equal(options.lineWidth, 1)
      assert.equal(options.lastValueVisible, false)
      assert.equal(options.crosshairMarkerVisible, false)
      assert.equal(options.pointMarkersVisible, false)
    }
  })
})

describe('rollingVwapPointsToLineData', () => {
  it('maps null vwap to whitespace points', () => {
    const data = rollingVwapPointsToLineData([rollingPoint({ vwap: null })], 'vwap')
    assert.equal('value' in data[0], false)
  })
})

describe('setRollingVwapInstanceSeriesVisibility', () => {
  const settings = createDefaultRollingVwapSettings()

  it('hides all series when instance is disabled', () => {
    const { bundle, visibility } = trackBundle()
    setRollingVwapInstanceSeriesVisibility(
      bundle,
      { id: 'a', enabled: false, settings },
      '1m',
    )
    assert.ok(visibility.every((visible) => visible === false))
  })

  it('shows center and band pair only when multiplier is positive', () => {
    const { bundle, visibility } = trackBundle()
    const withBand1: RollingVwapSettings = {
      ...settings,
      multipliers: { multiplier1: 1, multiplier2: 0, multiplier3: 0 },
    }
    setRollingVwapInstanceSeriesVisibility(
      bundle,
      { id: 'a', enabled: true, settings: withBand1 },
      '1m',
    )
    assert.equal(visibility[0], true)
    assert.equal(visibility[1], true)
    assert.equal(visibility[2], true)
    assert.equal(visibility[3], false)
  })

  it('sets center last value label title and keeps price line hidden', () => {
    const { bundle } = trackBundle()
    let centerOptions: Record<string, unknown> = {}
    bundle.center.applyOptions = (opts: Record<string, unknown>) => {
      centerOptions = opts
    }
    const settings = createDefaultRollingVwapSettings()
    settings.fixedTimePeriod = { useFixedTimePeriod: true, days: 1, hours: 0, minutes: 0 }
    setRollingVwapInstanceSeriesVisibility(
      bundle,
      { id: 'a', enabled: true, settings },
      '1m',
    )
    assert.equal(centerOptions.lastValueVisible, true)
    assert.equal(centerOptions.priceLineVisible, false)
    assert.equal(centerOptions.title, '1D')
  })
})

describe('history and live integration', () => {
  it('uses setData on all seven series for history', () => {
    const { bundle, counters } = trackBundle()
    const candles = [
      candle({ time: 1_700_000_000, high: 10, low: 10, close: 10, volume: 1 }),
      candle({ time: 1_700_000_060, high: 20, low: 20, close: 20, volume: 1 }),
    ]
    const settings = createDefaultRollingVwapSettings()
    setRollingVwapChartSeriesData(
      bundle,
      computeRollingVwapPointsForSettings(candles, '1m', settings),
    )
    assert.equal(counters.setDataCount, 7)
    assert.equal(counters.updateCount, 0)
  })

  it('uses update on all seven series for live ticks', () => {
    const { bundle, counters } = trackBundle()
    const candles = [candle({ time: 1_700_000_000, close: 10, volume: 1 })]
    const settings = createDefaultRollingVwapSettings()
    applyRollingVwapLiveFromCandles(candles, bundle, '1m', settings)
    assert.equal(counters.updateCount, 7)
    assert.equal(counters.setDataCount, 0)
  })
})

describe('settings reach computation', () => {
  it('applies minBars and multipliers from panel settings', () => {
    const candles = Array.from({ length: 5 }, (_, index) =>
      candle({
        time: 1_700_000_000 + index * 60,
        high: 10 + index,
        low: 10 + index,
        close: 10 + index,
        volume: 1,
      }),
    )
    const settings = createDefaultRollingVwapSettings()
    settings.minBars = 2
    settings.multipliers = { multiplier1: 2, multiplier2: 0, multiplier3: 0 }
    const last = computeRollingVwapPointsForSettings(candles, '1m', settings).at(-1)!
    assert.notEqual(last.upper1, null)
    assert.notEqual(last.vwap, null)
    assertClose(last.upper1!, last.vwap! + (last.stdev ?? 0) * 2)
  })
})

function assertClose(actual: number | null, expected: number, tolerance = 1e-9) {
  assert.notEqual(actual, null)
  assert.ok(Math.abs(actual! - expected) <= tolerance)
}

describe('live candle path', () => {
  const settings = createDefaultRollingVwapSettings()

  it('updates same timestamp without setData', () => {
    const { bundle, counters } = trackBundle()
    const candles = [candle({ time: 1_700_000_000, volume: 1 })]
    applyLiveCandle(candles, candle({ time: 1_700_000_000, volume: 3 }))
    applyRollingVwapLiveFromCandles(candles, bundle, '1m', settings)
    assert.equal(candles[0].volume, 3)
    assert.equal(counters.setDataCount, 0)
    assert.equal(counters.updateCount, 7)
  })

  it('ignores stale candles', () => {
    const { counters } = trackBundle()
    const candles = [candle({ time: 1_700_000_120 })]
    applyLiveCandle(candles, candle({ time: 1_700_000_000 }))
    assert.equal(candles.length, 1)
    assert.equal(counters.updateCount, 0)
  })
})

describe('rollingVwapPointToLinePoint', () => {
  it('maps band values for update payloads', () => {
    const point = rollingPoint({ upper2: 42 })
    const line = rollingVwapPointToLinePoint(point, 'upper2')
    assert.equal(line.value, 42)
  })
})
