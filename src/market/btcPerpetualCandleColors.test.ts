import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'

describe('BTC_PERPETUAL_CANDLESTICK_COLORS', () => {
  it('matches reference candle palette', () => {
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.upColor, '#DBDBDB')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.borderUpColor, '#DBDBDB')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.wickUpColor, '#DBDBDB')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.downColor, '#808080')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.borderDownColor, '#808080')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.wickDownColor, '#808080')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.borderVisible, false)
  })
})
