import type { LineData, UTCTimestamp } from 'lightweight-charts'
import {
  MARKET_SEMANTIC_NEGATIVE_COLOR,
  MARKET_SEMANTIC_POSITIVE_COLOR,
} from './marketSemanticColors.ts'
import type { RsiPoint } from './rsi.ts'

/**
 * Threshold-based RSI line colors, using Lightweight Charts' per-point
 * `LineData.color`. Pure helpers only: the series applies them for history and
 * live updates so both paths color a point identically.
 */

/** Fixed threshold colors (same in every theme), like the account markers. */
export const RSI_OVERBOUGHT_LINE_COLOR = MARKET_SEMANTIC_NEGATIVE_COLOR
export const RSI_OVERSOLD_LINE_COLOR = MARKET_SEMANTIC_POSITIVE_COLOR

export type RsiLineThresholds = {
  overbought: number
  oversold: number
}

/**
 * Per-point color override for one RSI value.
 *
 * Returns `undefined` between the thresholds so that point keeps the series'
 * own `color` — that is the RSI line color currently in effect, including any
 * indicator-presentation color/opacity override. Omitting the point color (as
 * opposed to copying the series color) also means a later presentation change
 * keeps applying to between-threshold points without re-sending history.
 */
export function rsiLineColorForValue(
  value: number,
  thresholds: RsiLineThresholds,
): string | undefined {
  if (value >= thresholds.overbought) return RSI_OVERBOUGHT_LINE_COLOR
  if (value <= thresholds.oversold) return RSI_OVERSOLD_LINE_COLOR
  return undefined
}

/** Color a single RSI point for `series.setData` / `series.update`. */
export function toRsiLineDataPoint(
  point: RsiPoint,
  thresholds: RsiLineThresholds,
): LineData<UTCTimestamp> {
  const color = rsiLineColorForValue(point.value, thresholds)
  const dataPoint: LineData<UTCTimestamp> = {
    time: point.time as UTCTimestamp,
    value: point.value,
  }
  if (color) dataPoint.color = color
  return dataPoint
}

/** Color every historical RSI point (never just the last one). */
export function toRsiLineData(
  points: readonly RsiPoint[],
  thresholds: RsiLineThresholds,
): LineData<UTCTimestamp>[] {
  return points.map((point) => toRsiLineDataPoint(point, thresholds))
}
