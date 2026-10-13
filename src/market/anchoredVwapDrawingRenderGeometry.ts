import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { computeAnchoredVwapDrawingPointsForInstance } from './anchoredVwapDrawingChartSeries.ts'
import { anchorScreenYFromPoints } from './anchoredVwapDrawingHitTest.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import {
  resolveRectangleTimeToCoordinate,
  type RectangleChartTimeContext,
} from './rectangleChartTime.ts'
import type { MarketCandle } from './types.ts'

export type AnchoredVwapDrawingScreenProjection = {
  anchorX: number | null
  anchorY: number | null
  bodySegments: { x1: number; y1: number; x2: number; y2: number }[]
}

export function projectAnchoredVwapDrawingInstance(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  candles: readonly MarketCandle[],
  instance: AnchoredVwapInstance,
  timeContext: RectangleChartTimeContext,
): AnchoredVwapDrawingScreenProjection | null {
  const anchorX = resolveRectangleTimeToCoordinate(
    chart,
    instance.anchorTime,
    'start',
    timeContext,
  )
  const points = computeAnchoredVwapDrawingPointsForInstance(candles, instance)
  const anchorY = anchorScreenYFromPoints(points, (price) => series.priceToCoordinate(price))
  const bodySegments: { x1: number; y1: number; x2: number; y2: number }[] = []
  let prev: { x: number; y: number } | null = null
  for (const point of points) {
    if (point.vwap === null) continue
    const x = resolveRectangleTimeToCoordinate(chart, point.time, 'start', timeContext)
    const y = series.priceToCoordinate(point.vwap)
    if (x === null || y === null) continue
    if (prev) {
      bodySegments.push({ x1: prev.x, y1: prev.y, x2: x, y2: y })
    }
    prev = { x, y }
  }
  return { anchorX, anchorY, bodySegments }
}
