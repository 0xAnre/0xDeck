import { LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import { computeWeeklyVwap, type WeeklyVwapPoint } from '@/market/weeklyVwap'
import {
  WEEKLY_VWAP_CHART_SERIES_KEYS,
  WEEKLY_VWAP_CHART_SERIES_STYLES,
  weeklyVwapPointToLinePoint,
  weeklyVwapPointsToLineData,
  type WeeklyVwapChartSeriesKey,
} from '@/market/weeklyVwapLineData'
import type { MarketCandle } from '@/market/types'

export { WEEKLY_VWAP_CHART_SERIES_KEYS }

type WeeklyVwapSeriesSpec = {
  key: WeeklyVwapChartSeriesKey
  color: string
  lineWidth: 1
}

const WEEKLY_VWAP_SERIES_SPECS: WeeklyVwapSeriesSpec[] = WEEKLY_VWAP_CHART_SERIES_KEYS.map(
  (key) => ({
    key,
    ...WEEKLY_VWAP_CHART_SERIES_STYLES[key],
  }),
)

export type WeeklyVwapLineSeriesBundle = {
  byKey: Record<WeeklyVwapChartSeriesKey, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
}

const SHARED_LINE_OPTIONS = {
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
  pointMarkersVisible: false,
}

export function createWeeklyVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): WeeklyVwapLineSeriesBundle {
  const byKey = {} as Record<WeeklyVwapChartSeriesKey, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = []

  for (const spec of WEEKLY_VWAP_SERIES_SPECS) {
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

export function setWeeklyVwapLineSeriesData(
  bundle: WeeklyVwapLineSeriesBundle,
  points: readonly WeeklyVwapPoint[],
): void {
  for (const spec of WEEKLY_VWAP_SERIES_SPECS) {
    bundle.byKey[spec.key].setData(weeklyVwapPointsToLineData(points, spec.key))
  }
}

export function clearWeeklyVwapLineSeriesData(bundle: WeeklyVwapLineSeriesBundle): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
}

export function setWeeklyVwapLineSeriesVisible(
  bundle: WeeklyVwapLineSeriesBundle,
  visible: boolean,
): void {
  for (const series of bundle.ordered) {
    series.applyOptions({ visible })
  }
}

export function updateWeeklyVwapLineSeriesLast(
  bundle: WeeklyVwapLineSeriesBundle,
  point: WeeklyVwapPoint,
): void {
  for (const spec of WEEKLY_VWAP_SERIES_SPECS) {
    bundle.byKey[spec.key].update(weeklyVwapPointToLinePoint(point, spec.key))
  }
}

export function applyWeeklyVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: WeeklyVwapLineSeriesBundle,
): void {
  const points = computeWeeklyVwap(candles)
  if (points.length === 0) return
  updateWeeklyVwapLineSeriesLast(bundle, points[points.length - 1])
}
