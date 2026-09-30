import { LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import { isIndicatorSupportedOnInterval, type MarketIndicatorId } from './indicators.ts'
import {
  computeRollingVwapForInterval,
  type RollingVwapPoint,
} from './rollingVwap.ts'
import type { CandleInterval, MarketCandle } from './types.ts'

/** Pine `color.orange` for Rolling VWAP line. */
export const ROLLING_VWAP_LINE_COLOR = '#FF9800'

export const ROLLING_VWAP_LINE_CHART_OPTIONS = {
  color: ROLLING_VWAP_LINE_COLOR,
  lineWidth: 1 as const,
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
  pointMarkersVisible: false,
}

export type RollingVwapLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

export type RollingVwapLineSeries = ISeriesApi<'Line'>

export function rollingVwapPointToLinePoint(point: RollingVwapPoint): RollingVwapLinePoint {
  const time = point.time as UTCTimestamp
  const value = point.vwap
  if (value === null || !Number.isFinite(value)) {
    return { time }
  }
  return { time, value }
}

export function rollingVwapPointsToLineData(
  points: readonly RollingVwapPoint[],
): RollingVwapLinePoint[] {
  return points.map(rollingVwapPointToLinePoint)
}

export function createRollingVwapLineSeries(chart: IChartApi): RollingVwapLineSeries {
  return chart.addSeries(LineSeries, {
    ...ROLLING_VWAP_LINE_CHART_OPTIONS,
    visible: false,
  })
}

export function setRollingVwapLineSeriesData(
  series: RollingVwapLineSeries,
  points: readonly RollingVwapPoint[],
): void {
  series.setData(rollingVwapPointsToLineData(points))
}

export function clearRollingVwapLineSeriesData(series: RollingVwapLineSeries): void {
  series.setData([])
}

export function setRollingVwapLineSeriesVisible(series: RollingVwapLineSeries, visible: boolean): void {
  series.applyOptions({ visible })
}

export function updateRollingVwapLineSeriesLast(
  series: RollingVwapLineSeries,
  point: RollingVwapPoint,
): void {
  series.update(rollingVwapPointToLinePoint(point))
}

/** Recompute rolling VWAP from candles (auto window) and patch only the latest line point. */
export function applyRollingVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  series: RollingVwapLineSeries,
): void {
  if (candles.length === 0) return
  const interval = candles[candles.length - 1].interval
  const points = computeRollingVwapForInterval(candles, interval)
  if (points.length === 0) return
  updateRollingVwapLineSeriesLast(series, points[points.length - 1])
}

export function shouldShowRollingVwapLineSeries(
  activeIndicators: readonly MarketIndicatorId[],
  interval: CandleInterval,
): boolean {
  if (!activeIndicators.includes('rolling-vwap')) return false
  return isIndicatorSupportedOnInterval('rolling-vwap', interval)
}
