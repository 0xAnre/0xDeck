import type { UTCTimestamp } from 'lightweight-charts'
import type { DailyVwapPoint } from '@/market/dailyVwap'

export type DailyVwapValueKey =
  | 'vwap'
  | 'upper1'
  | 'lower1'
  | 'upper2'
  | 'lower2'
  | 'previousVwap'
  | 'previousUpper1'
  | 'previousLower1'
  | 'previousUpper2'
  | 'previousLower2'

/** Keys rendered as Lightweight Charts line series (excludes ±2σ bands). */
export type DailyVwapChartSeriesKey = Extract<
  DailyVwapValueKey,
  'vwap' | 'upper1' | 'lower1' | 'previousVwap' | 'previousUpper1' | 'previousLower1'
>

export const DAILY_VWAP_CHART_SERIES_KEYS: readonly DailyVwapChartSeriesKey[] = [
  'previousLower1',
  'previousUpper1',
  'previousVwap',
  'lower1',
  'upper1',
  'vwap',
]

export type DailyVwapLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

function toLinePoint(time: number, value: number | null): DailyVwapLinePoint {
  const stamp = time as UTCTimestamp
  if (value === null || !Number.isFinite(value)) {
    return { time: stamp }
  }
  return { time: stamp, value }
}

export function dailyVwapPointsToLineData(
  points: readonly DailyVwapPoint[],
  key: DailyVwapValueKey,
): DailyVwapLinePoint[] {
  return points.map((point) => toLinePoint(point.time, point[key]))
}

export function dailyVwapPointToLinePoint(
  point: DailyVwapPoint,
  key: DailyVwapValueKey,
): DailyVwapLinePoint {
  return toLinePoint(point.time, point[key])
}
