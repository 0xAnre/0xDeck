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
