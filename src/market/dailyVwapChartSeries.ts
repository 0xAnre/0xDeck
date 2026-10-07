import type { IChartApi } from 'lightweight-charts'
import { computeDailyVwap, type DailyVwapPoint } from '@/market/dailyVwap'
import {
  DAILY_VWAP_CHART_SERIES_KEYS,
  DAILY_VWAP_CHART_SERIES_STYLES,
  dailyVwapPointToLinePoint,
  dailyVwapPointsToLineData,
  type DailyVwapChartSeriesKey,
} from '@/market/dailyVwapLineData'
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

export { DAILY_VWAP_CHART_SERIES_KEYS }

export type DailyVwapLineSeriesBundle = SessionVwapLineSeriesBundle<DailyVwapChartSeriesKey>

const DAILY_VWAP_CHART_ADAPTER: SessionVwapChartSeriesAdapter<
  DailyVwapPoint,
  DailyVwapChartSeriesKey
> = {
  seriesKeys: DAILY_VWAP_CHART_SERIES_KEYS,
  seriesStyles: DAILY_VWAP_CHART_SERIES_STYLES,
  pointsToLineData: (points, key) => dailyVwapPointsToLineData(points, key),
  pointToLinePoint: (point, key) => dailyVwapPointToLinePoint(point, key),
}

export function createDailyVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): DailyVwapLineSeriesBundle {
  return createSessionVwapLineSeries(chart, visible, DAILY_VWAP_CHART_ADAPTER)
}

export function setDailyVwapLineSeriesData(
  bundle: DailyVwapLineSeriesBundle,
  points: readonly DailyVwapPoint[],
): void {
  setSessionVwapLineSeriesData(bundle, points, DAILY_VWAP_CHART_ADAPTER)
}

export function clearDailyVwapLineSeriesData(bundle: DailyVwapLineSeriesBundle): void {
  clearSessionVwapLineSeriesData(bundle)
}

export function setDailyVwapLineSeriesVisible(
  bundle: DailyVwapLineSeriesBundle,
  visible: boolean,
): void {
  setSessionVwapLineSeriesVisible(bundle, visible)
}

export function updateDailyVwapLineSeriesLast(
  bundle: DailyVwapLineSeriesBundle,
  point: DailyVwapPoint,
  allPoints: readonly DailyVwapPoint[],
): void {
  updateSessionVwapLineSeriesLast(bundle, allPoints, point, DAILY_VWAP_CHART_ADAPTER)
}

/** Recompute daily VWAP from candles and patch only the latest point on each line series. */
export function applyDailyVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: DailyVwapLineSeriesBundle,
): void {
  const points = computeDailyVwap(candles)
  if (points.length === 0) return
  updateDailyVwapLineSeriesLast(bundle, points[points.length - 1], points)
}
