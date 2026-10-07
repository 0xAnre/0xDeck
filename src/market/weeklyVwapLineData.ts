import type { UTCTimestamp } from 'lightweight-charts'
import type { WeeklyVwapPoint } from './weeklyVwap.ts'
import {
  VWAP_CHART_LINE_STYLE,
  VWAP_CHART_SERIES_KEYS,
  VWAP_CHART_SERIES_STYLES,
  type VwapChartSeriesKey,
} from './vwapChartLineStyles.ts'

export type WeeklyVwapValueKey =
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

export type WeeklyVwapChartSeriesKey = VwapChartSeriesKey

export const WEEKLY_VWAP_CHART_SERIES_KEYS: readonly WeeklyVwapChartSeriesKey[] =
  VWAP_CHART_SERIES_KEYS

export type WeeklyVwapChartLineStyle = {
  color: string
  lineWidth: 1
}

export const WEEKLY_VWAP_CHART_LINE_STYLE: WeeklyVwapChartLineStyle = VWAP_CHART_LINE_STYLE

export const WEEKLY_VWAP_CHART_SERIES_STYLES: Record<
  WeeklyVwapChartSeriesKey,
  WeeklyVwapChartLineStyle
> = VWAP_CHART_SERIES_STYLES

export type WeeklyVwapLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

function toLinePoint(time: number, value: number | null): WeeklyVwapLinePoint {
  const stamp = time as UTCTimestamp
  if (value === null || !Number.isFinite(value)) {
    return { time: stamp }
  }
  return { time: stamp, value }
}

export function weeklyVwapPointsToLineData(
  points: readonly WeeklyVwapPoint[],
  key: WeeklyVwapValueKey,
): WeeklyVwapLinePoint[] {
  return points.map((point) => toLinePoint(point.time, point[key]))
}

export function weeklyVwapPointToLinePoint(
  point: WeeklyVwapPoint,
  key: WeeklyVwapValueKey,
): WeeklyVwapLinePoint {
  return toLinePoint(point.time, point[key])
}
