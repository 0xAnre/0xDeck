import { LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { computeDailyVwap, type DailyVwapPoint } from '@/market/dailyVwap'
import {
  dailyVwapPointToLinePoint,
  dailyVwapPointsToLineData,
  type DailyVwapValueKey,
} from '@/market/dailyVwapLineData'
import type { MarketCandle } from '@/market/types'

type DailyVwapSeriesSpec = {
  key: DailyVwapValueKey
  color: string
  lineWidth: 1 | 2
}

const DAILY_VWAP_SERIES_SPECS: DailyVwapSeriesSpec[] = [
  { key: 'previousLower2', color: '#1e88e566', lineWidth: 1 },
  { key: 'previousLower1', color: '#9e9e9e66', lineWidth: 1 },
  { key: 'previousUpper1', color: '#9e9e9e66', lineWidth: 1 },
  { key: 'previousUpper2', color: '#e5393566', lineWidth: 1 },
  { key: 'previousVwap', color: '#ff980099', lineWidth: 1 },
  { key: 'lower2', color: '#1e88e5', lineWidth: 2 },
  { key: 'lower1', color: '#9e9e9e', lineWidth: 2 },
  { key: 'upper1', color: '#9e9e9e', lineWidth: 2 },
  { key: 'upper2', color: '#e53935', lineWidth: 2 },
  { key: 'vwap', color: '#e53935', lineWidth: 1 },
]

export type DailyVwapLineSeriesBundle = {
  byKey: Record<DailyVwapValueKey, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
}

const SHARED_LINE_OPTIONS = {
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
  pointMarkersVisible: false,
}

export function createDailyVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): DailyVwapLineSeriesBundle {
  const byKey = {} as Record<DailyVwapValueKey, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = []

  for (const spec of DAILY_VWAP_SERIES_SPECS) {
    const series = chart.addSeries(LineSeries, {
      ...SHARED_LINE_OPTIONS,
      color: spec.color,
      lineWidth: spec.lineWidth,
      visible,
    })
    byKey[spec.key] = series
    ordered.push(series)
  }

  return { byKey, ordered }
}

export function setDailyVwapLineSeriesData(
  bundle: DailyVwapLineSeriesBundle,
  points: readonly DailyVwapPoint[],
): void {
  for (const spec of DAILY_VWAP_SERIES_SPECS) {
    bundle.byKey[spec.key].setData(dailyVwapPointsToLineData(points, spec.key))
  }
}

export function clearDailyVwapLineSeriesData(bundle: DailyVwapLineSeriesBundle): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
}

export function setDailyVwapLineSeriesVisible(
  bundle: DailyVwapLineSeriesBundle,
  visible: boolean,
): void {
  for (const series of bundle.ordered) {
    series.applyOptions({ visible })
  }
}

export function updateDailyVwapLineSeriesLast(
  bundle: DailyVwapLineSeriesBundle,
  point: DailyVwapPoint,
): void {
  for (const spec of DAILY_VWAP_SERIES_SPECS) {
    bundle.byKey[spec.key].update(dailyVwapPointToLinePoint(point, spec.key))
  }
}

/** Recompute daily VWAP from candles and patch only the latest point on each line series. */
export function applyDailyVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: DailyVwapLineSeriesBundle,
): void {
  const points = computeDailyVwap(candles)
  if (points.length === 0) return
  updateDailyVwapLineSeriesLast(bundle, points[points.length - 1])
}
