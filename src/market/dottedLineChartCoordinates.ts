import type { IChartApi, ISeriesApi, MouseEventParams, SeriesType, Time } from 'lightweight-charts'
import type { DottedLineAnchor } from './dottedLineInstances.ts'
import {
  resolveChartEventTime,
  resolveChartTimeFromCoordinate,
} from './fixedRangeVolumeProfileChartTime.ts'
import { isValidChartPrice } from './dottedLineInstances.ts'

export function resolveChartPriceFromCoordinate(
  series: ISeriesApi<SeriesType, Time>,
  y: number,
): number | null {
  if (!Number.isFinite(y)) return null
  const price = series.coordinateToPrice(y)
  if (price === null || !Number.isFinite(price)) return null
  if (!isValidChartPrice(price)) return null
  return price
}

export function resolveDottedLineAnchorFromCoordinates(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  x: number,
  y: number,
): DottedLineAnchor | null {
  const time = resolveChartTimeFromCoordinate(chart, x)
  const price = resolveChartPriceFromCoordinate(series, y)
  if (time === null || price === null) return null
  return { time, price }
}

export function resolveDottedLineCrosshairAnchor(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  param: MouseEventParams<Time>,
): DottedLineAnchor | null {
  if (!param.point) return null
  const fromEventTime = resolveChartEventTime(param.time)
  const time =
    fromEventTime ?? resolveChartTimeFromCoordinate(chart, param.point.x)
  const price = resolveChartPriceFromCoordinate(series, param.point.y)
  if (time === null || price === null) return null
  return { time, price }
}
