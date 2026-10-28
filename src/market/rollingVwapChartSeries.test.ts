import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { applyLiveCandle } from './parseMarketCandle.ts'
import {
  computeRollingVwapPointsForSettings,
  createDefaultRollingVwapSettings,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import { LineStyle, type IChartApi } from 'lightweight-charts'
import {
  ROLLING_VWAP_BAND_FILL_KEYS,
  ROLLING_VWAP_BAND_SERIES_KEYS,
  ROLLING_VWAP_LINE_CHART_OPTIONS,
  applyRollingVwapChartBandFillStyle,
  applyRollingVwapChartBandLineStyles,
  applyRollingVwapChartInstancePresentation,
  applyRollingVwapLiveFromCandles,
  clearRollingVwapChartSeriesData,
  createRollingVwapChartSeriesBundle,
  rollingVwapBandFillPoints,
  rollingVwapPointToLinePoint,
  rollingVwapPointsToLineData,
  setRollingVwapChartSeriesData,
  setRollingVwapInstanceSeriesVisibility,
  type RollingVwapChartSeriesBundle,
} from './rollingVwapChartSeries.ts'
import { createRollingVwapInstance } from './rollingVwapInstances.ts'
import { registerCandleChartSeries } from './candlePane.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
import type { MarketCandle } from './types.ts'
import {
  MARKET_STYLE_PALETTE,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'

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
  it('uses the palette center style and six band keys', () => {
    assert.equal(ROLLING_VWAP_LINE_CHART_OPTIONS.color, MARKET_STYLE_PALETTE.light)
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
          attachPrimitive: () => {},
          detachPrimitive: () => {},
        }
      },
    } as IChartApi
    const defaults = createDefaultRollingVwapSettings()
    const bundle = createRollingVwapChartSeriesBundle(chart, defaults)
    assert.equal(bundle.ordered.length, 7)
    assert.equal(createdOptions[0].color, MARKET_STYLE_PALETTE.light)
    assert.equal(createdOptions[0].lineWidth, 1)
    assert.equal(createdOptions[0].lineStyle, LineStyle.Solid)
    assert.equal(createdOptions[0].priceLineVisible, false)
    assert.equal(createdOptions[0].lastValueVisible, true)
    // Band colors are the palette's distinct grayscale shades at 70% opacity.
    assert.equal(
      createdOptions[1].color,
      marketStyleColorWithOpacity(MARKET_STYLE_PALETTE.subtle, 70),
    )
    assert.equal(
      createdOptions[3].color,
      marketStyleColorWithOpacity(MARKET_STYLE_PALETTE.medium, 70),
    )
    assert.equal(
      createdOptions[5].color,
      marketStyleColorWithOpacity(MARKET_STYLE_PALETTE.dark, 70),
    )
    for (const options of createdOptions.slice(1)) {
      assert.equal(options.lineWidth, 1)
      assert.equal(options.lastValueVisible, false)
      assert.equal(options.crosshairMarkerVisible, false)
      assert.equal(options.pointMarkersVisible, false)
    }
  })

  it('creates every overlay series in the candle pane when it is not pane 0', () => {
    const panes: Array<{ paneIndex: () => number }> = []
    const candlePane = { paneIndex: () => panes.indexOf(candlePane) }
    const liquidationPane = { paneIndex: () => panes.indexOf(liquidationPane) }
    // Top position: the liquidation pane owns index 0, candles move to index 1.
    panes.push(liquidationPane, candlePane)

    const paneIndexes: Array<number | undefined> = []
    const chart = {
      panes: () => panes,
      addSeries: (_type: unknown, _options: Record<string, unknown>, paneIndex?: number) => {
        paneIndexes.push(paneIndex)
        return {
          setData: () => {},
          update: () => {},
          applyOptions: () => {},
          attachPrimitive: () => {},
          detachPrimitive: () => {},
        }
      },
    } as unknown as IChartApi
    registerCandleChartSeries(chart, { getPane: () => candlePane } as never)

    createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())

    assert.equal(paneIndexes.length, 7)
    for (const paneIndex of paneIndexes) {
      assert.equal(paneIndex, 1)
    }
  })

  it('applies center-line color, opacity, and style at creation', () => {
    const createdOptions: Record<string, unknown>[] = []
    const chart = {
      addSeries: (_type: unknown, options: Record<string, unknown>) => {
        createdOptions.push(options)
        return {
          setData: () => {},
          update: () => {},
          applyOptions: () => {},
          attachPrimitive: () => {},
          detachPrimitive: () => {},
        }
      },
    } as IChartApi
    const settings = createDefaultRollingVwapSettings()
    settings.lineColor = '#ff0000'
    settings.lineOpacity = 50
    settings.lineStyle = 'dotted'
    createRollingVwapChartSeriesBundle(chart, settings, {
      lineWidth: settings.lineWidth,
      lineColor: settings.lineColor,
      lineOpacity: settings.lineOpacity,
      lineStyle: settings.lineStyle,
    })
    assert.equal(createdOptions[0].color, 'rgba(255, 0, 0, 0.5)')
    assert.equal(createdOptions[0].lineStyle, LineStyle.Dotted)
  })

  it('creates every band series solid by default', () => {
    const createdOptions: Record<string, unknown>[] = []
    const chart = {
      addSeries: (_type: unknown, options: Record<string, unknown>) => {
        createdOptions.push(options)
        return {
          setData: () => {},
          update: () => {},
          applyOptions: () => {},
          attachPrimitive: () => {},
          detachPrimitive: () => {},
        }
      },
    } as IChartApi
    createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    for (const options of createdOptions.slice(1)) {
      assert.equal(options.lineStyle, LineStyle.Solid)
    }
  })

  it("applies each band's own line style at creation", () => {
    const createdOptions: Record<string, unknown>[] = []
    const chart = {
      addSeries: (_type: unknown, options: Record<string, unknown>) => {
        createdOptions.push(options)
        return {
          setData: () => {},
          update: () => {},
          applyOptions: () => {},
          attachPrimitive: () => {},
          detachPrimitive: () => {},
        }
      },
    } as IChartApi
    const settings = createDefaultRollingVwapSettings()
    settings.lineStyle = 'solid'
    settings.bandLineStyles = { band1: 'dotted', band2: 'solid', band3: 'dotted' }
    createRollingVwapChartSeriesBundle(chart, settings, {
      lineWidth: settings.lineWidth,
      lineStyle: settings.lineStyle,
    })
    // Order: center, upper1, lower1, upper2, lower2, upper3, lower3
    assert.equal(createdOptions[0].lineStyle, LineStyle.Solid)
    assert.equal(createdOptions[1].lineStyle, LineStyle.Dotted)
    assert.equal(createdOptions[2].lineStyle, LineStyle.Dotted)
    assert.equal(createdOptions[3].lineStyle, LineStyle.Solid)
    assert.equal(createdOptions[4].lineStyle, LineStyle.Solid)
    assert.equal(createdOptions[5].lineStyle, LineStyle.Dotted)
    assert.equal(createdOptions[6].lineStyle, LineStyle.Dotted)
  })

  it('applies the center width and each band pair its own width at creation', () => {
    const createdOptions: Record<string, unknown>[] = []
    const chart = {
      addSeries: (_type: unknown, options: Record<string, unknown>) => {
        createdOptions.push(options)
        return {
          setData: () => {},
          update: () => {},
          applyOptions: () => {},
          attachPrimitive: () => {},
          detachPrimitive: () => {},
        }
      },
    } as IChartApi
    const settings = createDefaultRollingVwapSettings()
    settings.lineWidth = 3
    settings.bandLineWidths = { band1: 1, band2: 2, band3: 3 }
    createRollingVwapChartSeriesBundle(chart, settings, { lineWidth: settings.lineWidth })
    assert.equal(createdOptions.length, 7)
    assert.equal(createdOptions[0].lineWidth, 3)
    // Order: upper1, lower1, upper2, lower2, upper3, lower3.
    assert.deepEqual(
      createdOptions.slice(1).map((options) => options.lineWidth),
      [1, 1, 2, 2, 3, 3],
    )
  })
})

