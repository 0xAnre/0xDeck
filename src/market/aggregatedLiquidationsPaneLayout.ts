import type { AggregatedLiquidationBucket } from './aggregatedLiquidations.ts'
import type { AggregatedLiquidationsPosition } from './aggregatedLiquidationsSettings.ts'

export const AGGREGATED_LIQUIDATIONS_PANE_HEIGHT_PX = 88
const PANE_SCALE_MARGIN = 0.08

export type AggregatedLiquidationsPaneLayout = {
  /** Pane index the liquidation pane must occupy for this position. */
  targetPaneIndex: number
  invertScale: boolean
  scaleMargins: { top: number; bottom: number }
}

/**
 * Bottom keeps the liquidation pane as the last pane so its zero baseline sits
 * at the pane bottom and bars grow upward. Top moves it to index 0 (which
 * shifts the candle pane to index 1), inverts the scale, and pins the zero
 * baseline to the pane top so bars grow downward.
 */
export function resolveAggregatedLiquidationsPaneLayout(
  position: AggregatedLiquidationsPosition,
  paneCount: number,
): AggregatedLiquidationsPaneLayout {
  const lastPaneIndex = Math.max(0, paneCount - 1)
  if (position === 'top') {
    return {
      targetPaneIndex: 0,
      invertScale: true,
      scaleMargins: { top: 0, bottom: PANE_SCALE_MARGIN },
    }
  }
  return {
    targetPaneIndex: lastPaneIndex,
    invertScale: false,
    scaleMargins: { top: PANE_SCALE_MARGIN, bottom: 0 },
  }
}

/**
 * Largest notional the pane renders, matching the value the native histogram
 * series carries for each bucket. `0` when there is nothing to draw.
 */
export function aggregatedLiquidationsPeakNotional(
  buckets: readonly AggregatedLiquidationBucket[],
): number {
  let peak = 0
  for (const bucket of buckets) {
    const value = Math.max(bucket.long, bucket.short)
    if (Number.isFinite(value) && value > peak) peak = value
  }
  return peak
}

/**
 * True when a manually scaled pane cannot show a single liquidation bar.
 *
 * Bars span `[0, peak]` up from the pane baseline, so a manual price range that
 * lies entirely above the peak (or entirely at/below zero) renders an empty
 * pane. That is the one reachable "enabled indicator looks absent" state:
 * Lightweight Charts keeps a manual price range — this chart enables
 * `handleScale.axisPressedMouseMove.price`, so a drag on the 88px axis under
 * the candles is enough — until the user happens to double-click that axis
 * (`axisDoubleClickReset.price`), which is the workaround this guard removes.
 */
export function manualAggregatedLiquidationsRangeHidesBars(
  priceRange: { from: number; to: number } | null,
  peakNotional: number,
): boolean {
  if (priceRange === null) return false
  if (!Number.isFinite(peakNotional) || peakNotional <= 0) return false

  const low = Math.min(priceRange.from, priceRange.to)
  const high = Math.max(priceRange.from, priceRange.to)
  if (!Number.isFinite(low) || !Number.isFinite(high)) return false

  return high <= 0 || low >= peakNotional
}
