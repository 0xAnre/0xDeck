import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LINE_DEFAULT_STROKE_COLOR,
  LINE_DEFAULT_STROKE_OPACITY_PERCENT,
  readLineStrokeColorHexForInstance,
  readLineStrokeStyle,
  readLineStrokeStyleForInstance,
} from './lineColors.ts'
import { MARKET_STYLE_DEFAULTS, MARKET_STYLE_PALETTE } from './marketStylePalette.ts'

describe('line tool palette defaults', () => {
  it('uses the palette primary line at 100% opacity', () => {
    assert.equal(LINE_DEFAULT_STROKE_COLOR, MARKET_STYLE_PALETTE.light)
    assert.equal(LINE_DEFAULT_STROKE_COLOR, MARKET_STYLE_DEFAULTS.primaryLine.color)
    assert.equal(LINE_DEFAULT_STROKE_OPACITY_PERCENT, 100)
    assert.equal(readLineStrokeStyle(), MARKET_STYLE_PALETTE.light)
  })

  it('resolves the picker hex for legacy instances without a color', () => {
    assert.equal(readLineStrokeColorHexForInstance({}), MARKET_STYLE_PALETTE.light)
    assert.equal(
      readLineStrokeColorHexForInstance({ strokeColor: '#112233' }),
      '#112233',
    )
  })

  it('folds the instance opacity into its own stroke color', () => {
    assert.equal(readLineStrokeStyleForInstance({}), MARKET_STYLE_PALETTE.light)
    assert.equal(
      readLineStrokeStyleForInstance({ strokeColor: '#112233', strokeOpacity: 40 }),
      'rgba(17, 34, 51, 0.4)',
    )
    // Custom color with no saved opacity keeps full opacity.
    assert.equal(readLineStrokeStyleForInstance({ strokeColor: '#112233' }), '#112233')
  })

  it('applies a custom opacity to the palette default color', () => {
    assert.equal(
      readLineStrokeStyleForInstance({ strokeOpacity: 70 }),
      'rgba(212, 212, 212, 0.7)',
    )
  })
})
