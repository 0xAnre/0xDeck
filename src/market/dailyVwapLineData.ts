import type { UTCTimestamp } from 'lightweight-charts'
import type { DailyVwapPoint } from './dailyVwap.ts'
import {
  VWAP_CHART_LINE_STYLE,
  VWAP_CHART_SERIES_KEYS,
  VWAP_CHART_SERIES_STYLES,
  type VwapChartSeriesKey,
} from './vwapChartLineStyles.ts'

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

export type DailyVwapChartSeriesKey = VwapChartSeriesKey

export const DAILY_VWAP_CHART_SERIES_KEYS: readonly DailyVwapChartSeriesKey[] = VWAP_CHART_SERIES_KEYS

export type DailyVwapChartLineStyle = {
  color: string
  lineWidth: 1
}

export const DAILY_VWAP_CHART_LINE_STYLE: DailyVwapChartLineStyle = VWAP_CHART_LINE_STYLE

export const DAILY_VWAP_CHART_SERIES_STYLES: Record<
  DailyVwapChartSeriesKey,
  DailyVwapChartLineStyle
> = VWAP_CHART_SERIES_STYLES

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
