import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  LIQUIDATION_LONG_COLOR,
  LIQUIDATION_SHORT_COLOR,
} from './aggregatedLiquidationsColors.ts'
import {
  MARKET_SEMANTIC_NEGATIVE_COLOR,
  MARKET_SEMANTIC_POSITIVE_COLOR,
} from './marketSemanticColors.ts'
import {
  POSITION_MARKER_BUY_COLOR,
  POSITION_MARKER_SELL_COLOR,
} from './positionMarkers.ts'
import {
  RSI_OVERBOUGHT_LINE_COLOR,
  RSI_OVERSOLD_LINE_COLOR,
} from './rsiLineColors.ts'

describe('market semantic colors', () => {
  it('uses one shared pair for every semantic consumer', () => {
    assert.equal(MARKET_SEMANTIC_POSITIVE_COLOR, '#22C55E')
    assert.equal(MARKET_SEMANTIC_NEGATIVE_COLOR, '#EF4444')

    assert.equal(POSITION_MARKER_BUY_COLOR, MARKET_SEMANTIC_POSITIVE_COLOR)
    assert.equal(POSITION_MARKER_SELL_COLOR, MARKET_SEMANTIC_NEGATIVE_COLOR)
    assert.equal(LIQUIDATION_SHORT_COLOR, MARKET_SEMANTIC_POSITIVE_COLOR)
    assert.equal(LIQUIDATION_LONG_COLOR, MARKET_SEMANTIC_NEGATIVE_COLOR)
    assert.equal(RSI_OVERSOLD_LINE_COLOR, MARKET_SEMANTIC_POSITIVE_COLOR)
    assert.equal(RSI_OVERBOUGHT_LINE_COLOR, MARKET_SEMANTIC_NEGATIVE_COLOR)
  })
})
