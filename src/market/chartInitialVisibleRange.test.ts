import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MARKET_CHART_INITIAL_VISIBLE_BARS,
  computeInitialVisibleLogicalRange,
} from './chartInitialVisibleRange.ts'

describe('computeInitialVisibleLogicalRange', () => {
  it('returns null for empty history', () => {
    assert.equal(computeInitialVisibleLogicalRange(0), null)
  })

  it('shows full range when at or below visible bar limit', () => {
    assert.deepEqual(computeInitialVisibleLogicalRange(1), { from: 0, to: 0 })
    assert.deepEqual(computeInitialVisibleLogicalRange(120), { from: 0, to: 119 })
  })

  it('shows the last 120 bars when history is longer', () => {
    const range = computeInitialVisibleLogicalRange(500)
    assert.equal(range?.from, 500 - MARKET_CHART_INITIAL_VISIBLE_BARS)
    assert.equal(range?.to, 499)
  })
})
