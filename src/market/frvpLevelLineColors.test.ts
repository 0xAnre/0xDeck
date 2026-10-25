import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FRVP_LEVEL_DEFAULT_HEX,
  FRVP_LEVEL_DEFAULT_OPACITY_PERCENT,
  readFrvpPocLineColorInputHex,
  readFrvpPocLineStrokeStyle,
} from './frvpLevelLineColors.ts'
import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_PALETTE,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'

describe('frvpLevelLineColors', () => {
  it('uses the shared palette secondary line for FRVP levels', () => {
    assert.equal(FRVP_LEVEL_DEFAULT_HEX, MARKET_STYLE_DEFAULTS.secondaryLine.color)
    assert.equal(FRVP_LEVEL_DEFAULT_HEX, MARKET_STYLE_PALETTE.medium)
    assert.equal(FRVP_LEVEL_DEFAULT_OPACITY_PERCENT, 70)
  })

  it('folds the level opacity into the POC stroke style', () => {
    assert.equal(
      readFrvpPocLineStrokeStyle(),
      marketStyleColorWithOpacity(FRVP_LEVEL_DEFAULT_HEX, FRVP_LEVEL_DEFAULT_OPACITY_PERCENT),
    )
    assert.equal(readFrvpPocLineStrokeStyle(), 'rgba(163, 163, 163, 0.7)')
  })

  it('matches the stroke color input hex to the palette default', () => {
    assert.equal(readFrvpPocLineColorInputHex(), MARKET_STYLE_PALETTE.medium)
  })
})
