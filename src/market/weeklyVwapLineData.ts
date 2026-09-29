import type { UTCTimestamp } from 'lightweight-charts'
import type { WeeklyVwapPoint } from '@/market/weeklyVwap'

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

export type WeeklyVwapChartSeriesKey = Extract<
  WeeklyVwapValueKey,
  'vwap' | 'upper1' | 'lower1' | 'previousVwap' | 'previousUpper1' | 'previousLower1'
>

export const WEEKLY_VWAP_CHART_SERIES_KEYS: readonly WeeklyVwapChartSeriesKey[] = [
  'previousLower1',
  'previousUpper1',
  'previousVwap',
  'lower1',
  'upper1',
  'vwap',
]

export type WeeklyVwapChartLineStyle = {
  color: string
  lineWidth: 1
}

export const WEEKLY_VWAP_CHART_LINE_STYLE: WeeklyVwapChartLineStyle = {
  color: '#9e9e9e',
  lineWidth: 1,
}

export const WEEKLY_VWAP_PREVIOUS_VWAP_LINE_STYLE: WeeklyVwapChartLineStyle = {
  color: 'rgba(158, 158, 158, 0.5)',
  lineWidth: 1,
}

export const WEEKLY_VWAP_CHART_SERIES_STYLES: Record<
  WeeklyVwapChartSeriesKey,
  WeeklyVwapChartLineStyle
> = {
  previousLower1: WEEKLY_VWAP_CHART_LINE_STYLE,
  previousUpper1: WEEKLY_VWAP_CHART_LINE_STYLE,
  previousVwap: WEEKLY_VWAP_PREVIOUS_VWAP_LINE_STYLE,
  lower1: WEEKLY_VWAP_CHART_LINE_STYLE,
  upper1: WEEKLY_VWAP_CHART_LINE_STYLE,
  vwap: WEEKLY_VWAP_CHART_LINE_STYLE,
}

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
  key: WeeklyVwapChartSeriesKey,
): WeeklyVwapLinePoint[] {
  return points.map((point) => toLinePoint(point.time, point[key]))
}

export function weeklyVwapPointToLinePoint(
  point: WeeklyVwapPoint,
  key: WeeklyVwapChartSeriesKey,
): WeeklyVwapLinePoint {
  return toLinePoint(point.time, point[key])
}
