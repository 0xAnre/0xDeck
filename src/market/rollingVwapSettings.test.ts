import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeRollingVwapPointsForSettings,
  createDefaultRollingVwapSettings,
  DEFAULT_ROLLING_VWAP_BAND_COLORS,
  DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_BAND_LINE_STYLES,
  DEFAULT_ROLLING_VWAP_BAND_LINE_WIDTHS,
  DEFAULT_ROLLING_VWAP_BAND_OPACITIES,
  DEFAULT_ROLLING_VWAP_FILL_COLOR,
  DEFAULT_ROLLING_VWAP_FILL_OPACITY,
  DEFAULT_ROLLING_VWAP_LINE_COLOR,
  DEFAULT_ROLLING_VWAP_LINE_OPACITY,
  DEFAULT_ROLLING_VWAP_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_LINE_WIDTH,
  isRollingVwapLineStyle,
  isRollingVwapLineWidth,
  ROLLING_VWAP_LINE_WIDTHS,
  resolveRollingVwapBandDistances,
  resolveRollingVwapBandFillStyle,
  rollingVwapCenterLineRgbaColor,
  sanitizeRollingVwapSettings,
  withRollingVwapBandType,
} from './rollingVwapSettings.ts'
import {
  LINE_CHART_STROKE_WIDTHS,
  isLineChartStrokeWidth,
} from './lineChartStroke.ts'
import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_OPACITY_PERCENT,
  MARKET_STYLE_ROLLING_BAND_SHADES,
} from './marketStylePalette.ts'
import {
  computeRollingVwapForInterval,
  DEFAULT_ROLLING_VWAP_BAND_PERCENTAGES,
  DEFAULT_ROLLING_VWAP_BAND_TYPE,
  DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD,
  DEFAULT_ROLLING_VWAP_MIN_BARS,
  DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS,
  MAX_ROLLING_VWAP_BAND_PERCENTAGE,
} from './rollingVwap.ts'
import type { MarketCandle } from './types.ts'

describe('createDefaultRollingVwapSettings', () => {
  it('matches Pine Rolling VWAP input defaults', () => {
    const settings = createDefaultRollingVwapSettings()
    assert.deepEqual(settings.fixedTimePeriod, DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD)
    assert.equal(settings.minBars, DEFAULT_ROLLING_VWAP_MIN_BARS)
    assert.equal(settings.bandType, DEFAULT_ROLLING_VWAP_BAND_TYPE)
    assert.deepEqual(settings.multipliers, DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS)
    assert.deepEqual(settings.bandPercentages, DEFAULT_ROLLING_VWAP_BAND_PERCENTAGES)
    assert.deepEqual(settings.bandColors, DEFAULT_ROLLING_VWAP_BAND_COLORS)
    assert.deepEqual(settings.bandOpacities, DEFAULT_ROLLING_VWAP_BAND_OPACITIES)
    assert.deepEqual(settings.bandLineStyles, DEFAULT_ROLLING_VWAP_BAND_LINE_STYLES)
    assert.deepEqual(settings.bandLineStyles, {
      band1: 'solid',
      band2: 'solid',
      band3: 'solid',
    })
    assert.deepEqual(settings.bandLineWidths, DEFAULT_ROLLING_VWAP_BAND_LINE_WIDTHS)
    assert.deepEqual(settings.bandLineWidths, {
      band1: DEFAULT_ROLLING_VWAP_LINE_WIDTH,
      band2: DEFAULT_ROLLING_VWAP_LINE_WIDTH,
      band3: DEFAULT_ROLLING_VWAP_LINE_WIDTH,
    })
    assert.equal(DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE, 'solid')
    assert.equal(settings.fillColor, DEFAULT_ROLLING_VWAP_FILL_COLOR)
    assert.equal(settings.fillOpacity, DEFAULT_ROLLING_VWAP_FILL_OPACITY)
    assert.equal(settings.lineWidth, DEFAULT_ROLLING_VWAP_LINE_WIDTH)
    assert.equal(settings.lineColor, DEFAULT_ROLLING_VWAP_LINE_COLOR)
    assert.equal(settings.lineOpacity, DEFAULT_ROLLING_VWAP_LINE_OPACITY)
    assert.equal(settings.lineStyle, DEFAULT_ROLLING_VWAP_LINE_STYLE)
  })

  it('uses palette defaults for bands and center line', () => {
    const settings = createDefaultRollingVwapSettings()
    assert.deepEqual(settings.bandColors, {
      band1: MARKET_STYLE_ROLLING_BAND_SHADES[0],
      band2: MARKET_STYLE_ROLLING_BAND_SHADES[1],
      band3: MARKET_STYLE_ROLLING_BAND_SHADES[2],
    })
    assert.equal(new Set(Object.values(settings.bandColors)).size, 3)
    assert.deepEqual(settings.bandOpacities, {
      band1: MARKET_STYLE_OPACITY_PERCENT.secondary,
      band2: MARKET_STYLE_OPACITY_PERCENT.secondary,
      band3: MARKET_STYLE_OPACITY_PERCENT.secondary,
    })
    assert.equal(settings.lineColor, MARKET_STYLE_DEFAULTS.primaryLine.color)
    assert.equal(settings.lineOpacity, 100)
    assert.equal(settings.fillColor, MARKET_STYLE_DEFAULTS.fill.color)
    assert.equal(settings.fillOpacity, 15)
  })

  it('returns independent object instances', () => {
    const a = createDefaultRollingVwapSettings()
    const b = createDefaultRollingVwapSettings()
    assert.notEqual(a, b)
    assert.notEqual(a.fixedTimePeriod, b.fixedTimePeriod)
    a.minBars = 99
    assert.equal(b.minBars, DEFAULT_ROLLING_VWAP_MIN_BARS)
  })
})

