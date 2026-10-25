import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createAnchoredVwapInstance,
  sanitizeAnchoredVwapInstances,
} from './anchoredVwapInstances.ts'
import {
  createDefaultAnchoredVwapDrawingSettings,
  isAnchoredVwapFillOpacity,
  sanitizeAnchoredVwapDrawingSettings,
} from './anchoredVwapDrawingSettings.ts'
import { MARKET_STYLE_DEFAULTS } from './marketStylePalette.ts'

describe('anchoredVwapDrawingSettings defaults', () => {
  it('defaults both sides visible, fill disabled and palette band colors', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    for (const pair of [settings.band1, settings.band2, settings.band3]) {
      assert.equal(pair.upperVisible, true)
      assert.equal(pair.lowerVisible, true)
      assert.equal(pair.fillOpacity, 0)
      assert.equal(pair.upperColor, MARKET_STYLE_DEFAULTS.secondaryLine.color)
      assert.equal(pair.lowerColor, MARKET_STYLE_DEFAULTS.secondaryLine.color)
      assert.equal(pair.fillColor, MARKET_STYLE_DEFAULTS.fill.color)
      assert.equal(pair.upperOpacity, MARKET_STYLE_DEFAULTS.secondaryLine.opacityPercent)
      assert.equal(pair.lowerOpacity, MARKET_STYLE_DEFAULTS.secondaryLine.opacityPercent)
      assert.equal(pair.lineStyle, 'solid')
    }
    assert.equal(settings.vwapLine.lineColor, MARKET_STYLE_DEFAULTS.primaryLine.color)
    assert.equal(settings.vwapLine.lineOpacity, MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent)
    assert.equal(settings.vwapLine.lineStyle, 'solid')
  })
})

describe('isAnchoredVwapFillOpacity', () => {
  it('accepts only finite percentages within 0..100', () => {
    assert.equal(isAnchoredVwapFillOpacity(0), true)
    assert.equal(isAnchoredVwapFillOpacity(50.5), true)
    assert.equal(isAnchoredVwapFillOpacity(100), true)
    assert.equal(isAnchoredVwapFillOpacity(-1), false)
    assert.equal(isAnchoredVwapFillOpacity(101), false)
    assert.equal(isAnchoredVwapFillOpacity(Number.NaN), false)
    assert.equal(isAnchoredVwapFillOpacity('50'), false)
  })
})