describe('applyRollingVwapChartInstancePresentation', () => {
  it('updates center-line color and style when settings are saved', () => {
    const centerOptions: Record<string, unknown>[] = []
    const makeLine = () => ({
      setData: () => {},
      update: () => {},
      applyOptions: (opts: Record<string, unknown>) => {
        centerOptions.push(opts)
      },
    })
    const center = makeLine()
    const bands = {} as RollingVwapChartSeriesBundle['bands']
    const ordered = [center]
    for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
      const series = makeLine()
      bands[key] = series
      ordered.push(series)
    }
    const bundle: RollingVwapChartSeriesBundle = { center, bands, ordered }

    const settings = createDefaultRollingVwapSettings()
    settings.lineColor = '#00ff00'
    settings.lineOpacity = 25
    settings.lineStyle = 'dotted'
    const instance = createRollingVwapInstance({
      id: 'rvwap-style',
      settings,
      randomId: () => 'rvwap-style',
    })
    applyRollingVwapChartInstancePresentation(bundle, instance, '1m')
    const styleApply = centerOptions.find(
      (opts) => opts.color === 'rgba(0, 255, 0, 0.25)' && opts.lineStyle === LineStyle.Dotted,
    )
    assert.ok(styleApply)
  })
})

describe('applyRollingVwapChartInstancePresentation band line styles', () => {
  function trackLineStyles() {
    const optionsBySeries = new Map<object, Record<string, unknown>>()
    const makeLine = () => {
      const series = {
        setData: () => {},
        update: () => {},
        applyOptions: (opts: Record<string, unknown>) => {
          optionsBySeries.set(series, { ...(optionsBySeries.get(series) ?? {}), ...opts })
        },
      }
      return series
    }
    const center = makeLine()
    const bands = {} as RollingVwapChartSeriesBundle['bands']
    const ordered = [center]
    for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
      const series = makeLine()
      bands[key] = series
      ordered.push(series)
    }
    const bundle: RollingVwapChartSeriesBundle = { center, bands, ordered }
    return { bundle, center, bands, optionsBySeries }
  }

  it("applies each band's own style and leaves the other bands alone", () => {
    const { bundle, center, bands, optionsBySeries } = trackLineStyles()
    const settings = createDefaultRollingVwapSettings()
    settings.lineStyle = 'solid'
    settings.bandLineStyles = { band1: 'dotted', band2: 'solid', band3: 'dotted' }
    applyRollingVwapChartInstancePresentation(
      bundle,
      createRollingVwapInstance({ id: 'rvwap-bands', settings, randomId: () => 'rvwap-bands' }),
      '1m',
    )

    assert.equal(optionsBySeries.get(center)?.lineStyle, LineStyle.Solid)
    for (const key of ['upper1', 'lower1', 'upper3', 'lower3'] as const) {
      assert.equal(optionsBySeries.get(bands[key])?.lineStyle, LineStyle.Dotted, key)
    }
    for (const key of ['upper2', 'lower2'] as const) {
      assert.equal(optionsBySeries.get(bands[key])?.lineStyle, LineStyle.Solid, key)
    }
  })

  it('applies a dotted style to every band independently of the center line', () => {
    const { bundle, center, bands, optionsBySeries } = trackLineStyles()
    const settings = createDefaultRollingVwapSettings()
    settings.lineStyle = 'solid'
    settings.bandLineStyles = { band1: 'dotted', band2: 'dotted', band3: 'dotted' }
    applyRollingVwapChartInstancePresentation(
      bundle,
      createRollingVwapInstance({ id: 'rvwap-all', settings, randomId: () => 'rvwap-all' }),
      '1m',
    )

    assert.equal(optionsBySeries.get(center)?.lineStyle, LineStyle.Solid)
    for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
      assert.equal(optionsBySeries.get(bands[key])?.lineStyle, LineStyle.Dotted, key)
    }
  })

  it('keeps every band solid by default', () => {
    const { bundle, bands, optionsBySeries } = trackLineStyles()
    applyRollingVwapChartInstancePresentation(
      bundle,
      createRollingVwapInstance({
        id: 'rvwap-default',
        settings: createDefaultRollingVwapSettings(),
        randomId: () => 'rvwap-default',
      }),
      '1m',
    )

    for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
      assert.equal(optionsBySeries.get(bands[key])?.lineStyle, LineStyle.Solid, key)
    }
  })

  it('only patches band line styles, not colors or widths', () => {
    const { bundle, bands, optionsBySeries } = trackLineStyles()
    const settings = createDefaultRollingVwapSettings()
    settings.bandLineStyles = { band1: 'dotted', band2: 'dotted', band3: 'dotted' }
    applyRollingVwapChartBandLineStyles(bundle, settings)

    for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
      assert.deepEqual(optionsBySeries.get(bands[key]), { lineStyle: LineStyle.Dotted }, key)
    }
  })
})

