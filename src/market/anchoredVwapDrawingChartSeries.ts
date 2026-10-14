import {
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  computeAnchoredVwapDrawing,
  type AnchoredVwapDrawingPoint,
} from './anchoredVwapDrawing.ts'
import {
  anchoredVwapDrawingLineRgba,
  anchoredVwapDrawingMultipliersFromSettings,
  type AnchoredVwapDrawingSettings,
} from './anchoredVwapDrawingSettings.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import { isAnchoredVwapInstanceHidden } from './anchoredVwapInstances.ts'
import type { RollingVwapLineStyle } from './rollingVwapSettings.ts'
import type { MarketCandle } from './types.ts'

export const ANCHORED_VWAP_DRAWING_BAND_SERIES_KEYS = [
  'upper1',
  'lower1',
  'upper2',
  'lower2',
  'upper3',
  'lower3',
] as const

export type AnchoredVwapDrawingBandSeriesKey =
  (typeof ANCHORED_VWAP_DRAWING_BAND_SERIES_KEYS)[number]

export type AnchoredVwapDrawingValueKey = 'vwap' | AnchoredVwapDrawingBandSeriesKey

export type AnchoredVwapDrawingLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

export type AnchoredVwapDrawingChartSeriesBundle = {
  center: ISeriesApi<'Line'>
  bands: Record<AnchoredVwapDrawingBandSeriesKey, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
}

function lineStyleToChart(style: RollingVwapLineStyle): LineStyle {
  switch (style) {
    case 'solid':
      return LineStyle.Solid
    case 'dotted':
      return LineStyle.Dotted
    default: {
      const unreachable: never = style
      return unreachable
    }
  }
}

function toLinePoint(time: number, value: number | null): AnchoredVwapDrawingLinePoint {
  const stamp = time as UTCTimestamp
  if (value === null || !Number.isFinite(value)) {
    return { time: stamp }
  }
  return { time: stamp, value }
}

export function anchoredVwapDrawingPointToLinePoint(
  point: AnchoredVwapDrawingPoint,
  key: AnchoredVwapDrawingValueKey,
): AnchoredVwapDrawingLinePoint {
  return toLinePoint(point.time, point[key])
}

export function anchoredVwapDrawingPointsToLineData(
  points: readonly AnchoredVwapDrawingPoint[],
  key: AnchoredVwapDrawingValueKey,
): AnchoredVwapDrawingLinePoint[] {
  return points.map((point) => anchoredVwapDrawingPointToLinePoint(point, key))
}

export function createAnchoredVwapDrawingChartSeriesBundle(
  chart: IChartApi,
  settings: AnchoredVwapDrawingSettings,
  title: string,
): AnchoredVwapDrawingChartSeriesBundle {
  const center = chart.addSeries(LineSeries, {
    color: anchoredVwapDrawingLineRgba(settings.vwapLine.lineColor, settings.vwapLine.lineOpacity),
    lineWidth: settings.vwapLine.lineWidth,
    lineStyle: lineStyleToChart(settings.vwapLine.lineStyle),
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    pointMarkersVisible: false,
    title,
    visible: false,
  })

  const bands = {} as Record<AnchoredVwapDrawingBandSeriesKey, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = [center]

  const bandSettings = [settings.band1, settings.band2, settings.band3]

  for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
    const pair = bandSettings[pairIndex]
    for (const side of ['upper', 'lower'] as const) {
      const key = `${side}${pairIndex + 1}` as AnchoredVwapDrawingBandSeriesKey
      const series = chart.addSeries(LineSeries, {
        color: anchoredVwapDrawingLineRgba(pair.lineColor, pair.lineOpacity),
        lineWidth: pair.lineWidth,
        lineStyle: lineStyleToChart(pair.lineStyle),
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        pointMarkersVisible: false,
        title: '',
        visible: false,
      })
      bands[key] = series
      ordered.push(series)
    }
  }

  return { center, bands, ordered }
}

export function removeAnchoredVwapDrawingChartSeriesBundle(
  chart: IChartApi,
  bundle: AnchoredVwapDrawingChartSeriesBundle,
): void {
  for (const series of bundle.ordered) {
    chart.removeSeries(series)
  }
}