describe('sanitizeRollingVwapSettings', () => {
  it('merges valid partial settings with defaults', () => {
    const result = sanitizeRollingVwapSettings({
      minBars: 25,
      multipliers: { multiplier1: 1.5, multiplier2: 0, multiplier3: 0 },
    })
    assert.equal(result.minBars, 25)
    assert.equal(result.multipliers.multiplier1, 1.5)
    assert.equal(result.fixedTimePeriod.days, 1)
  })

  it('loads legacy records without fill fields using the shared fill default', () => {
    const result = sanitizeRollingVwapSettings({
      minBars: 12,
      bandColors: { band1: '#111111', band2: '#222222', band3: '#333333' },
    })
    assert.equal(result.fillColor, DEFAULT_ROLLING_VWAP_FILL_COLOR)
    assert.equal(result.fillOpacity, DEFAULT_ROLLING_VWAP_FILL_OPACITY)
  })

  it('persists a valid fill color and opacity', () => {
    const result = sanitizeRollingVwapSettings({
      fillColor: '#123456',
      fillOpacity: 0,
    })
    assert.equal(result.fillColor, '#123456')
    assert.equal(result.fillOpacity, 0)
    assert.equal(
      sanitizeRollingVwapSettings({ fillOpacity: 100 }).fillOpacity,
      100,
    )
    assert.equal(
      sanitizeRollingVwapSettings({ fillOpacity: 37.5 }).fillOpacity,
      37.5,
    )
  })

  it('replaces invalid fill fields individually', () => {
    const result = sanitizeRollingVwapSettings({
      fillColor: 'rgba(1, 2, 3, 0.5)',
      fillOpacity: 101,
    })
    assert.equal(result.fillColor, DEFAULT_ROLLING_VWAP_FILL_COLOR)
    assert.equal(result.fillOpacity, DEFAULT_ROLLING_VWAP_FILL_OPACITY)

    const partial = sanitizeRollingVwapSettings({
      fillColor: '#abcdef',
      fillOpacity: -1,
    })
    assert.equal(partial.fillColor, '#abcdef')
    assert.equal(partial.fillOpacity, DEFAULT_ROLLING_VWAP_FILL_OPACITY)
  })

  it('replaces invalid fields individually', () => {
    const result = sanitizeRollingVwapSettings({
      fixedTimePeriod: { days: -1, hours: 50, minutes: 99, useFixedTimePeriod: true },
      minBars: 0,
      multipliers: { multiplier1: -2, multiplier2: Number.NaN, multiplier3: Number.POSITIVE_INFINITY },
      bandColors: { band1: 'red', band2: '#ffeb3b', band3: '#12345' },
    })
    assert.equal(result.fixedTimePeriod.useFixedTimePeriod, true)
    assert.equal(result.fixedTimePeriod.days, 1)
    assert.equal(result.fixedTimePeriod.hours, 0)
    assert.equal(result.fixedTimePeriod.minutes, 0)
    assert.equal(result.minBars, DEFAULT_ROLLING_VWAP_MIN_BARS)
    assert.equal(result.multipliers.multiplier1, 0)
    assert.equal(result.multipliers.multiplier2, 0)
    assert.equal(result.multipliers.multiplier3, 0)
    assert.equal(result.bandColors.band1, DEFAULT_ROLLING_VWAP_BAND_COLORS.band1)
    assert.equal(result.bandColors.band2, '#ffeb3b')
    assert.equal(result.bandColors.band3, DEFAULT_ROLLING_VWAP_BAND_COLORS.band3)
  })

  it('keeps band and center-line opacities independent', () => {
    const result = sanitizeRollingVwapSettings({
      bandOpacities: { band1: 10, band2: 20, band3: 30 },
      lineOpacity: 60,
    })
    assert.deepEqual(result.bandOpacities, { band1: 10, band2: 20, band3: 30 })
    assert.equal(result.lineOpacity, 60)
  })

  it('keeps each band line style independent', () => {
    const result = sanitizeRollingVwapSettings({
      bandLineStyles: { band1: 'dotted', band2: 'solid', band3: 'dotted' },
      lineStyle: 'solid',
    })
    assert.deepEqual(result.bandLineStyles, {
      band1: 'dotted',
      band2: 'solid',
      band3: 'dotted',
    })
    assert.equal(result.lineStyle, 'solid')
  })

  it('defaults every band line style to solid when the field is absent', () => {
    const result = sanitizeRollingVwapSettings({
      bandColors: DEFAULT_ROLLING_VWAP_BAND_COLORS,
      bandOpacities: { band1: 10, band2: 20, band3: 30 },
    })
    assert.deepEqual(result.bandLineStyles, DEFAULT_ROLLING_VWAP_BAND_LINE_STYLES)
  })

  it('migrates retired dashed band styles to solid and invalids to solid', () => {
    const result = sanitizeRollingVwapSettings({
      bandLineStyles: { band1: 'dashed', band2: 'zigzag', band3: 42 },
    })
    assert.deepEqual(result.bandLineStyles, {
      band1: 'solid',
      band2: 'solid',
      band3: 'solid',
    })
  })

  it('sanitizes partially stored band line styles field by field', () => {
    const result = sanitizeRollingVwapSettings({ bandLineStyles: { band2: 'dotted' } })
    assert.deepEqual(result.bandLineStyles, {
      band1: 'solid',
      band2: 'dotted',
      band3: 'solid',
    })
  })

  it('does not return a shared mutable band line style singleton', () => {
    const first = sanitizeRollingVwapSettings(undefined)
    first.bandLineStyles.band1 = 'dotted'
    assert.equal(sanitizeRollingVwapSettings(undefined).bandLineStyles.band1, 'solid')
    assert.equal(DEFAULT_ROLLING_VWAP_BAND_LINE_STYLES.band1, 'solid')
  })

  it('loads legacy payloads without new opacity fields using palette defaults', () => {
    const result = sanitizeRollingVwapSettings({
      bandColors: { band1: '#111111', band2: '#222222', band3: '#333333' },
    })
    assert.deepEqual(result.bandColors, {
      band1: '#111111',
      band2: '#222222',
      band3: '#333333',
    })
    assert.deepEqual(result.bandOpacities, DEFAULT_ROLLING_VWAP_BAND_OPACITIES)
  })

  it('drops the retired info box field from a legacy record without disturbing other fields', () => {
    const result = sanitizeRollingVwapSettings({
      fixedTimePeriod: { days: 2, hours: 3, minutes: 4, useFixedTimePeriod: true },
      minBars: 30,
      multipliers: { multiplier1: 1, multiplier2: 2, multiplier3: 3 },
      bandColors: { band1: '#111111', band2: '#222222', band3: '#333333' },
      bandOpacities: { band1: 10, band2: 20, band3: 30 },
      bandLineStyles: { band1: 'dotted', band2: 'solid', band3: 'dotted' },
      infoBox: {
        visible: false,
        size: 'large',
        verticalPosition: 'top',
        horizontalPosition: 'left',
        backgroundColor: '#444444',
        backgroundColorOpacity: 40,
        textColor: '#555555',
        textColorOpacity: 90,
      },
      lineWidth: 3,
      lineColor: '#123456',
      lineOpacity: 45,
      lineStyle: 'dotted',
    })
    assert.equal('infoBox' in result, false)
    assert.deepEqual(result.fixedTimePeriod, {
      days: 2,
      hours: 3,
      minutes: 4,
      useFixedTimePeriod: true,
    })
    assert.equal(result.minBars, 30)
    assert.deepEqual(result.multipliers, { multiplier1: 1, multiplier2: 2, multiplier3: 3 })
    assert.deepEqual(result.bandColors, {
      band1: '#111111',
      band2: '#222222',
      band3: '#333333',
    })
    assert.deepEqual(result.bandOpacities, { band1: 10, band2: 20, band3: 30 })
    assert.deepEqual(result.bandLineStyles, {
      band1: 'dotted',
      band2: 'solid',
      band3: 'dotted',
    })
    assert.equal(result.lineWidth, 3)
    assert.equal(result.lineColor, '#123456')
    assert.equal(result.lineOpacity, 45)
    assert.equal(result.lineStyle, 'dotted')
  })

  it('never treats the retired dashed style as selectable', () => {
    assert.equal(isRollingVwapLineStyle('solid'), true)
    assert.equal(isRollingVwapLineStyle('dotted'), true)
    assert.equal(isRollingVwapLineStyle('dashed'), false)
    assert.equal(isRollingVwapLineStyle(undefined), false)
  })

  it('migrates a persisted dashed line style to solid and keeps other fields', () => {
    const result = sanitizeRollingVwapSettings({
      lineStyle: 'dashed',
      lineColor: '#123456',
      lineOpacity: 45,
    })
    assert.equal(result.lineStyle, 'solid')
    assert.equal(result.lineColor, '#123456')
    assert.equal(result.lineOpacity, 45)
  })

  it('is idempotent so a no-op Save keeps every value', () => {
    const saved = sanitizeRollingVwapSettings({
      bandType: 'percentage',
      multipliers: { multiplier1: 1.5, multiplier2: 2.5, multiplier3: 3.5 },
      bandPercentages: { band1: 2.5, band2: 0, band3: 12.75 },
      minBars: 13,
      bandLineWidths: { band1: 2, band2: 3, band3: 4 },
    })
    assert.deepEqual(sanitizeRollingVwapSettings(saved), saved)
  })

  it('returns defaults for corrupt root input', () => {
    assert.deepEqual(sanitizeRollingVwapSettings(null), createDefaultRollingVwapSettings())
    assert.deepEqual(sanitizeRollingVwapSettings('bad'), createDefaultRollingVwapSettings())
  })

  it('does not return a shared mutable default singleton', () => {
    const first = sanitizeRollingVwapSettings(undefined)
    first.minBars = 77
    const second = sanitizeRollingVwapSettings(undefined)
    assert.equal(second.minBars, DEFAULT_ROLLING_VWAP_MIN_BARS)
  })

  it('defaults lineWidth to 1 when missing from stored settings', () => {
    const result = sanitizeRollingVwapSettings({ minBars: 12 })
    assert.equal(result.lineWidth, 1)
  })

  it('persists valid lineWidth values', () => {
    for (const lineWidth of [1, 2, 3, 4] as const) {
      const result = sanitizeRollingVwapSettings({ lineWidth })
      assert.equal(result.lineWidth, lineWidth)
    }
  })

  it('falls back to width 1 for invalid lineWidth values', () => {
    for (const lineWidth of [0, 5, 1.5, '2', null, Number.NaN]) {
      const result = sanitizeRollingVwapSettings({ lineWidth })
      assert.equal(result.lineWidth, 1)
    }
  })

  it('loads legacy instances without per-band widths at their center-line width', () => {
    const result = sanitizeRollingVwapSettings({ lineWidth: 3 })
    assert.deepEqual(result.bandLineWidths, { band1: 3, band2: 3, band3: 3 })
  })

  it('defaults missing per-band widths to 1 when the center width is missing too', () => {
    const result = sanitizeRollingVwapSettings({ minBars: 12 })
    assert.deepEqual(result.bandLineWidths, {
      band1: DEFAULT_ROLLING_VWAP_LINE_WIDTH,
      band2: DEFAULT_ROLLING_VWAP_LINE_WIDTH,
      band3: DEFAULT_ROLLING_VWAP_LINE_WIDTH,
    })
  })

  it('persists independent per-band widths without touching colors or styles', () => {
    const result = sanitizeRollingVwapSettings({
      lineWidth: 2,
      bandLineWidths: { band1: 1, band2: 3, band3: 4 },
      bandColors: { band1: '#111111', band2: '#222222', band3: '#333333' },
      bandOpacities: { band1: 0, band2: 40, band3: 100 },
      bandLineStyles: { band1: 'dotted', band2: 'solid', band3: 'dotted' },
    })
    assert.deepEqual(result.bandLineWidths, { band1: 1, band2: 3, band3: 4 })
    assert.equal(result.lineWidth, 2)
    assert.deepEqual(result.bandColors, {
      band1: '#111111',
      band2: '#222222',
      band3: '#333333',
    })
    assert.deepEqual(result.bandOpacities, { band1: 0, band2: 40, band3: 100 })
    assert.deepEqual(result.bandLineStyles, {
      band1: 'dotted',
      band2: 'solid',
      band3: 'dotted',
    })
  })

  it('sanitizes each invalid per-band width back to the center width', () => {
    const result = sanitizeRollingVwapSettings({
      lineWidth: 4,
      bandLineWidths: { band1: 0, band2: 5, band3: '2' },
    })
    assert.deepEqual(result.bandLineWidths, { band1: 4, band2: 4, band3: 4 })
  })

  it('defaults center-line presentation when fields are missing', () => {
    const result = sanitizeRollingVwapSettings({ minBars: 12 })
    assert.equal(result.lineColor, DEFAULT_ROLLING_VWAP_LINE_COLOR)
    assert.equal(result.lineOpacity, 100)
    assert.equal(result.lineStyle, 'solid')
  })

  it('persists valid center-line presentation fields', () => {
    const result = sanitizeRollingVwapSettings({
      lineColor: '#ff0000',
      lineOpacity: 50,
      lineStyle: 'dotted',
    })
    assert.equal(result.lineColor, '#ff0000')
    assert.equal(result.lineOpacity, 50)
    assert.equal(result.lineStyle, 'dotted')
  })

  it('replaces invalid center-line presentation fields individually', () => {
    const result = sanitizeRollingVwapSettings({
      lineColor: 'red',
      lineOpacity: 150,
      lineStyle: 'dashed',
    })
    assert.equal(result.lineColor, DEFAULT_ROLLING_VWAP_LINE_COLOR)
    assert.equal(result.lineOpacity, DEFAULT_ROLLING_VWAP_LINE_OPACITY)
    assert.equal(result.lineStyle, DEFAULT_ROLLING_VWAP_LINE_STYLE)
  })
})

