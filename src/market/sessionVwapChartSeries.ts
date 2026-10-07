import { LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import {
  attachSessionVwapBandSeriesPrimitive,
  type SessionVwapBandSeriesAttachment,
} from './sessionVwapBandSeriesPrimitive.ts'
import {
  sessionVwapPointsToBandPoints,
  type SessionVwapBandPoint,
} from './sessionVwapBandRenderGeometry.ts'
import type { VwapChartLineStyle } from './vwapChartLineStyles.ts'

export type SessionVwapLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

type SeriesSpec<Key extends string> = {
  key: Key
  color: string
  lineWidth: 1
}

export type SessionVwapLineSeriesBundle<Key extends string> = {
  byKey: Record<Key, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
  band: SessionVwapBandSeriesAttachment
}

const SHARED_LINE_OPTIONS = {
  priceLineVisible: false,
  lastValueVisible: false,
  crosshairMarkerVisible: false,
  pointMarkersVisible: false,
}

export type SessionVwapChartSeriesAdapter<
  Point extends SessionVwapBandPoint,
  Key extends string,
> = {
  seriesKeys: readonly Key[]
  seriesStyles: Record<Key, VwapChartLineStyle>
  pointsToLineData: (points: readonly Point[], key: Key) => SessionVwapLinePoint[]
  pointToLinePoint: (point: Point, key: Key) => SessionVwapLinePoint
}

function buildSpecs<Point extends SessionVwapBandPoint, Key extends string>(
  adapter: SessionVwapChartSeriesAdapter<Point, Key>,
): SeriesSpec<Key>[] {
  return adapter.seriesKeys.map((key) => ({
    key,
    ...adapter.seriesStyles[key],
  }))
}

export function createSessionVwapLineSeries<
  Point extends SessionVwapBandPoint,
  Key extends string,
>(
  chart: IChartApi,
  visible: boolean,
  adapter: SessionVwapChartSeriesAdapter<Point, Key>,
): SessionVwapLineSeriesBundle<Key> {
  const specs = buildSpecs(adapter)
  const byKey = {} as Record<Key, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = []
  const bandPoints: SessionVwapBandPoint[] = []
  const bandVisible = visible

  for (const spec of specs) {
    const series = chart.addSeries(LineSeries, {
      ...SHARED_LINE_OPTIONS,
      color: spec.color,
      lineWidth: spec.lineWidth,
      visible,
    })
    byKey[spec.key] = series
    ordered.push(series)
  }

  const vwapKey = adapter.seriesKeys.find((key) => key === 'vwap')
  if (!vwapKey) {
    throw new Error('Session VWAP chart adapter must include a vwap series key')
  }
  const vwapSeries = byKey[vwapKey]

  const band = attachSessionVwapBandSeriesPrimitive(vwapSeries, {
    points: bandPoints,
    visible: bandVisible,
  })

  return {
    byKey,
    ordered,
    band,
  }
}

function syncBandState<Point extends SessionVwapBandPoint, Key extends string>(
  bundle: SessionVwapLineSeriesBundle<Key>,
  points: readonly Point[],
): void {
  const bandPoints = sessionVwapPointsToBandPoints(points)
  bundle.band.updateBandData(bandPoints)
}

export function setSessionVwapLineSeriesData<
  Point extends SessionVwapBandPoint,
  Key extends string,
>(
  bundle: SessionVwapLineSeriesBundle<Key>,
  points: readonly Point[],
  adapter: SessionVwapChartSeriesAdapter<Point, Key>,
): void {
  const specs = buildSpecs(adapter)
  for (const spec of specs) {
    bundle.byKey[spec.key].setData(adapter.pointsToLineData(points, spec.key))
  }
  syncBandState(bundle, points)
}

export function clearSessionVwapLineSeriesData<Key extends string>(
  bundle: SessionVwapLineSeriesBundle<Key>,
): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
  bundle.band.updateBandData([])
}

export function setSessionVwapLineSeriesVisible<Key extends string>(
  bundle: SessionVwapLineSeriesBundle<Key>,
  visible: boolean,
): void {
  for (const series of bundle.ordered) {
    series.applyOptions({ visible })
  }
  bundle.band.setBandVisible(visible)
}

export function updateSessionVwapLineSeriesLast<
  Point extends SessionVwapBandPoint,
  Key extends string,
>(
  bundle: SessionVwapLineSeriesBundle<Key>,
  allPoints: readonly Point[],
  lastPoint: Point,
  adapter: SessionVwapChartSeriesAdapter<Point, Key>,
): void {
  const specs = buildSpecs(adapter)
  for (const spec of specs) {
    bundle.byKey[spec.key].update(adapter.pointToLinePoint(lastPoint, spec.key))
  }
  syncBandState(bundle, allPoints)
}
