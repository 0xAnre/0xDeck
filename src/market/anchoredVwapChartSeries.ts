import type { IChartApi } from 'lightweight-charts'
import type { AnchoredVwapPoint } from './anchoredVwap.ts'
import {
  anchoredVwapPointToLinePoint,
  anchoredVwapPointsToLineData,
} from './anchoredVwapLineData.ts'
import {
  createSessionVwapLineSeries,
  clearSessionVwapLineSeriesData,
  setSessionVwapLineSeriesData,
  setSessionVwapLineSeriesVisible,
  updateSessionVwapLineSeriesLast,
  type SessionVwapChartSeriesAdapter,
  type SessionVwapLineSeriesBundle,
} from './sessionVwapChartSeries.ts'
import {
  VWAP_CHART_SERIES_KEYS,
  VWAP_CHART_SERIES_STYLES,
  type VwapChartSeriesKey,
} from './vwapChartLineStyles.ts'
import type { MarketCandle } from './types.ts'

export { VWAP_CHART_SERIES_KEYS as ANCHORED_VWAP_CHART_SERIES_KEYS }

export type AnchoredVwapLineSeriesBundle = SessionVwapLineSeriesBundle<VwapChartSeriesKey>

const ANCHORED_VWAP_CHART_ADAPTER: SessionVwapChartSeriesAdapter<
  AnchoredVwapPoint,
  VwapChartSeriesKey
> = {
  seriesKeys: VWAP_CHART_SERIES_KEYS,
  seriesStyles: VWAP_CHART_SERIES_STYLES,
  pointsToLineData: anchoredVwapPointsToLineData,
  pointToLinePoint: anchoredVwapPointToLinePoint,
}

export function createAnchoredVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): AnchoredVwapLineSeriesBundle {
  return createSessionVwapLineSeries(chart, visible, ANCHORED_VWAP_CHART_ADAPTER)
}

export function setAnchoredVwapLineSeriesData(
  bundle: AnchoredVwapLineSeriesBundle,
  points: readonly AnchoredVwapPoint[],
): void {
  setSessionVwapLineSeriesData(bundle, points, ANCHORED_VWAP_CHART_ADAPTER)
}

export function clearAnchoredVwapLineSeriesData(bundle: AnchoredVwapLineSeriesBundle): void {
  clearSessionVwapLineSeriesData(bundle)
}

export function setAnchoredVwapLineSeriesVisible(
  bundle: AnchoredVwapLineSeriesBundle,
  visible: boolean,
): void {
  setSessionVwapLineSeriesVisible(bundle, visible)
}

export function updateAnchoredVwapLineSeriesLast(
  bundle: AnchoredVwapLineSeriesBundle,
  point: AnchoredVwapPoint,
  allPoints: readonly AnchoredVwapPoint[],
): void {
  updateSessionVwapLineSeriesLast(bundle, allPoints, point, ANCHORED_VWAP_CHART_ADAPTER)
}

export function applyAnchoredVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: AnchoredVwapLineSeriesBundle,
  compute: (candles: readonly MarketCandle[]) => AnchoredVwapPoint[],
): void {
  const points = compute(candles)
  if (points.length === 0) return
  updateAnchoredVwapLineSeriesLast(bundle, points[points.length - 1], points)
}
