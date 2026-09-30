import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createDefaultRollingVwapSettings,
  DEFAULT_ROLLING_VWAP_BAND_COLORS,
  DEFAULT_ROLLING_VWAP_INFO_BOX,
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
})
