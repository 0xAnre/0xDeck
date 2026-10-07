import type { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts'
import { resolveChartTimeFromCoordinate } from './fixedRangeVolumeProfileChartTime.ts'

export function resolveChartPriceFromCoordinate(
  series: ISeriesApi<SeriesType, Time>,
  y: number,
): number | null {
  if (!Number.isFinite(y)) return null
  const price = series.coordinateToPrice(y)
  if (price === null || !Number.isFinite(price)) return null
  return price as number
}

export function resolvePointerChartPoint(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  paneX: number,
  paneY: number,
): { time: number; price: number } | null {
  const time = resolveChartTimeFromCoordinate(chart, paneX)
  const price = resolveChartPriceFromCoordinate(series, paneY)
  if (time === null || price === null) return null
  return { time, price }
}