describe('applyRollingVwapChartInstancePresentation line width', () => {
  it('updates the center width and each band pair width when settings are saved', () => {
    const lineWidths: number[] = []
    const makeLine = () => ({
      setData: () => {},
      update: () => {},
      applyOptions: (opts: { lineWidth?: number }) => {
        if (typeof opts.lineWidth === 'number') lineWidths.push(opts.lineWidth)
      },
    })
    const center = makeLine()
    const bands = {} as RollingVwapChartSeriesBundle['bands']
    const ordered = [center]
    for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
      const series = makeLine()
      bands[key] = series
      ordered.push(series)
    }
    const bundle: RollingVwapChartSeriesBundle = { center, bands, ordered }

    const settings = createDefaultRollingVwapSettings()
    settings.lineWidth = 4
    settings.bandLineWidths = { band1: 1, band2: 2, band3: 3 }
    const instance = createRollingVwapInstance({
      id: 'rvwap-a',
      settings,
      randomId: () => 'rvwap-a',
    })
    applyRollingVwapChartInstancePresentation(bundle, instance, '1m')
    // Six band widths first, then the independent center width.
    assert.deepEqual(lineWidths, [1, 1, 2, 2, 3, 3, 4])
  })

  it('keeps line widths independent between instances', () => {
    const widthsBySeries = new Map<object, number>()
    const makeLine = () => {
      const series = {
        setData: () => {},
        update: () => {},
        applyOptions: (opts: { lineWidth?: number }) => {
          if (typeof opts.lineWidth === 'number') widthsBySeries.set(series, opts.lineWidth)
        },
      }
      return series
    }

    const bundleA = (() => {
      const center = makeLine()
      const bands = {} as RollingVwapChartSeriesBundle['bands']
      const ordered = [center]
      for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
        const series = makeLine()
        bands[key] = series
        ordered.push(series)
      }
      return { center, bands, ordered }
    })()

    const bundleB = (() => {
      const center = makeLine()
      const bands = {} as RollingVwapChartSeriesBundle['bands']
      const ordered = [center]
      for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
        const series = makeLine()
        bands[key] = series
        ordered.push(series)
      }
      return { center, bands, ordered }
    })()

    const settingsA = createDefaultRollingVwapSettings()
    settingsA.lineWidth = 2
    settingsA.bandLineWidths = { band1: 1, band2: 2, band3: 3 }
    const settingsB = createDefaultRollingVwapSettings()
    settingsB.lineWidth = 3
    settingsB.bandLineWidths = { band1: 4, band2: 4, band3: 4 }

    applyRollingVwapChartInstancePresentation(
      bundleA,
      createRollingVwapInstance({ id: 'a', settings: settingsA, randomId: () => 'a' }),
      '1m',
    )
    applyRollingVwapChartInstancePresentation(
      bundleB,
      createRollingVwapInstance({ id: 'b', settings: settingsB, randomId: () => 'b' }),
      '1m',
    )

    const widthsA = [...bundleA.ordered].map((series) => widthsBySeries.get(series))
    const widthsB = [...bundleB.ordered].map((series) => widthsBySeries.get(series))
    assert.deepEqual(widthsA, [2, 1, 1, 2, 2, 3, 3])
    assert.deepEqual(widthsB, [3, 4, 4, 4, 4, 4, 4])
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


function makeFillRecorder() {
  const calls = {
    points: [] as unknown[],
    visible: [] as boolean[],
    fillStyles: [] as string[],
  }
  const attachment = {
    updateBandData: (points: unknown) => calls.points.push(points),
    setBandVisible: (visible: boolean) => calls.visible.push(visible),
    setFillStyle: (fillStyle: string) => calls.fillStyles.push(fillStyle),
    update: () => {},
    dispose: () => {},
  }
  return { attachment, calls }
}

describe('rolling VWAP band fills', () => {
  it('projects each band pair onto the shared fill geometry', () => {
    const points: RollingVwapPoint[] = [
      rollingPoint({ time: 1, upper1: 11, lower1: 9, upper2: 12, lower2: 8, upper3: 13, lower3: 7 }),
      rollingPoint({ time: 2, upper1: 21, lower1: 19, upper2: 22, lower2: 18, upper3: 23, lower3: 17 }),
    ]
    assert.deepEqual(rollingVwapBandFillPoints(points, 'band1'), [
      { time: 1, upper1: 11, lower1: 9 },
      { time: 2, upper1: 21, lower1: 19 },
    ])
    assert.deepEqual(rollingVwapBandFillPoints(points, 'band2'), [
      { time: 1, upper1: 12, lower1: 8 },
      { time: 2, upper1: 22, lower1: 18 },
    ])
    assert.deepEqual(rollingVwapBandFillPoints(points, 'band3'), [
      { time: 1, upper1: 13, lower1: 7 },
      { time: 2, upper1: 23, lower1: 17 },
    ])
  })

  it('attaches one fill primitive per band pair at creation', () => {
    const attached: unknown[] = []
    const makeLine = () => ({
      setData: () => {},
      update: () => {},
      applyOptions: () => {},
      attachPrimitive: (primitive: unknown) => attached.push(primitive),
      detachPrimitive: () => {},
    })
    const chart = { addSeries: () => makeLine() } as unknown as IChartApi
    const settings = createDefaultRollingVwapSettings()
    settings.fillColor = '#123456'
    settings.fillOpacity = 40
    const bundle = createRollingVwapChartSeriesBundle(chart, settings)
    assert.equal(attached.length, ROLLING_VWAP_BAND_FILL_KEYS.length)
    assert.ok(bundle.bandFills)
    for (const bandKey of ROLLING_VWAP_BAND_FILL_KEYS) {
      assert.equal(typeof bundle.bandFills[bandKey].updateBandData, 'function')
    }
  })

  it('applies one Background color + opacity to all band fills', () => {
    const { bundle } = trackBundle()
    const fills = {
      band1: makeFillRecorder(),
      band2: makeFillRecorder(),
      band3: makeFillRecorder(),
    }
    bundle.bandFills = {
      band1: fills.band1.attachment,
      band2: fills.band2.attachment,
      band3: fills.band3.attachment,
    } as unknown as RollingVwapChartSeriesBundle['bandFills']

    applyRollingVwapChartBandFillStyle(bundle, { fillColor: '#123456', fillOpacity: 40 })
    for (const key of ROLLING_VWAP_BAND_FILL_KEYS) {
      assert.deepEqual(fills[key].calls.fillStyles, ['rgba(18, 52, 86, 0.4)'])
    }

    applyRollingVwapChartBandFillStyle(bundle, { fillColor: '#123456', fillOpacity: 0 })
    for (const key of ROLLING_VWAP_BAND_FILL_KEYS) {
      assert.equal(fills[key].calls.fillStyles.at(-1), 'rgba(18, 52, 86, 0)')
    }
  })

  it('shows each fill only while its band pair is visible', () => {
    const { bundle } = trackBundle()
    const fills = {
      band1: makeFillRecorder(),
      band2: makeFillRecorder(),
      band3: makeFillRecorder(),
    }
    bundle.bandFills = {
      band1: fills.band1.attachment,
      band2: fills.band2.attachment,
      band3: fills.band3.attachment,
    } as unknown as RollingVwapChartSeriesBundle['bandFills']

    const settings = createDefaultRollingVwapSettings()
    settings.multipliers = { multiplier1: 1, multiplier2: 0, multiplier3: 2 }
    const instance = createRollingVwapInstance({ id: 'fills', settings, randomId: () => 'fills' })
    setRollingVwapInstanceSeriesVisibility(bundle, instance, '1m')
    assert.deepEqual(fills.band1.calls.visible, [true])
    assert.deepEqual(fills.band2.calls.visible, [false])
    assert.deepEqual(fills.band3.calls.visible, [true])

    setRollingVwapInstanceSeriesVisibility(bundle, { ...instance, enabled: false }, '1m')
    assert.deepEqual(fills.band1.calls.visible, [true, false])
    assert.deepEqual(fills.band3.calls.visible, [true, false])
  })

  it('keeps fill geometry in sync with history, live ticks and clearing', () => {
    const { bundle } = trackBundle()
    const fills = {
      band1: makeFillRecorder(),
      band2: makeFillRecorder(),
      band3: makeFillRecorder(),
    }
    bundle.bandFills = {
      band1: fills.band1.attachment,
      band2: fills.band2.attachment,
      band3: fills.band3.attachment,
    } as unknown as RollingVwapChartSeriesBundle['bandFills']
    const settings = createDefaultRollingVwapSettings()
    settings.minBars = 1
    const point = rollingPoint({ time: 1 })

    setRollingVwapChartSeriesData(bundle, [point])
    for (const key of ROLLING_VWAP_BAND_FILL_KEYS) {
      assert.deepEqual(fills[key].calls.points.at(-1), rollingVwapBandFillPoints([point], key))
    }

    applyRollingVwapLiveFromCandles(
      [candle({ time: 1, close: 10, volume: 1 })],
      bundle,
      '1m',
      settings,
    )
    for (const key of ROLLING_VWAP_BAND_FILL_KEYS) {
      assert.equal(fills[key].calls.points.length, 2)
    }

    clearRollingVwapChartSeriesData(bundle)
    for (const key of ROLLING_VWAP_BAND_FILL_KEYS) {
      assert.deepEqual(fills[key].calls.points.at(-1), [])
    }
  })
})