describe('sanitizeAnchoredVwapDrawingSettings band pairs', () => {
  it('migrates a legacy shared lineColor into both sides and the fill', () => {
    const settings = sanitizeAnchoredVwapDrawingSettings({
      band1: {
        visible: true,
        multiplier: 1.5,
        lineColor: '#123456',
        lineOpacity: 80,
        lineWidth: 2,
        lineStyle: 'dotted',
      },
    })
    assert.equal(settings.band1.upperColor, '#123456')
    assert.equal(settings.band1.lowerColor, '#123456')
    assert.equal(settings.band1.fillColor, '#123456')
    assert.equal(settings.band1.upperVisible, true)
    assert.equal(settings.band1.lowerVisible, true)
    assert.equal(settings.band1.fillOpacity, 0)
    // Legacy shared opacity now styles each side independently.
    assert.equal(settings.band1.upperOpacity, 80)
    assert.equal(settings.band1.lowerOpacity, 80)
    assert.equal(settings.band1.lineWidth, 2)
    assert.equal(settings.band1.lineStyle, 'dotted')
  })

  it('prefers new per-side colors over the legacy lineColor', () => {
    const settings = sanitizeAnchoredVwapDrawingSettings({
      band2: {
        lineColor: '#123456',
        upperColor: '#aaaaaa',
        lowerColor: '#bbbbbb',
        fillColor: '#cccccc',
      },
    })
    assert.equal(settings.band2.upperColor, '#aaaaaa')
    assert.equal(settings.band2.lowerColor, '#bbbbbb')
    assert.equal(settings.band2.fillColor, '#cccccc')
  })

  it('falls back to sanitize defaults for invalid values', () => {
    const settings = sanitizeAnchoredVwapDrawingSettings({
      band3: {
        visible: 'yes',
        multiplier: -1,
        upperVisible: 'no',
        lowerVisible: null,
        upperColor: 'red',
        lowerColor: 42,
        fillColor: '#GGGGGG',
        fillOpacity: 500,
        lineOpacity: 101,
        lineWidth: 9,
        lineStyle: 'dashed',
      },
    })
    assert.equal(settings.band3.visible, false)
    assert.equal(settings.band3.multiplier, 3)
    assert.equal(settings.band3.upperVisible, true)
    assert.equal(settings.band3.lowerVisible, true)
    assert.equal(settings.band3.upperColor, MARKET_STYLE_DEFAULTS.secondaryLine.color)
    assert.equal(settings.band3.lowerColor, MARKET_STYLE_DEFAULTS.secondaryLine.color)
    assert.equal(settings.band3.fillColor, MARKET_STYLE_DEFAULTS.fill.color)
    assert.equal(settings.band3.fillOpacity, 0)
    assert.equal(settings.band3.upperOpacity, MARKET_STYLE_DEFAULTS.secondaryLine.opacityPercent)
    assert.equal(settings.band3.lowerOpacity, MARKET_STYLE_DEFAULTS.secondaryLine.opacityPercent)
    assert.equal(settings.band3.lineWidth, 1)
    // `dashed` is retired: persisted values load as solid.
    assert.equal(settings.band3.lineStyle, 'solid')
  })

  it('migrates legacy dashed line styles to solid on read', () => {
    const settings = sanitizeAnchoredVwapDrawingSettings({
      vwapLine: { lineStyle: 'dashed', lineColor: '#123456', lineWidth: 3 },
      band1: { lineStyle: 'dashed', lineColor: '#123456' },
    })
    assert.equal(settings.vwapLine.lineStyle, 'solid')
    assert.equal(settings.vwapLine.lineColor, '#123456')
    assert.equal(settings.vwapLine.lineWidth, 3)
    assert.equal(settings.band1.lineStyle, 'solid')
    assert.equal(settings.band1.upperColor, '#123456')
  })

  it('gives upper and lower lines independent opacities that win over the legacy shared value', () => {
    const settings = sanitizeAnchoredVwapDrawingSettings({
      band2: { lineOpacity: 10, upperOpacity: 55, lowerOpacity: 90 },
    })
    assert.equal(settings.band2.upperOpacity, 55)
    assert.equal(settings.band2.lowerOpacity, 90)
  })

  it('preserves multiplier zero and valid independent side settings', () => {
    const settings = sanitizeAnchoredVwapDrawingSettings({
      band1: {
        multiplier: 0,
        fillOpacity: 42.5,
        upperVisible: false,
        lowerVisible: false,
        upperColor: '#010203',
        lowerColor: '#040506',
        fillColor: '#070809',
      },
    })
    assert.equal(settings.band1.multiplier, 0)
    assert.equal(settings.band1.fillOpacity, 42.5)
    assert.equal(settings.band1.upperVisible, false)
    assert.equal(settings.band1.lowerVisible, false)
    assert.equal(settings.band1.upperColor, '#010203')
    assert.equal(settings.band1.lowerColor, '#040506')
    assert.equal(settings.band1.fillColor, '#070809')
  })
})

describe('per-instance band styling persistence', () => {
  it('round-trips independent band styling through sanitizeAnchoredVwapInstances', () => {
    const instance = createAnchoredVwapInstance({ anchorTime: 1_700_000_000 })!
    instance.settings.band1.upperVisible = false
    instance.settings.band1.lowerVisible = true
    instance.settings.band1.upperColor = '#010203'
    instance.settings.band1.upperOpacity = 45
    instance.settings.band1.lowerColor = '#040506'
    instance.settings.band1.lowerOpacity = 65
    instance.settings.band1.fillColor = '#070809'
    instance.settings.band1.fillOpacity = 33
    instance.settings.band2.visible = true
    instance.settings.band2.fillOpacity = 12

    const [restored] = sanitizeAnchoredVwapInstances([instance])
    assert.ok(restored)
    assert.equal(restored.settings.band1.upperVisible, false)
    assert.equal(restored.settings.band1.lowerVisible, true)
    assert.equal(restored.settings.band1.upperColor, '#010203')
    assert.equal(restored.settings.band1.upperOpacity, 45)
    assert.equal(restored.settings.band1.lowerColor, '#040506')
    assert.equal(restored.settings.band1.lowerOpacity, 65)
    assert.equal(restored.settings.band1.fillColor, '#070809')
    assert.equal(restored.settings.band1.fillOpacity, 33)
    assert.notEqual(restored.settings.band1.upperOpacity, restored.settings.band1.lowerOpacity)
    assert.equal(restored.settings.band1.lineColor, undefined)
    assert.equal(restored.settings.band2.visible, true)
    assert.equal(restored.settings.band2.fillOpacity, 12)
  })
})
