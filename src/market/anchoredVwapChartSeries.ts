import { LineSeries, type IChartApi, type ISeriesApi } from 'lightweight-charts'
import type { AnchoredVwapPoint } from './anchoredVwap.ts'
import {
  anchoredVwapPointToLinePoint,
  anchoredVwapPointsToLineData,
} from './anchoredVwapLineData.ts'
import {
  VWAP_CHART_SERIES_KEYS,
  VWAP_CHART_SERIES_STYLES,
  type VwapChartSeriesKey,
} from './vwapChartLineStyles.ts'
import type { MarketCandle } from './types.ts'

export { VWAP_CHART_SERIES_KEYS as ANCHORED_VWAP_CHART_SERIES_KEYS }

type SeriesSpec = {
  key: VwapChartSeriesKey
  color: string
  lineWidth: 1
}

const SERIES_SPECS: SeriesSpec[] = VWAP_CHART_SERIES_KEYS.map((key) => ({
  key,
  ...VWAP_CHART_SERIES_STYLES[key],
}))

export type AnchoredVwapLineSeriesBundle = {
  byKey: Record<VwapChartSeriesKey, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
}

const SHARED_LINE_OPTIONS = {
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
  pointMarkersVisible: false,
}

export function createAnchoredVwapLineSeries(
  chart: IChartApi,
  visible: boolean,
): AnchoredVwapLineSeriesBundle {
  const byKey = {} as Record<VwapChartSeriesKey, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = []

  for (const spec of SERIES_SPECS) {
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

export function setAnchoredVwapLineSeriesData(
  bundle: AnchoredVwapLineSeriesBundle,
  points: readonly AnchoredVwapPoint[],
): void {
  for (const spec of SERIES_SPECS) {
    bundle.byKey[spec.key].setData(anchoredVwapPointsToLineData(points, spec.key))
  }
}

export function clearAnchoredVwapLineSeriesData(bundle: AnchoredVwapLineSeriesBundle): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
}

export function setAnchoredVwapLineSeriesVisible(
  bundle: AnchoredVwapLineSeriesBundle,
  visible: boolean,
): void {
  for (const series of bundle.ordered) {
    series.applyOptions({ visible })
  }
}

export function updateAnchoredVwapLineSeriesLast(
  bundle: AnchoredVwapLineSeriesBundle,
  point: AnchoredVwapPoint,
): void {
  for (const spec of SERIES_SPECS) {
    bundle.byKey[spec.key].update(anchoredVwapPointToLinePoint(point, spec.key))
  }
}

export function applyAnchoredVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: AnchoredVwapLineSeriesBundle,
  compute: (candles: readonly MarketCandle[]) => AnchoredVwapPoint[],
): void {
  const points = compute(candles)
  if (points.length === 0) return
  updateAnchoredVwapLineSeriesLast(bundle, points[points.length - 1])
}
