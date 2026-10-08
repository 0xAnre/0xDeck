import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createDefaultRollingVwapSettings,
  DEFAULT_ROLLING_VWAP_BAND_COLORS,
  DEFAULT_ROLLING_VWAP_INFO_BOX,
  DEFAULT_ROLLING_VWAP_LINE_COLOR,
  DEFAULT_ROLLING_VWAP_LINE_OPACITY,
  DEFAULT_ROLLING_VWAP_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_LINE_WIDTH,
  rollingVwapCenterLineRgbaColor,
  sanitizeRollingVwapSettings,
} from './rollingVwapSettings.ts'
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
