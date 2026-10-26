import type { LineData, UTCTimestamp } from 'lightweight-charts'
import type {
  OrderBookDepthPoint,
  OrderBookDepthThresholds,
} from './orderBookDepth.ts'

/**
 * Threshold-based Order Book Depth line colors, using Lightweight Charts'
 * per-point `LineData.color`. Pure helpers only: the pane applies them for
 * history and live updates so both paths color a point identically.
 */

/** Fixed semantic colors (same in every theme), matching the RSI thresholds. */
export const ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR = '#22C55E'
export const ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR = '#EF4444'

/**
 * Per-point color override for one imbalance value.
 *
 * Returns `undefined` between the thresholds so that point keeps the series'
 * own `color` — the user-configurable gray line, including any indicator
 * presentation color/opacity override.
 */
export function orderBookDepthLineColorForValue(
  value: number,
  thresholds: OrderBookDepthThresholds,
): string | undefined {
  if (value >= thresholds.positive) return ORDER_BOOK_DEPTH_POSITIVE_LINE_COLOR
  if (value <= thresholds.negative) return ORDER_BOOK_DEPTH_NEGATIVE_LINE_COLOR
  return undefined
}

/** Color a single imbalance point for `series.setData` / `series.update`. */
export function toOrderBookDepthLineDataPoint(
  point: OrderBookDepthPoint,
  thresholds: OrderBookDepthThresholds,
): LineData<UTCTimestamp> {
  const color = orderBookDepthLineColorForValue(point.value, thresholds)
  const dataPoint: LineData<UTCTimestamp> = {
    time: point.time as UTCTimestamp,
    value: point.value,
  }
  if (color) dataPoint.color = color
  return dataPoint
}

/** Color every historical imbalance point (never just the last one). */
export function toOrderBookDepthLineData(
  points: readonly OrderBookDepthPoint[],
  thresholds: OrderBookDepthThresholds,
): LineData<UTCTimestamp>[] {
  return points.map((point) => toOrderBookDepthLineDataPoint(point, thresholds))
}
