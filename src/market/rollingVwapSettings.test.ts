import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createDefaultRollingVwapSettings,
  DEFAULT_ROLLING_VWAP_BAND_COLORS,
  DEFAULT_ROLLING_VWAP_BAND_OPACITIES,
  DEFAULT_ROLLING_VWAP_INFO_BOX,
  DEFAULT_ROLLING_VWAP_LINE_COLOR,
  DEFAULT_ROLLING_VWAP_LINE_OPACITY,
  DEFAULT_ROLLING_VWAP_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_LINE_WIDTH,
  isRollingVwapLineStyle,
  isRollingVwapLineWidth,
  ROLLING_VWAP_LINE_WIDTHS,
  rollingVwapCenterLineRgbaColor,
  sanitizeRollingVwapSettings,
} from './rollingVwapSettings.ts'
import {
  LINE_CHART_STROKE_WIDTHS,
  isLineChartStrokeWidth,
} from './lineChartStroke.ts'
import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_OPACITY_PERCENT,
  MARKET_STYLE_PALETTE,
  MARKET_STYLE_ROLLING_BAND_SHADES,
} from './marketStylePalette.ts'
import {
  DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD,
  DEFAULT_ROLLING_VWAP_MIN_BARS,
  DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS,
} from './rollingVwap.ts'

describe('createDefaultRollingVwapSettings', () => {
  it('matches Pine Rolling VWAP input defaults', () => {
    const settings = createDefaultRollingVwapSettings()
    assert.deepEqual(settings.fixedTimePeriod, DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD)
    assert.equal(settings.minBars, DEFAULT_ROLLING_VWAP_MIN_BARS)
    assert.deepEqual(settings.multipliers, DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS)
    assert.deepEqual(settings.bandColors, DEFAULT_ROLLING_VWAP_BAND_COLORS)
    assert.deepEqual(settings.infoBox, DEFAULT_ROLLING_VWAP_INFO_BOX)
    assert.equal(settings.lineWidth, DEFAULT_ROLLING_VWAP_LINE_WIDTH)
    assert.equal(settings.lineColor, DEFAULT_ROLLING_VWAP_LINE_COLOR)
    assert.equal(settings.lineOpacity, DEFAULT_ROLLING_VWAP_LINE_OPACITY)
    assert.equal(settings.lineStyle, DEFAULT_ROLLING_VWAP_LINE_STYLE)
  })

  it('uses palette defaults for bands, center line and info box', () => {
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
    assert.equal(settings.infoBox.backgroundColor, MARKET_STYLE_PALETTE.dark)
    assert.equal(settings.infoBox.backgroundColorOpacity, 100)
    assert.equal(settings.infoBox.textColor, MARKET_STYLE_PALETTE.light)
    assert.equal(settings.infoBox.textColorOpacity, 100)
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
      infoBox: { visible: false },
    })
    assert.equal(result.minBars, 25)
    assert.equal(result.multipliers.multiplier1, 1.5)
    assert.equal(result.infoBox.visible, false)
    assert.equal(result.infoBox.size, 'small')
    assert.equal(result.fixedTimePeriod.days, 1)
  })

  it('replaces invalid fields individually', () => {
    const result = sanitizeRollingVwapSettings({
      fixedTimePeriod: { days: -1, hours: 50, minutes: 99, useFixedTimePeriod: true },
      minBars: 0,
      multipliers: { multiplier1: -2, multiplier2: Number.NaN, multiplier3: Number.POSITIVE_INFINITY },
      bandColors: { band1: 'red', band2: '#ffeb3b', band3: '#12345' },
      infoBox: {
        size: 'xlarge',
        verticalPosition: 'sideways',
        horizontalPosition: 'far-right',
        backgroundColor: '#787b86',
        textColor: '#fff',
      },
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
    assert.equal(result.infoBox.size, 'small')
    assert.equal(result.infoBox.verticalPosition, 'bottom')
    assert.equal(result.infoBox.horizontalPosition, 'right')
    assert.equal(result.infoBox.textColor, DEFAULT_ROLLING_VWAP_INFO_BOX.textColor)
  })

  it('keeps band, center-line and info-box opacities independent', () => {
    const result = sanitizeRollingVwapSettings({
      bandOpacities: { band1: 10, band2: 20, band3: 30 },
      infoBox: { backgroundColorOpacity: 40, textColorOpacity: 90 },
      lineOpacity: 60,
    })
    assert.deepEqual(result.bandOpacities, { band1: 10, band2: 20, band3: 30 })
    assert.equal(result.infoBox.backgroundColorOpacity, 40)
    assert.equal(result.infoBox.textColorOpacity, 90)
    assert.equal(result.lineOpacity, 60)
  })

  it('loads legacy payloads without new opacity fields using palette defaults', () => {
    const result = sanitizeRollingVwapSettings({
      bandColors: { band1: '#111111', band2: '#222222', band3: '#333333' },
      infoBox: { backgroundColor: '#444444', textColor: '#555555' },
    })
    assert.deepEqual(result.bandColors, {
      band1: '#111111',
      band2: '#222222',
      band3: '#333333',
    })
    assert.deepEqual(result.bandOpacities, DEFAULT_ROLLING_VWAP_BAND_OPACITIES)
    assert.equal(result.infoBox.backgroundColor, '#444444')
    assert.equal(result.infoBox.textColor, '#555555')
    assert.equal(result.infoBox.backgroundColorOpacity, 100)
    assert.equal(result.infoBox.textColorOpacity, 100)
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

describe('rollingVwapCenterLineRgbaColor', () => {
  it('returns hex when opacity is 100', () => {
    assert.equal(rollingVwapCenterLineRgbaColor('#9e9e9e', 100), '#9e9e9e')
  })

  it('converts hex and opacity to rgba', () => {
    assert.equal(rollingVwapCenterLineRgbaColor('#ff0000', 50), 'rgba(255, 0, 0, 0.5)')
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
