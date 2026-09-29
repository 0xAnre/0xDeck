import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_MARKET_INDICATORS, isMarketIndicatorId } from './indicators.ts'

describe('DEFAULT_MARKET_INDICATORS', () => {
  it('is empty so new BTC Perp panels open without indicators', () => {
    assert.deepEqual(DEFAULT_MARKET_INDICATORS, [])
  })
})

describe('weekly-vwap indicator id', () => {
  it('is accepted by the market indicator sanitizer', () => {
    assert.equal(isMarketIndicatorId('weekly-vwap'), true)
  })
})
