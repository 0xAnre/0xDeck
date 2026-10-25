import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  RECTANGLE_FILL_OPACITY,
  RECTANGLE_HANDLE_FILL_OPACITY,
  rectangleInstancePickerFillHex,
  readRectangleFillStyle,
  readRectangleHandleFillStyle,
  resolveRectangleInstanceFillStyle,
} from './rectangleColors.ts'
import {
  createRectangleInstance,
  DEFAULT_RECTANGLE_FILL_HEX,
  DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT,
} from './rectangleInstances.ts'
import { MARKET_STYLE_DEFAULTS, MARKET_STYLE_PALETTE } from './marketStylePalette.ts'

describe('rectangleColors', () => {
  it('uses the palette fill role and 85% handle opacity defaults', () => {
    assert.equal(DEFAULT_RECTANGLE_FILL_HEX, MARKET_STYLE_PALETTE.medium)
    assert.equal(DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT, 25)
    assert.equal(RECTANGLE_FILL_OPACITY, 0.25)
    assert.equal(RECTANGLE_HANDLE_FILL_OPACITY, 0.85)
  })

  it('applies fill and handle alpha in resolved styles (no document)', () => {
    assert.equal(readRectangleFillStyle(), 'rgba(163, 163, 163, 0.25)')
    assert.equal(readRectangleHandleFillStyle(), 'rgba(115, 115, 115, 0.85)')
  })

  it('preserves legacy appearance when color and opacity are unset', () => {
    const instance = createRectangleInstance({
      fromTime: 1,
      toTime: 2,
      lowPrice: 1,
      highPrice: 2,
    })!
    assert.equal(resolveRectangleInstanceFillStyle(instance), readRectangleFillStyle())
  })

  it('uses the palette fill color for an unstyled picker value', () => {
    const instance = createRectangleInstance({
      fromTime: 1,
      toTime: 2,
      lowPrice: 1,
      highPrice: 2,
    })!
    assert.equal(rectangleInstancePickerFillHex(instance), DEFAULT_RECTANGLE_FILL_HEX)
    assert.equal(
      rectangleInstancePickerFillHex({ ...instance, fillColor: '#112233' }),
      '#112233',
    )
  })

  it('applies per-instance hex color and opacity for rendering', () => {
    const instance = {
      ...createRectangleInstance({
        fromTime: 1,
        toTime: 2,
        lowPrice: 1,
        highPrice: 2,
      })!,
      fillColor: '#112233',
      fillOpacity: 40,
    }
    assert.equal(resolveRectangleInstanceFillStyle(instance), 'rgba(17, 34, 51, 0.4)')
    // Palette default color with an explicit non-default opacity.
    assert.equal(
      resolveRectangleInstanceFillStyle({ ...instance, fillColor: undefined, fillOpacity: 60 }),
      `rgba(163, 163, 163, 0.6)`,
    )
    assert.equal(MARKET_STYLE_DEFAULTS.fill.opacityPercent, DEFAULT_RECTANGLE_FILL_OPACITY_PERCENT)
  })
})
