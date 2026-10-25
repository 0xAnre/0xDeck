import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  FRVP_LEVEL_DEFAULT_OPACITY_PERCENT,
  FRVP_POC_DEFAULT_HEX,
  FRVP_VAH_VAL_DEFAULT_HEX,
  readFrvpPocLineColorInputHex,
  readFrvpPocLineStrokeStyle,
  readFrvpVahValLineStrokeStyle,
} from './frvpLevelLineColors.ts'
import { MARKET_STYLE_PALETTE, marketStyleColorWithOpacity } from './marketStylePalette.ts'

describe('frvpLevelLineColors', () => {
  it('uses the POC accent red and the palette medium grey for VAH/VAL', () => {
    assert.equal(FRVP_POC_DEFAULT_HEX, MARKET_STYLE_PALETTE.pocRed)
    assert.equal(FRVP_POC_DEFAULT_HEX, '#D15F5B')
    assert.equal(FRVP_VAH_VAL_DEFAULT_HEX, MARKET_STYLE_PALETTE.medium)
    assert.equal(FRVP_LEVEL_DEFAULT_OPACITY_PERCENT, 50)
  })

  it('folds the 50% level opacity into the POC stroke style', () => {
    assert.equal(
      readFrvpPocLineStrokeStyle(),
      marketStyleColorWithOpacity(FRVP_POC_DEFAULT_HEX, FRVP_LEVEL_DEFAULT_OPACITY_PERCENT),
    )
    assert.equal(readFrvpPocLineStrokeStyle(), 'rgba(209, 95, 91, 0.5)')
  })

  it('folds the 50% level opacity into the VAH/VAL stroke style', () => {
    assert.equal(
      readFrvpVahValLineStrokeStyle(),
      marketStyleColorWithOpacity(FRVP_VAH_VAL_DEFAULT_HEX, FRVP_LEVEL_DEFAULT_OPACITY_PERCENT),
    )
    assert.equal(readFrvpVahValLineStrokeStyle(), 'rgba(163, 163, 163, 0.5)')
  })

  it('matches the POC stroke color input hex to the palette accent', () => {
    assert.equal(readFrvpPocLineColorInputHex(), MARKET_STYLE_PALETTE.pocRed)
  })
})
