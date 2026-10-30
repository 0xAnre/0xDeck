import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX,
  aggregatedLiquidationsPeakNotional,
  manualAggregatedLiquidationsRangeHidesBars,
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

describe('aggregatedLiquidationsPeakNotional', () => {
  it('is the largest long/short notional the pane renders', () => {
    assert.equal(
      aggregatedLiquidationsPeakNotional([
        { time: 60, long: 1_200, short: 400 },
        { time: 120, long: 300, short: 9_500 },
      ]),
      9_500,
    )
  })

  it('is zero without buckets and ignores non-finite values', () => {
    assert.equal(aggregatedLiquidationsPeakNotional([]), 0)
    assert.equal(
      aggregatedLiquidationsPeakNotional([
        { time: 60, long: Number.NaN, short: 0 },
        { time: 120, long: 250, short: 0 },
      ]),
      250,
    )
  })
})

describe('manualAggregatedLiquidationsRangeHidesBars', () => {
  it('detects a manual range above every bar', () => {
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: 1_000_000, to: 2_000_000 }, 9_500),
      true,
    )
    // Touching the peak exactly still renders nothing: the tallest bar would
    // have zero height at the pane edge.
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: 9_500, to: 20_000 }, 9_500),
      true,
    )
  })

  it('detects a manual range at or below the zero baseline', () => {
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: -5_000, to: 0 }, 9_500),
      true,
    )
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: -5_000, to: -1 }, 9_500),
      true,
    )
  })

  it('keeps a manual range that still intersects the bars', () => {
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: 0, to: 20_000 }, 9_500),
      false,
    )
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: 4_000, to: 12_000 }, 9_500),
      false,
    )
    // Inverted manual ranges are still just ranges.
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: 20_000, to: 0 }, 9_500),
      false,
    )
  })

  it('ignores a missing range, an empty pane and non-finite values', () => {
    assert.equal(manualAggregatedLiquidationsRangeHidesBars(null, 9_500), false)
    assert.equal(manualAggregatedLiquidationsRangeHidesBars({ from: 1, to: 2 }, 0), false)
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars({ from: 1, to: 2 }, Number.NaN),
      false,
    )
    assert.equal(
      manualAggregatedLiquidationsRangeHidesBars(
        { from: Number.NaN, to: 2 },
        9_500,
      ),
      false,
    )
  })
})
