import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  createDefaultAnchoredVwapDrawingSettings,
  sanitizeAnchoredVwapDrawingSettings,
  DEFAULT_ANCHORED_VWAP_DRAWING_BAND_FILL_OPACITY,
} from './anchoredVwapDrawingSettings.ts'

describe('anchoredVwapDrawingSettings band fill', () => {
  it('defaults each band fill to its band line color at subtle opacity', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    for (const band of [settings.band1, settings.band2, settings.band3]) {
      assert.equal(band.fillColor, band.lineColor)
      assert.equal(band.fillOpacity, DEFAULT_ANCHORED_VWAP_DRAWING_BAND_FILL_OPACITY)
      assert.ok(band.fillOpacity > 0 && band.fillOpacity < 100)
    }
  })

  it('keeps existing line and visibility defaults unchanged', () => {
    const settings = createDefaultAnchoredVwapDrawingSettings()
    assert.deepEqual(settings.vwapLine, {
      visible: true,
      lineColor: '#2962FF',
      lineOpacity: 100,
      lineWidth: 2,
      lineStyle: 'solid',
    })
    assert.equal(settings.band1.visible, true)
    assert.equal(settings.band2.visible, false)
    assert.equal(settings.band3.visible, false)
    assert.equal(settings.band1.multiplier, 1)
    assert.equal(settings.band2.multiplier, 2)
    assert.equal(settings.band3.multiplier, 3)
    assert.equal(settings.band1.lineWidth, 1)
    assert.equal(settings.band1.lineStyle, 'solid')
    assert.equal(settings.band1.lineOpacity, 100)
  })

  it('preserves valid fill color and opacity through sanitize', () => {
    const base = createDefaultAnchoredVwapDrawingSettings()
    const sanitized = sanitizeAnchoredVwapDrawingSettings({
      ...base,
      band1: { ...base.band1, fillColor: '#123456', fillOpacity: 42 },
    })
    assert.equal(sanitized.band1.fillColor, '#123456')
    assert.equal(sanitized.band1.fillOpacity, 42)
  })

  it('falls back for invalid fill color and out-of-range opacity', () => {
    const base = createDefaultAnchoredVwapDrawingSettings()
    const sanitized = sanitizeAnchoredVwapDrawingSettings({
      ...base,
      band2: { ...base.band2, fillColor: 'not-a-color', fillOpacity: 250 },
      band3: { ...base.band3, fillColor: 123, fillOpacity: Number.NaN },
    })
    assert.equal(sanitized.band2.fillColor, base.band2.fillColor)
    assert.equal(sanitized.band2.fillOpacity, base.band2.fillOpacity)
    assert.equal(sanitized.band3.fillColor, base.band3.fillColor)
    assert.equal(sanitized.band3.fillOpacity, base.band3.fillOpacity)
  })

  it('falls back to defaults when fill fields are missing', () => {
    const sanitized = sanitizeAnchoredVwapDrawingSettings({
      band1: {
        visible: true,
        multiplier: 1.5,
        lineColor: '#4caf50',
        lineOpacity: 100,
        lineWidth: 1,
        lineStyle: 'solid',
      },
    })
    assert.equal(sanitized.band1.multiplier, 1.5)
    assert.equal(sanitized.band1.fillColor, '#4caf50')
    assert.equal(sanitized.band1.fillOpacity, DEFAULT_ANCHORED_VWAP_DRAWING_BAND_FILL_OPACITY)
  })
})
