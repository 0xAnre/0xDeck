import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMarketChartSelectionChange } from './marketChartSelection.ts'

describe('isMarketChartSelectionChange', () => {
  const current = { exchange: 'binance' as const, interval: '1m' as const }

  it('reports no change when the picked interval is already active', () => {
    // Re-selecting the active interval must not mark the chart as not-ready: the
    // load effect is keyed on [exchange, interval] and would not run again, so
    // chartReady would stay false and the liquidation pane would stay disposed.
    assert.equal(isMarketChartSelectionChange(current, { interval: '1m' }), false)
  })

  it('reports no change when the picked exchange is already active', () => {
    assert.equal(isMarketChartSelectionChange(current, { exchange: 'binance' }), false)
  })

  it('reports no change for an empty selection patch', () => {
    assert.equal(isMarketChartSelectionChange(current, {}), false)
  })

  it('reports a change for a different interval', () => {
    assert.equal(isMarketChartSelectionChange(current, { interval: '15m' }), true)
  })

  it('reports a change for a different exchange', () => {
    assert.equal(isMarketChartSelectionChange(current, { exchange: 'hyperliquid' }), true)
  })

  it('reports a change when only one of two patched fields differs', () => {
    const currentMixed = { exchange: 'hyperliquid' as const, interval: '1h' as const }
    assert.equal(
      isMarketChartSelectionChange(currentMixed, {
        exchange: 'hyperliquid',
        interval: '1h',
      }),
      false,
    )
    assert.equal(
      isMarketChartSelectionChange(currentMixed, {
        exchange: 'binance',
        interval: '1h',
      }),
      true,
    )
  })
})
