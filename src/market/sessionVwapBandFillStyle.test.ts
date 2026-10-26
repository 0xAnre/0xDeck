import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { MARKET_STYLE_DEFAULTS } from './marketStylePalette.ts'
import { readRectangleFillStyle } from './rectangleColors.ts'
import {
  resolveSessionVwapBandFillStyle,
  sessionVwapBandFillColorInputValue,
  sessionVwapBandFillOpacityInputValue,
} from './sessionVwapBandFillStyle.ts'

describe('resolveSessionVwapBandFillStyle', () => {
  it('keeps the existing palette fill default for an empty presentation', () => {
    assert.equal(resolveSessionVwapBandFillStyle({}), readRectangleFillStyle())
    assert.equal(resolveSessionVwapBandFillStyle({}), 'rgba(163, 163, 163, 0.25)')
  })

  it('resolves a custom fill color and opacity independently from line fields', () => {
    assert.equal(
      resolveSessionVwapBandFillStyle({
        color: '#000000',
        opacity: 100,
        fillColor: '#123456',
        fillOpacity: 60,
      }),
      'rgba(18, 52, 86, 0.6)',
    )
  })

  it('falls back per missing fill field to the palette default', () => {
    assert.equal(
      resolveSessionVwapBandFillStyle({ fillColor: '#123456' }),
      'rgba(18, 52, 86, 0.25)',
    )
    assert.equal(
      resolveSessionVwapBandFillStyle({ fillOpacity: 60 }),
      `rgba(163, 163, 163, 0.6)`,
    )
    assert.equal(
      resolveSessionVwapBandFillStyle({ fillOpacity: 0 }),
      'rgba(163, 163, 163, 0)',
    )
  })

  it('renders no visible fill at 0% opacity', () => {
    const fillStyle = resolveSessionVwapBandFillStyle({
      fillColor: '#123456',
      fillOpacity: 0,
    })
    assert.equal(fillStyle, 'rgba(18, 52, 86, 0)')
    assert.match(fillStyle, /,\s*0\)$/)
  })

  it('ignores invalid runtime fill values and keeps the default', () => {
    assert.equal(
      resolveSessionVwapBandFillStyle({
        fillColor: 'not-a-hex' as never,
        fillOpacity: 250,
      }),
      readRectangleFillStyle(),
    )
  })
})

describe('session VWAP band fill dialog input values', () => {
  it('resolves palette defaults for a presentation without fill fields', () => {
    assert.equal(
      sessionVwapBandFillColorInputValue(undefined),
      MARKET_STYLE_DEFAULTS.fill.color,
    )
    assert.equal(
      sessionVwapBandFillOpacityInputValue(undefined),
      MARKET_STYLE_DEFAULTS.fill.opacityPercent,
    )
  })

  it('reads stored fill values, including 0% opacity', () => {
    assert.equal(sessionVwapBandFillColorInputValue('#123456'), '#123456')
    assert.equal(sessionVwapBandFillOpacityInputValue(0), 0)
    assert.equal(sessionVwapBandFillOpacityInputValue(100), 100)
  })

  it('falls back for invalid stored fill values', () => {
    assert.equal(
      sessionVwapBandFillColorInputValue('rgba(1, 2, 3, 0.5)'),
      MARKET_STYLE_DEFAULTS.fill.color,
    )
    assert.equal(
      sessionVwapBandFillOpacityInputValue(250),
      MARKET_STYLE_DEFAULTS.fill.opacityPercent,
    )
  })
})
