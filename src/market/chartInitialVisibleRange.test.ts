import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MARKET_CHART_INITIAL_VISIBLE_BARS,
  MARKET_CHART_MIN_INITIAL_HISTORY_BARS,
  computeInitialVisibleLogicalRange,
} from './chartInitialVisibleRange.ts'

describe('market chart history constants', () => {
  it('uses 500 visible bars and 750 minimum initial history', () => {
    assert.equal(MARKET_CHART_INITIAL_VISIBLE_BARS, 500)
    assert.equal(MARKET_CHART_MIN_INITIAL_HISTORY_BARS, 750)
  })
})

describe('computeInitialVisibleLogicalRange', () => {
  it('returns null for empty history', () => {
    assert.equal(computeInitialVisibleLogicalRange(0), null)
  })

  it('shows full range when at or below visible bar limit', () => {
    assert.deepEqual(computeInitialVisibleLogicalRange(1), { from: 0, to: 0 })
    assert.deepEqual(computeInitialVisibleLogicalRange(500), { from: 0, to: 499 })
  })

  it('shows the last 500 bars when history is longer', () => {
    const range = computeInitialVisibleLogicalRange(1000)
    assert.equal(range?.from, 1000 - MARKET_CHART_INITIAL_VISIBLE_BARS)
    assert.equal(range?.to, 999)
  })
})
