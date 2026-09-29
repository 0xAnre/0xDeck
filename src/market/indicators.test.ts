import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { DEFAULT_MARKET_INDICATORS } from './indicators.ts'

describe('DEFAULT_MARKET_INDICATORS', () => {
  it('is empty so new BTC Perp panels open without indicators', () => {
    assert.deepEqual(DEFAULT_MARKET_INDICATORS, [])
  })
})
