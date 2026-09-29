import { LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { computeDailyVwap, type DailyVwapPoint } from '@/market/dailyVwap'
import {
  DAILY_VWAP_CHART_LINE_STYLE,
  DAILY_VWAP_CHART_SERIES_KEYS,
  dailyVwapPointToLinePoint,
  dailyVwapPointsToLineData,
  type DailyVwapChartSeriesKey,
} from '@/market/dailyVwapLineData'
import type { MarketCandle } from '@/market/types'

export { DAILY_VWAP_CHART_SERIES_KEYS }

type DailyVwapSeriesSpec = {
  key: DailyVwapChartSeriesKey
  color: string
  lineWidth: 1
}

const DAILY_VWAP_SERIES_SPECS: DailyVwapSeriesSpec[] = DAILY_VWAP_CHART_SERIES_KEYS.map(
  (key) => ({
    key,
    ...DAILY_VWAP_CHART_LINE_STYLE,
  }),
)

export type DailyVwapLineSeriesBundle = {
  byKey: Record<DailyVwapChartSeriesKey, ISeriesApi<'Line'>>
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
  const byKey = {} as Record<DailyVwapChartSeriesKey, ISeriesApi<'Line'>>
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
