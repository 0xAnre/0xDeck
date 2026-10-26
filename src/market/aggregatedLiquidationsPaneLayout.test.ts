import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX,
  resolveAggregatedLiquidationsPaneLayout,
} from './aggregatedLiquidationsPaneLayout.ts'

describe('resolveAggregatedLiquidationsPaneLayout', () => {
  it('puts Bottom in the last pane with zero at the bottom and bars growing up', () => {
    assert.deepEqual(resolveAggregatedLiquidationsPaneLayout('bottom', 2), {
      targetPaneIndex: 1,
      invertScale: false,
      scaleMargins: { top: 0.08, bottom: 0 },
    })
    assert.deepEqual(resolveAggregatedLiquidationsPaneLayout('bottom', 3), {
      targetPaneIndex: 2,
      invertScale: false,
      scaleMargins: { top: 0.08, bottom: 0 },
    })
  })

  it('puts Top in pane 0 with an inverted scale and zero at the top', () => {
    assert.deepEqual(resolveAggregatedLiquidationsPaneLayout('top', 2), {
      targetPaneIndex: 0,
      invertScale: true,
      scaleMargins: { top: 0, bottom: 0.08 },
    })
  })

  it('keeps the fixed liquidation pane height', () => {
    assert.equal(AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX, 88)
  })
})