function percentageCandles(): MarketCandle[] {
  const base = 1_700_000_000
  const prices = [42000, 42100, 41950, 42300, 42150]
  return prices.map((price, index) => ({
    symbol: 'BTCUSDT',
    interval: '1h',
    time: base + index * 3600,
    open: price,
    high: price + 55,
    low: price - 45,
    close: price + 10,
    volume: index === 2 ? 0 : 12 + index * 3.5,
    closed: true,
  }))
}

describe('rolling VWAP band type settings', () => {
  it('keeps a legacy record on standard deviation without rewriting it', () => {
    // Exactly the pre-#282 persisted shape: no band type, no percentages.
    const legacyRecord = {
      minBars: 21,
      multipliers: { multiplier1: 1.5, multiplier2: 0, multiplier3: 2 },
      bandColors: { band1: '#111111', band2: '#222222', band3: '#333333' },
      fillColor: '#334455',
      fillOpacity: 40,
    }
    const snapshot = JSON.parse(JSON.stringify(legacyRecord))
    const settings = sanitizeRollingVwapSettings(legacyRecord)
    assert.equal(settings.bandType, 'stdev')
    assert.deepEqual(settings.bandPercentages, { band1: 0, band2: 0, band3: 0 })
    assert.deepEqual(settings.multipliers, { multiplier1: 1.5, multiplier2: 0, multiplier3: 2 })
    // Sanitizing is a read: it adds no fields to the stored record.
    assert.deepEqual(legacyRecord, snapshot)
    assert.equal('bandType' in legacyRecord, false)
    assert.equal('bandPercentages' in legacyRecord, false)
  })

  it('persists mode and percentage values alongside untouched multipliers', () => {
    const settings = sanitizeRollingVwapSettings({
      bandType: 'percentage',
      multipliers: { multiplier1: 1.5, multiplier2: 2.5, multiplier3: 3.5 },
      bandPercentages: { band1: 2.5, band2: 0, band3: 12.75 },
    })
    assert.equal(settings.bandType, 'percentage')
    assert.deepEqual(settings.bandPercentages, { band1: 2.5, band2: 0, band3: 12.75 })
    assert.deepEqual(settings.multipliers, { multiplier1: 1.5, multiplier2: 2.5, multiplier3: 3.5 })
  })

  it('falls back to standard deviation for a missing or invalid mode', () => {
    for (const bandType of [undefined, null, 'percent', 'Percentage', 1, {}]) {
      const settings = sanitizeRollingVwapSettings({ bandType, minBars: 8 })
      assert.equal(settings.bandType, 'stdev')
      assert.equal(settings.minBars, 8)
    }
  })

  it('sanitizes percentage values without dropping valid siblings', () => {
    const settings = sanitizeRollingVwapSettings({
      bandType: 'percentage',
      bandPercentages: {
        band1: 2.5,
        band2: '3',
        band3: MAX_ROLLING_VWAP_BAND_PERCENTAGE + 1,
      },
    })
    assert.deepEqual(settings.bandPercentages, { band1: 2.5, band2: 0, band3: 0 })
  })

  it('returns independent percentage records', () => {
    const first = createDefaultRollingVwapSettings()
    const second = createDefaultRollingVwapSettings()
    assert.notEqual(first.bandPercentages, second.bandPercentages)
    first.bandPercentages.band1 = 7.5
    assert.equal(second.bandPercentages.band1, 0)
  })

  it('switches band type without destroying either parameter set', () => {
    const base = createDefaultRollingVwapSettings()
    base.multipliers = { multiplier1: 1, multiplier2: 2, multiplier3: 0 }
    base.bandPercentages = { band1: 1.5, band2: 0, band3: 8.25 }
    const percentage = withRollingVwapBandType(base, 'percentage')
    assert.equal(percentage.bandType, 'percentage')
    assert.deepEqual(percentage.multipliers, base.multipliers)
    assert.deepEqual(percentage.bandPercentages, base.bandPercentages)
    const backToStdev = withRollingVwapBandType(percentage, 'stdev')
    assert.equal(backToStdev.bandType, 'stdev')
    assert.deepEqual(backToStdev.multipliers, base.multipliers)
    assert.deepEqual(backToStdev.bandPercentages, base.bandPercentages)
    // The original draft object is not mutated (Cancel keeps its snapshot).
    assert.equal(base.bandType, 'stdev')
  })

  it('resolves distances from the selected mode only', () => {
    const base = createDefaultRollingVwapSettings()
    base.multipliers = { multiplier1: 1, multiplier2: 0, multiplier3: 2 }
    base.bandPercentages = { band1: 0, band2: 1.25, band3: 0 }
    assert.deepEqual(resolveRollingVwapBandDistances(base), {
      band1: 1,
      band2: 0,
      band3: 2,
    })
    assert.deepEqual(resolveRollingVwapBandDistances({ ...base, bandType: 'percentage' }), {
      band1: 0,
      band2: 1.25,
      band3: 0,
    })
  })

  it('positions percentage bands from the settings path with the accepted formula', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.bandType = 'percentage'
    settings.bandPercentages = { band1: 2, band2: 0, band3: 6.5 }
    settings.minBars = 2
    const candles = percentageCandles()
    const points = computeRollingVwapPointsForSettings(candles, '1h', settings)
    const last = points.at(-1)!
    assert.ok(last.vwap !== null)
    assert.equal(last.upper1, last.vwap! * (1 + 2 / 100))
    assert.equal(last.lower1, last.vwap! * (1 - 2 / 100))
    assert.equal(last.upper2, last.vwap)
    assert.equal(last.lower2, last.vwap)
    assert.equal(last.upper3, last.vwap! * (1 + 6.5 / 100))
    // Same centre as the standard-deviation computation of the same candles.
    const stdevPoints = computeRollingVwapForInterval(candles, '1h', settings.fixedTimePeriod, {
      minBars: settings.minBars,
      multipliers: settings.multipliers,
    })
    assert.deepEqual(
      points.map((point) => [point.time, point.vwap, point.stdev]),
      stdevPoints.map((point) => [point.time, point.vwap, point.stdev]),
    )
    // The inactive stdev multipliers (all 0 defaults) never position the bands.
    assert.notEqual(last.upper1, last.vwap)
  })

  it('computes standard-mode settings bit-for-bit like the core defaults', () => {
    const settings = createDefaultRollingVwapSettings()
    settings.multipliers = { multiplier1: 1, multiplier2: 2, multiplier3: 0.5 }
    settings.bandPercentages = { band1: 4, band2: 9, band3: 20 }
    settings.minBars = 2
    const candles = percentageCandles()
    assert.deepEqual(
      computeRollingVwapPointsForSettings(candles, '1h', settings),
      computeRollingVwapForInterval(candles, '1h', settings.fixedTimePeriod, {
        minBars: settings.minBars,
        multipliers: settings.multipliers,
      }),
    )
  })
})

