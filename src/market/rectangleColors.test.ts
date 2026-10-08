import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveThemeCssColor } from '../lib/resolveCssColor.ts'
import {
  RECTANGLE_FILL_OPACITY,
  RECTANGLE_HANDLE_FILL_OPACITY,
  rectangleInstancePickerFillHex,
  readRectangleFillStyle,
  readRectangleHandleFillStyle,
  resolveRectangleInstanceFillStyle,
} from './rectangleColors.ts'
import { createRectangleInstance, DEFAULT_RECTANGLE_FILL_HEX } from './rectangleInstances.ts'

describe('rectangleColors', () => {
  it('uses 20% fill opacity and 85% handle opacity constants', () => {
    assert.equal(RECTANGLE_FILL_OPACITY, 0.2)
    assert.equal(RECTANGLE_HANDLE_FILL_OPACITY, 0.85)
  })

  it('applies fill and handle alpha in resolved styles (no document)', () => {
    assert.equal(readRectangleFillStyle(), 'rgba(115, 115, 115, 0.2)')
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

  it('uses the resolved theme color for an unstyled picker value', () => {
    const instance = createRectangleInstance({
      fromTime: 1,
      toTime: 2,
      lowPrice: 1,
      highPrice: 2,
    })!
    const themeTokens = [
      'oklch(0.709 0.01 56.259)',
      'oklch(0.711 0.019 323.02)',
      'oklch(0.714 0.014 41.2)',
      'oklch(0.737 0.021 106.9)',
    ]
    for (const token of themeTokens) {
      const rgb = resolveThemeCssColor(token, 'rgb(115, 115, 115)')
      const hex = rectangleInstancePickerFillHex(instance, rgb)
      assert.match(hex, /^#[0-9a-f]{6}$/)
      assert.notEqual(hex, DEFAULT_RECTANGLE_FILL_HEX)
    }
    assert.equal(
      rectangleInstancePickerFillHex(instance, 'rgb(115, 115, 115)'),
      DEFAULT_RECTANGLE_FILL_HEX,
    )
    assert.equal(
      rectangleInstancePickerFillHex({ ...instance, fillColor: '#112233' }, 'rgb(1, 2, 3)'),
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
  })
})
