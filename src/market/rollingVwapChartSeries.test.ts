import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LineStyle,
  type IChartApi,
  type IPrimitivePaneView,
  type ISeriesPrimitive,
} from 'lightweight-charts'
import {
  ROLLING_VWAP_BAND_SERIES_KEYS,
  ROLLING_VWAP_LINE_CHART_OPTIONS,
  applyRollingVwapChartBandColors,
  applyRollingVwapChartBandFillStyle,
  applyRollingVwapChartBandLineStyles,
  applyRollingVwapChartBandLineWidths,
  applyRollingVwapChartInstancePresentation,
  applyRollingVwapLiveFromCandles,
  clearRollingVwapChartSeriesData,
  createRollingVwapChartSeriesBundle,
  removeRollingVwapChartSeriesBundle,
  rollingVwapPointToLinePoint,
  rollingVwapPointsToLineData,
  setRollingVwapChartSeriesData,
  setRollingVwapInstanceSeriesVisibility,
  updateRollingVwapChartSeriesLast,
  type RollingVwapChartSeriesBundle,
} from './rollingVwapChartSeries.ts'
import {
  createRollingVwapInstance,
  rollingVwapInstancePeriodLabel,
} from './rollingVwapInstances.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
import {
  createDefaultRollingVwapSettings,
  DEFAULT_ROLLING_VWAP_FILL_OPACITY,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import {
  MARKET_STYLE_PALETTE,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'
import { RollingVwapBandSeriesPrimitive } from './rollingVwapBandSeriesPrimitive.ts'
import type { RollingVwapBandPrimitiveStyle } from './rollingVwapBandRenderGeometry.ts'

type PrimitiveAttachment = {
  primitive: ISeriesPrimitive
  requestUpdate: () => void
  detached: boolean
}

type FakeSeries = {
  id: number
  options: Record<string, unknown>
  data: unknown[]
  updates: unknown[]
  setData: (data: unknown[]) => void
  update: (point: unknown) => void
  applyOptions: (options: Record<string, unknown>) => void
  attachPrimitive: (primitive: ISeriesPrimitive) => void
  detachPrimitive: (primitive: ISeriesPrimitive) => void
  priceToCoordinate: (price: number) => number
  priceScale: () => { options: () => { mode: number } }
  barsInLogicalRange: () => null
  attachments: PrimitiveAttachment[]
}

function createFakeChart(): {
  chart: IChartApi
  created: FakeSeries[]
  removed: FakeSeries[]
  requests: () => number
} {
  const created: FakeSeries[] = []
  const removed: FakeSeries[] = []
  let requests = 0
  let nextId = 0
  const chart = {
    addSeries: (_definition: unknown, options: Record<string, unknown> = {}) => {
      const series: FakeSeries = {
        id: nextId,
        options: { ...options },
        data: [],
        updates: [],
        attachments: [],
        setData: (data) => {
          series.data = [...data]
        },
        update: (point) => {
          series.updates.push(point)
        },
        applyOptions: (options) => {
          Object.assign(series.options, options)
        },
        attachPrimitive: (primitive) => {
          series.attachments.push({
            primitive,
            requestUpdate: () => {
              requests += 1
            },
            detached: false,
          })
          const attachment = series.attachments[series.attachments.length - 1]
          ;(
            primitive as unknown as {
              attached: (param: unknown) => void
            }
          ).attached({
            chart,
            series,
            requestUpdate: () => {
              requests += 1
            },
          })
          // Keep the mutable request counter on the attachment entry.
          attachment.requestUpdate = () => {
            requests += 1
          }
        },
        detachPrimitive: (primitive) => {
          const match = series.attachments.find((item) => item.primitive === primitive)
          if (match) match.detached = true
        },
        priceToCoordinate: (price) => 1000 - price,
        priceScale: () => ({ options: () => ({ mode: 0 }) }),
        barsInLogicalRange: () => null,
      }
      nextId += 1
      created.push(series)
      return series
    },
    removeSeries: (series: FakeSeries) => {
      removed.push(series)
    },
    timeScale: () => ({
      getVisibleRange: () => null,
      timeToCoordinate: () => null,
      options: () => ({ barSpacing: 6 }),
    }),
  } as unknown as IChartApi
  return { chart, created, removed, requests: () => requests }
}

function rollingPoint(overrides: Partial<RollingVwapPoint> = {}): RollingVwapPoint {
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

function primitiveOf(bundle: RollingVwapChartSeriesBundle): RollingVwapBandSeriesPrimitive {
  const center = bundle.center as unknown as FakeSeries
  const attachment = center.attachments[0]
  assert.ok(attachment, 'center series owns exactly one primitive')
  return attachment.primitive as RollingVwapBandSeriesPrimitive
}

function paneViewsOf(bundle: RollingVwapChartSeriesBundle): readonly IPrimitivePaneView[] {
  return primitiveOf(bundle).paneViews()
}

function styleOf(bundle: RollingVwapChartSeriesBundle): RollingVwapBandPrimitiveStyle {
  return bundle.bands.getStyle()
}

describe('rollingVwap chart series defaults', () => {
  it('uses the palette center style and six band outline keys', () => {
    assert.equal(ROLLING_VWAP_LINE_CHART_OPTIONS.color, MARKET_STYLE_PALETTE.light)
    assert.equal(ROLLING_VWAP_BAND_SERIES_KEYS.length, 6)
  })

  it('creates one native centre series and one band primitive, never per-band series', () => {
    const { chart, created, requests } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(
      chart,
      createDefaultRollingVwapSettings(),
      { title: 'RV', lineWidth: 2 },
    )
    assert.equal(created.length, 1)
    assert.equal(created[0].options.color, MARKET_STYLE_PALETTE.light)
    assert.equal(created[0].options.lineWidth, 2)
    assert.equal(created[0].options.visible, false)
    assert.equal(created[0].attachments.length, 1)

    const views = paneViewsOf(bundle)
    assert.equal(views.length, 3)
    assert.deepEqual(
      views.map((view) => view.zOrder?.()),
      ['bottom', 'normal', 'top'],
    )
    // Attachment initialization is the only initial invalidation.
    assert.equal(requests(), 1)
  })

  it('starts with no visible band pair and no halo', () => {
    const { chart } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    const primitive = primitiveOf(bundle)
    primitive.updateAllViews()
    assert.deepEqual(primitive.stats(), {
      rebuilds: 1,
      invalidations: 1,
      visitedPoints: 0,
      outlineRuns: 0,
      fillContours: 0,
      haloStrokes: 0,
    })
  })
})

describe('rollingVwap style application', () => {
  it('resolves per-band color + opacity and independent width/style', () => {
    const { chart } = createFakeChart()
    const settings = createDefaultRollingVwapSettings()
    settings.bandColors = { band1: '#111111', band2: '#222222', band3: '#333333' }
    settings.bandOpacities = { band1: 100, band2: 50, band3: 25 }
    settings.bandLineWidths = { band1: 1, band2: 2, band3: 4 }
    settings.bandLineStyles = { band1: 'solid', band2: 'dotted', band3: 'dotted' }
    const bundle = createRollingVwapChartSeriesBundle(chart, settings)

    const style = styleOf(bundle)
    assert.equal(style.outlines.upper1.color, marketStyleColorWithOpacity('#111111', 100))
    assert.equal(style.outlines.lower1.color, style.outlines.upper1.color)
    assert.equal(style.outlines.upper2.color, marketStyleColorWithOpacity('#222222', 50))
    assert.equal(style.outlines.upper3.color, marketStyleColorWithOpacity('#333333', 25))
    assert.equal(style.outlines.upper1.widthPx, 1)
    assert.equal(style.outlines.lower2.widthPx, 2)
    assert.equal(style.outlines.upper3.widthPx, 4)
    assert.equal(style.outlines.upper1.lineStyle, 'solid')
    assert.equal(style.outlines.upper2.lineStyle, 'dotted')
    assert.equal(style.fillStyle, marketStyleColorWithOpacity(
      settings.fillColor,
      DEFAULT_ROLLING_VWAP_FILL_OPACITY,
    ))
  })

  it('applies colors, widths, styles and fill independently with one request each', () => {
    const { chart, requests } = createFakeChart()
    const settings = createDefaultRollingVwapSettings()
    const bundle = createRollingVwapChartSeriesBundle(chart, settings)
    const before = requests()

    applyRollingVwapChartBandColors(bundle, {
      ...settings,
      bandColors: { band1: '#AA0000', band2: '#00AA00', band3: '#0000AA' },
    })
    assert.equal(requests(), before + 1)
    assert.equal(
      styleOf(bundle).outlines.lower3.color,
      marketStyleColorWithOpacity('#0000AA', settings.bandOpacities.band3),
    )
    assert.equal(styleOf(bundle).outlines.lower3.widthPx, settings.bandLineWidths.band3)

    applyRollingVwapChartBandLineWidths(bundle, {
      bandLineWidths: { band1: 2, band2: 3, band3: 4 },
    })
    assert.equal(requests(), before + 2)
    assert.equal(styleOf(bundle).outlines.upper2.widthPx, 3)

    applyRollingVwapChartBandLineStyles(bundle, {
      bandLineStyles: { band1: 'dotted', band2: 'solid', band3: 'dotted' },
    })
    assert.equal(requests(), before + 3)
    assert.equal(styleOf(bundle).outlines.upper1.lineStyle, 'dotted')
    assert.equal(styleOf(bundle).outlines.upper2.lineStyle, 'solid')

    applyRollingVwapChartBandFillStyle(bundle, { fillColor: '#123456', fillOpacity: 0 })
    assert.equal(requests(), before + 4)
    assert.equal(styleOf(bundle).fillStyle, marketStyleColorWithOpacity('#123456', 0))
  })

  it('applies the full instance presentation through one primitive style set', () => {
    const { chart, requests } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    const settings = createDefaultRollingVwapSettings()
    settings.lineWidth = 3
    settings.lineColor = '#ABCDEF'
    settings.lineOpacity = 80
    settings.lineStyle = 'dotted'
    settings.bandLineWidths = { band1: 4, band2: 3, band3: 2 }
    const instance = createRollingVwapInstance({ id: 'rv', settings })
    const before = requests()

    applyRollingVwapChartInstancePresentation(bundle, instance, '1h')

    assert.equal(requests(), before + 1)
    assert.equal(styleOf(bundle).outlines.upper3.widthPx, 2)
    const center = bundle.center as unknown as FakeSeries
    assert.equal(center.options.lineWidth, 3)
    assert.equal(center.options.lineStyle, LineStyle.Dotted)
    assert.equal(center.options.title, rollingVwapInstancePeriodLabel(instance, '1h'))
    assert.equal(center.options.lastValueVisible, true)
    assert.equal(center.options.priceLineVisible, false)
  })
})

describe('rollingVwap data path', () => {
  it('writes history to the centre once and adopts the same full source', () => {
    const { chart, created, requests } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    const points = [rollingPoint(), rollingPoint({ time: 1_700_000_060 })]
    const before = requests()
    setRollingVwapChartSeriesData(bundle, points)

    const center = created[0]
    assert.equal(center.data.length, 2)
    assert.deepEqual(center.data[0], { time: 1_700_000_000, value: 10 })
    // One native data write; the primitive receives the full source.
    assert.equal(requests(), before + 1)
  })

  it('updates one native centre point per live tick and patches the primitive last point', () => {
    const { chart, created, requests } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    setRollingVwapChartSeriesData(bundle, [rollingPoint()])
    const before = requests()

    updateRollingVwapChartSeriesLast(bundle, rollingPoint({ vwap: 20, upper1: 21 }))
    assert.equal(created[0].updates.length, 1)
    assert.equal(requests(), before + 1)

    updateRollingVwapChartSeriesLast(bundle, rollingPoint({ time: 1_700_000_060 }))
    assert.equal(created[0].updates.length, 2)
    // A stale point is ignored by the primitive, but the native series still
    // receives exactly the caller's update.
    updateRollingVwapChartSeriesLast(bundle, rollingPoint({ time: 1_699_999_000 }))
    assert.equal(created[0].updates.length, 3)
  })

  it('clears every part of the instance', () => {
    const { chart, created, requests } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    setRollingVwapChartSeriesData(bundle, [rollingPoint()])
    const before = requests()
    clearRollingVwapChartSeriesData(bundle)
    assert.deepEqual(created[0].data, [])
    assert.equal(requests(), before + 1)
    primitiveOf(bundle).updateAllViews()
    assert.equal(primitiveOf(bundle).stats().outlineRuns, 0)
  })

  it('live candles compute one latest point through the existing math', () => {
    const { chart, created } = createFakeChart()
    const settings = createDefaultRollingVwapSettings()
    const bundle = createRollingVwapChartSeriesBundle(chart, settings)
    const candles = [
      {
        symbol: 'BTCUSDT',
        interval: '1m' as const,
        time: 1_700_000_000,
        open: 10,
        high: 12,
        low: 8,
        close: 10,
        volume: 1,
        closed: true,
      },
      {
        symbol: 'BTCUSDT',
        interval: '1m' as const,
        time: 1_700_000_060,
        open: 10,
        high: 12,
        low: 8,
        close: 11,
        volume: 1,
        closed: true,
      },
    ]
    applyRollingVwapLiveFromCandles(candles, bundle, '1m', settings)
    // First tick calls center.update() with the computed point (no history rewrite).
    assert.equal(created[0].updates.length, 1)
    assert.equal(created[0].data.length, 0)
  })
})

describe('rollingVwap visibility and identity', () => {
  it('keeps the centre label/last value and hides every band when the instance is off', () => {
    const { chart, created } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    const instance = createRollingVwapInstance({ id: 'rv', enabled: false })
    setRollingVwapInstanceSeriesVisibility(bundle, instance, '1h')
    const center = created[0]
    assert.equal(center.options.visible, false)
    assert.equal(center.options.lastValueVisible, false)
    assert.equal(center.options.priceLineVisible, false)
    assert.equal(center.attachments.length, 1)
  })

  it('shows the centre and only pairs with a positive multiplier', () => {
    const { chart, created, requests } = createFakeChart()
    const settings = createDefaultRollingVwapSettings()
    settings.multipliers = { multiplier1: 1, multiplier2: 0, multiplier3: 2 }
    const bundle = createRollingVwapChartSeriesBundle(chart, settings)
    const instance = createRollingVwapInstance({ id: 'rv', settings })
    const before = requests()
    setRollingVwapInstanceSeriesVisibility(bundle, instance, '1m')
    assert.equal(created[0].options.visible, true)
    assert.equal(created[0].options.title, rollingVwapInstancePeriodLabel(instance, '1m'))
    assert.equal(created[0].options.lastValueVisible, true)
    assert.equal(requests(), before + 1)
  })

  it('derives pair visibility from the selected band type, not the inactive values', () => {
    const capture = (settings: RollingVwapSettings) => {
      const { chart } = createFakeChart()
      const bundle = createRollingVwapChartSeriesBundle(chart, settings)
      const seen: Record<string, boolean>[] = []
      const setVisibility = bundle.bands.setVisibility
      bundle.bands.setVisibility = (visible, bandVisible) => {
        seen.push({ ...bandVisible })
        setVisibility(visible, bandVisible)
      }
      const instance = createRollingVwapInstance({ id: 'rv', settings })
      setRollingVwapInstanceSeriesVisibility(bundle, instance, '1m')
      return seen.at(-1)
    }

    const settings = createDefaultRollingVwapSettings()
    settings.multipliers = { multiplier1: 1, multiplier2: 0, multiplier3: 2 }
    settings.bandPercentages = { band1: 0, band2: 5, band3: 0 }
    assert.deepEqual(capture(settings), { band1: true, band2: false, band3: true })

    // Percentage mode hides a pair with a 0 percentage even though its stdev
    // multiplier is non-zero, and shows one whose multiplier is 0.
    settings.bandType = 'percentage'
    assert.deepEqual(capture(settings), { band1: false, band2: true, band3: false })

    // A disabled instance hides every pair in both modes.
    const disabled = createDefaultRollingVwapSettings()
    disabled.bandType = 'percentage'
    disabled.bandPercentages = { band1: 1, band2: 2, band3: 3 }
    const { chart } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, disabled)
    const seen: Record<string, boolean>[] = []
    const setVisibility = bundle.bands.setVisibility
    bundle.bands.setVisibility = (visible, bandVisible) => {
      seen.push({ ...bandVisible })
      setVisibility(visible, bandVisible)
    }
    setRollingVwapInstanceSeriesVisibility(
      bundle,
      createRollingVwapInstance({ id: 'rv', enabled: false, settings: disabled }),
      '1m',
    )
    assert.deepEqual(seen.at(-1), { band1: false, band2: false, band3: false })
  })

  it('marks an unsupported timeframe on the centre label and hides all bands', () => {
    const { chart, created } = createFakeChart()
    const settings = createDefaultRollingVwapSettings()
    // A 1Y window needs a 4h chart timeframe; on 1h the instance is not rendered.
    settings.fixedTimePeriod = { useFixedTimePeriod: true, days: 365, hours: 0, minutes: 0 }
    const bundle = createRollingVwapChartSeriesBundle(chart, settings)
    const instance = createRollingVwapInstance({ id: 'rv', settings })
    setRollingVwapInstanceSeriesVisibility(bundle, instance, '1h')
    const center = created[0]
    assert.equal(center.options.visible, false)
    assert.match(String(center.options.title), /needs 4h chart timeframe/)
  })

  it('removes the single centre series and detaches the primitive', () => {
    const { chart, removed } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, createDefaultRollingVwapSettings())
    const center = bundle.center as unknown as FakeSeries
    removeRollingVwapChartSeriesBundle(chart, bundle)
    assert.equal(removed.length, 1)
    assert.equal(removed[0], center)
    assert.equal(center.attachments[0].detached, true)
  })
})

describe('rollingVwapPointToLinePoint', () => {
  it('maps null values to whitespace and keeps every band value', () => {
    assert.deepEqual(rollingVwapPointToLinePoint(rollingPoint({ vwap: null }), 'vwap'), {
      time: 1_700_000_000,
    })
    for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
      assert.deepEqual(rollingVwapPointToLinePoint(rollingPoint(), key), {
        time: 1_700_000_000,
        value: rollingPoint()[key],
      })
    }
  })

  it('maps a points array in one pass', () => {
    const data = rollingVwapPointsToLineData([rollingPoint(), rollingPoint({ time: 1_700_000_060 })], 'vwap')
    assert.deepEqual(data, [
      { time: 1_700_000_000, value: 10 },
      { time: 1_700_000_060, value: 10 },
    ])
  })
})

describe('settings storage compatibility', () => {
  it('keeps an instance built from persisted settings equivalent to its stored values', () => {
    const settings: RollingVwapSettings = createDefaultRollingVwapSettings()
    const { chart } = createFakeChart()
    const bundle = createRollingVwapChartSeriesBundle(chart, settings)
    const style = styleOf(bundle)
    assert.equal(style.outlines.upper1.lineStyle, settings.bandLineStyles.band1)
    assert.equal(style.outlines.upper1.widthPx, settings.bandLineWidths.band1)
    assert.equal(style.fillStyle, marketStyleColorWithOpacity(settings.fillColor, settings.fillOpacity))
  })
})