describe('rollingVwapCenterLineRgbaColor', () => {
  it('returns hex when opacity is 100', () => {
    assert.equal(rollingVwapCenterLineRgbaColor('#9e9e9e', 100), '#9e9e9e')
  })

  it('converts hex and opacity to rgba', () => {
    assert.equal(rollingVwapCenterLineRgbaColor('#ff0000', 50), 'rgba(255, 0, 0, 0.5)')
  })
})

describe('resolveRollingVwapBandFillStyle', () => {
  it('resolves the Rolling VWAP fill default for missing fields', () => {
    assert.equal(
      resolveRollingVwapBandFillStyle({}),
      'rgba(163, 163, 163, 0.15)',
    )
    assert.equal(
      resolveRollingVwapBandFillStyle({ fillColor: 'bad', fillOpacity: 250 }),
      'rgba(163, 163, 163, 0.15)',
    )
  })

  it('folds a custom color and opacity into rgba', () => {
    assert.equal(
      resolveRollingVwapBandFillStyle({ fillColor: '#123456', fillOpacity: 60 }),
      'rgba(18, 52, 86, 0.6)',
    )
    assert.equal(
      resolveRollingVwapBandFillStyle({ fillColor: '#ffffff', fillOpacity: 100 }),
      '#ffffff',
    )
  })

  it('resolves 0% to a fully transparent fill', () => {
    assert.equal(
      resolveRollingVwapBandFillStyle({ fillColor: '#123456', fillOpacity: 0 }),
      'rgba(18, 52, 86, 0)',
    )
  })
})

describe('rolling VWAP width control migration', () => {
  it('shares the 1-4px scale used by LineChartStrokeSelectFields', () => {
    assert.deepEqual([...ROLLING_VWAP_LINE_WIDTHS], [...LINE_CHART_STROKE_WIDTHS])
  })

  it('accepts and rejects exactly the shared stroke widths', () => {
    for (const value of [0, 1, 2, 3, 4, 5, 1.5, '2', null, undefined, Number.NaN]) {
      assert.equal(isRollingVwapLineWidth(value), isLineChartStrokeWidth(value))
    }
  })

  it('round-trips every shared width through the stored-settings sanitizer', () => {
    for (const lineWidth of LINE_CHART_STROKE_WIDTHS) {
      assert.equal(sanitizeRollingVwapSettings({ lineWidth }).lineWidth, lineWidth)
    }
  })
})
