import type { UTCTimestamp } from 'lightweight-charts'
import type { AnchoredVwapPoint } from './anchoredVwap.ts'
import type { VwapChartSeriesKey } from './vwapChartLineStyles.ts'

export type AnchoredVwapLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

function toLinePoint(time: number, value: number | null): AnchoredVwapLinePoint {
  const stamp = time as UTCTimestamp
  if (value === null || !Number.isFinite(value)) {
    return { time: stamp }
  }
  return { time: stamp, value }
}

export function anchoredVwapPointsToLineData(
  points: readonly AnchoredVwapPoint[],
  key: VwapChartSeriesKey,
): AnchoredVwapLinePoint[] {
  return points.map((point) => toLinePoint(point.time, point[key]))
}

export function anchoredVwapPointToLinePoint(
  point: AnchoredVwapPoint,
  key: VwapChartSeriesKey,
): AnchoredVwapLinePoint {
  return toLinePoint(point.time, point[key])
}