export function applyAnchoredVwapDrawingChartPresentation(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
  instance: AnchoredVwapInstance,
  title: string,
): void {
  const { settings } = instance
  bundle.center.applyOptions({
    color: anchoredVwapDrawingLineRgba(settings.vwapLine.lineColor, settings.vwapLine.lineOpacity),
    lineWidth: settings.vwapLine.lineWidth,
    lineStyle: lineStyleToChart(settings.vwapLine.lineStyle),
    title,
    lastValueVisible: true,
    priceLineVisible: false,
  })

  const pairs = [settings.band1, settings.band2, settings.band3]
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]
    const upperKey = `upper${index + 1}` as AnchoredVwapDrawingBandSeriesKey
    const lowerKey = `lower${index + 1}` as AnchoredVwapDrawingBandSeriesKey
    const rgba = anchoredVwapDrawingLineRgba(pair.lineColor, pair.lineOpacity)
    bundle.bands[upperKey].applyOptions({
      color: rgba,
      lineWidth: pair.lineWidth,
      lineStyle: lineStyleToChart(pair.lineStyle),
      lastValueVisible: false,
      title: '',
    })
    bundle.bands[lowerKey].applyOptions({
      color: rgba,
      lineWidth: pair.lineWidth,
      lineStyle: lineStyleToChart(pair.lineStyle),
      lastValueVisible: false,
      title: '',
    })
  }
}

export function setAnchoredVwapDrawingChartSeriesData(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
  points: readonly AnchoredVwapDrawingPoint[],
): void {
  bundle.center.setData(anchoredVwapDrawingPointsToLineData(points, 'vwap'))
  for (const key of ANCHORED_VWAP_DRAWING_BAND_SERIES_KEYS) {
    bundle.bands[key].setData(anchoredVwapDrawingPointsToLineData(points, key))
  }
}

export function clearAnchoredVwapDrawingChartSeriesData(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
}

export function updateAnchoredVwapDrawingChartSeriesLast(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
  point: AnchoredVwapDrawingPoint,
): void {
  bundle.center.update(anchoredVwapDrawingPointToLinePoint(point, 'vwap'))
  for (const key of ANCHORED_VWAP_DRAWING_BAND_SERIES_KEYS) {
    bundle.bands[key].update(anchoredVwapDrawingPointToLinePoint(point, key))
  }
}

export function bandPairVisible(
  instanceVisible: boolean,
  pairVisible: boolean,
  multiplier: number,
): boolean {
  return instanceVisible && pairVisible && multiplier > 0
}

export function setAnchoredVwapDrawingInstanceSeriesVisibility(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
  instance: AnchoredVwapInstance,
  title: string,
): void {
  const instanceVisible = !isAnchoredVwapInstanceHidden(instance)
  const { settings } = instance
  bundle.center.applyOptions({
    visible: instanceVisible && settings.vwapLine.visible,
    title,
    lastValueVisible: true,
    priceLineVisible: false,
  })

  const pairs = [settings.band1, settings.band2, settings.band3]
  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]
    const visible = bandPairVisible(instanceVisible, pair.visible, pair.multiplier)
    const upperKey = `upper${index + 1}` as AnchoredVwapDrawingBandSeriesKey
    const lowerKey = `lower${index + 1}` as AnchoredVwapDrawingBandSeriesKey
    bundle.bands[upperKey].applyOptions({ visible, lastValueVisible: false, title: '' })
    bundle.bands[lowerKey].applyOptions({ visible, lastValueVisible: false, title: '' })
  }
}

export function computeAnchoredVwapDrawingPointsForInstance(
  candles: readonly MarketCandle[],
  instance: AnchoredVwapInstance,
): AnchoredVwapDrawingPoint[] {
  const multipliers = anchoredVwapDrawingMultipliersFromSettings(instance.settings)
  return computeAnchoredVwapDrawing(candles, instance.anchorTime, multipliers)
}

export function applyAnchoredVwapDrawingLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: AnchoredVwapDrawingChartSeriesBundle,
  instance: AnchoredVwapInstance,
): void {
  if (candles.length === 0) return
  const points = computeAnchoredVwapDrawingPointsForInstance(candles, instance)
  if (points.length === 0) return
  updateAnchoredVwapDrawingChartSeriesLast(bundle, points[points.length - 1])
}
