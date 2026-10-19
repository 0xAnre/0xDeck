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

describe('anchoredVwapDrawingSettings defaults', () => {
  it('defaults both sides visible, fill disabled and band base colors unchanged', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    for (const pair of [settings.band1, settings.band2, settings.band3]) {
      assert.equal(pair.upperVisible, true)
      assert.equal(pair.lowerVisible, true)
      assert.equal(pair.fillOpacity, 0)
    }
    assert.equal(settings.band1.upperColor, '#4caf50')
    assert.equal(settings.band1.lowerColor, '#4caf50')
    assert.equal(settings.band1.fillColor, '#4caf50')
    assert.equal(settings.band2.upperColor, '#ffeb3b')
    assert.equal(settings.band3.upperColor, '#ff5252')
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
    assert.equal(settings.band1.lineOpacity, 80)
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
    assert.equal(settings.band3.upperColor, '#ff5252')
    assert.equal(settings.band3.lowerColor, '#ff5252')
    assert.equal(settings.band3.fillColor, '#ff5252')
    assert.equal(settings.band3.fillOpacity, 0)
    assert.equal(settings.band3.lineOpacity, 100)
    assert.equal(settings.band3.lineWidth, 1)
    assert.equal(settings.band3.lineStyle, 'solid')
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
    instance.settings.band1.lowerColor = '#040506'
    instance.settings.band1.fillColor = '#070809'
    instance.settings.band1.fillOpacity = 33
    instance.settings.band2.visible = true
    instance.settings.band2.fillOpacity = 12

    const [restored] = sanitizeAnchoredVwapInstances([instance])
    assert.ok(restored)
    assert.equal(restored.settings.band1.upperVisible, false)
    assert.equal(restored.settings.band1.lowerVisible, true)
    assert.equal(restored.settings.band1.upperColor, '#010203')
    assert.equal(restored.settings.band1.lowerColor, '#040506')
    assert.equal(restored.settings.band1.fillColor, '#070809')
    assert.equal(restored.settings.band1.fillOpacity, 33)
    assert.equal(restored.settings.band1.lineColor, undefined)
    assert.equal(restored.settings.band2.visible, true)
    assert.equal(restored.settings.band2.fillOpacity, 12)
  })
})
