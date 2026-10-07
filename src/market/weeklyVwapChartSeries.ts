import type { IChartApi } from 'lightweight-charts'
import { computeWeeklyVwap, type WeeklyVwapPoint } from '@/market/weeklyVwap'
import {
  WEEKLY_VWAP_CHART_SERIES_KEYS,
  WEEKLY_VWAP_CHART_SERIES_STYLES,
  weeklyVwapPointToLinePoint,
  weeklyVwapPointsToLineData,
  type WeeklyVwapChartSeriesKey,
} from '@/market/weeklyVwapLineData'
import {
  createSessionVwapLineSeries,
  clearSessionVwapLineSeriesData,
  setSessionVwapLineSeriesData,
  setSessionVwapLineSeriesVisible,
  updateSessionVwapLineSeriesLast,
  type SessionVwapChartSeriesAdapter,
  type SessionVwapLineSeriesBundle,
} from '@/market/sessionVwapChartSeries'
import type { MarketCandle } from '@/market/types'

export { WEEKLY_VWAP_CHART_SERIES_KEYS }

export type WeeklyVwapLineSeriesBundle = SessionVwapLineSeriesBundle<WeeklyVwapChartSeriesKey>

const WEEKLY_VWAP_CHART_ADAPTER: SessionVwapChartSeriesAdapter<
  WeeklyVwapPoint,
  WeeklyVwapChartSeriesKey
> = {
  seriesKeys: WEEKLY_VWAP_CHART_SERIES_KEYS,
  seriesStyles: WEEKLY_VWAP_CHART_SERIES_STYLES,
  pointsToLineData: (points, key) => weeklyVwapPointsToLineData(points, key),
  pointToLinePoint: (point, key) => weeklyVwapPointToLinePoint(point, key),
}

export function createWeeklyVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): WeeklyVwapLineSeriesBundle {
  return createSessionVwapLineSeries(chart, visible, WEEKLY_VWAP_CHART_ADAPTER)
}

export function setWeeklyVwapLineSeriesData(
  bundle: WeeklyVwapLineSeriesBundle,
  points: readonly WeeklyVwapPoint[],
): void {
  setSessionVwapLineSeriesData(bundle, points, WEEKLY_VWAP_CHART_ADAPTER)
}

export function clearWeeklyVwapLineSeriesData(bundle: WeeklyVwapLineSeriesBundle): void {
  clearSessionVwapLineSeriesData(bundle)
}

export function setWeeklyVwapLineSeriesVisible(
  bundle: WeeklyVwapLineSeriesBundle,
  visible: boolean,
): void {
  setSessionVwapLineSeriesVisible(bundle, visible)
}

export function updateWeeklyVwapLineSeriesLast(
  bundle: WeeklyVwapLineSeriesBundle,
  point: WeeklyVwapPoint,
  allPoints: readonly WeeklyVwapPoint[],
): void {
  updateSessionVwapLineSeriesLast(bundle, allPoints, point, WEEKLY_VWAP_CHART_ADAPTER)
}

export function applyWeeklyVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: WeeklyVwapLineSeriesBundle,
): void {
  const points = computeWeeklyVwap(candles)
  if (points.length === 0) return
  updateWeeklyVwapLineSeriesLast(bundle, points[points.length - 1], points)
}
