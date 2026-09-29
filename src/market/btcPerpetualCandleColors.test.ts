import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'

describe('BTC_PERPETUAL_CANDLESTICK_COLORS', () => {
  it('matches reference candle palette', () => {
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.upColor, '#818DAD')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.wickUpColor, '#818DAD')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.downColor, '#8F6460')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.wickDownColor, '#8F6460')
    assert.equal(BTC_PERPETUAL_CANDLESTICK_COLORS.borderVisible, false)
  })
})
