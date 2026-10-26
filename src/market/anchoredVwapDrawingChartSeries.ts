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
  type AnchoredVwapDrawingBandPairSettings,
  type AnchoredVwapDrawingSettings,
} from './anchoredVwapDrawingSettings.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import { isAnchoredVwapInstanceHidden } from './anchoredVwapInstances.ts'
import {
  attachAnchoredVwapBandFillSeriesPrimitive,
  type AnchoredVwapBandFillPairContext,
  type AnchoredVwapBandFillSeriesAttachment,
} from './anchoredVwapBandFillSeriesPrimitive.ts'
import type { AnchoredVwapBandFillPoint } from './anchoredVwapBandFillRenderGeometry.ts'
import { rectangleFillRgbaFromHex } from './rectangleColors.ts'
import type { RollingVwapLineStyle } from './rollingVwapSettings.ts'
import type { MarketCandle } from './types.ts'
import { resolveCandlePaneIndex } from './candlePane.ts'

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

const BAND_FILL_PAIR_KEYS = [
  { upper: 'upper1', lower: 'lower1' },
  { upper: 'upper2', lower: 'lower2' },
  { upper: 'upper3', lower: 'lower3' },
] as const satisfies readonly {
  upper: AnchoredVwapDrawingBandSeriesKey
  lower: AnchoredVwapDrawingBandSeriesKey
}[]

/** Mutable fill state kept next to the chart series so data/visibility updates can re-sync the primitive. */
export type AnchoredVwapDrawingBandFillPairState = {
  points: readonly AnchoredVwapBandFillPoint[]
  visible: boolean
  fillStyle: string
}

export type AnchoredVwapDrawingChartSeriesBundle = {
  center: ISeriesApi<'Line'>
  bands: Record<AnchoredVwapDrawingBandSeriesKey, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
  bandFill: AnchoredVwapBandFillSeriesAttachment
  bandFillPairs: AnchoredVwapDrawingBandFillPairState[]
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

function bandFillPointsForPair(
  points: readonly AnchoredVwapDrawingPoint[],
  pairIndex: number,
): AnchoredVwapBandFillPoint[] {
  const keys = BAND_FILL_PAIR_KEYS[pairIndex]
  return points.map((point) => ({
    time: point.time,
    upper: point[keys.upper],
    lower: point[keys.lower],
  }))
}

function bandFillStyle(pair: AnchoredVwapDrawingBandPairSettings): string {
  return rectangleFillRgbaFromHex(pair.fillColor, pair.fillOpacity)
}

function pushBandFill(bundle: AnchoredVwapDrawingChartSeriesBundle): void {
  const pairs: AnchoredVwapBandFillPairContext[] = bundle.bandFillPairs.map((pair, index) => ({
    id: `band${index + 1}`,
    points: pair.points,
    visible: pair.visible,
    fillStyle: pair.fillStyle,
  }))
  bundle.bandFill.setPairs(pairs)
}

export function createAnchoredVwapDrawingChartSeriesBundle(
  chart: IChartApi,
  settings: AnchoredVwapDrawingSettings,
  title: string,
): AnchoredVwapDrawingChartSeriesBundle {
  // Overlays belong to the candle pane, which is not pane 0 when the
  // aggregated-liquidations pane sits above the candles.
  const paneIndex = resolveCandlePaneIndex(chart)
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
  }, paneIndex)

  const bands = {} as Record<AnchoredVwapDrawingBandSeriesKey, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = [center]

  const bandSettings = [settings.band1, settings.band2, settings.band3]

  for (let pairIndex = 0; pairIndex < 3; pairIndex += 1) {
    const pair = bandSettings[pairIndex]
    for (const side of ['upper', 'lower'] as const) {
      const key = `${side}${pairIndex + 1}` as AnchoredVwapDrawingBandSeriesKey
      const series = chart.addSeries(LineSeries, {
        color: anchoredVwapDrawingLineRgba(
          side === 'upper' ? pair.upperColor : pair.lowerColor,
          side === 'upper' ? pair.upperOpacity : pair.lowerOpacity,
        ),
        lineWidth: pair.lineWidth,
        lineStyle: lineStyleToChart(pair.lineStyle),
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
        pointMarkersVisible: false,
        title: '',
        visible: false,
      }, paneIndex)
      bands[key] = series
      ordered.push(series)
    }
  }

  const bandFillPairs: AnchoredVwapDrawingBandFillPairState[] = bandSettings.map((pair) => ({
    points: [],
    visible: false,
    fillStyle: bandFillStyle(pair),
  }))
  const bandFill = attachAnchoredVwapBandFillSeriesPrimitive(center, { pairs: [] })
  const bundle: AnchoredVwapDrawingChartSeriesBundle = {
    center,
    bands,
    ordered,
    bandFill,
    bandFillPairs,
  }
  pushBandFill(bundle)
  return bundle
}

export function removeAnchoredVwapDrawingChartSeriesBundle(
  chart: IChartApi,
  bundle: AnchoredVwapDrawingChartSeriesBundle,
): void {
  bundle.bandFill.dispose()
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
    bundle.bands[upperKey].applyOptions({
      color: anchoredVwapDrawingLineRgba(pair.upperColor, pair.upperOpacity),
      lineWidth: pair.lineWidth,
      lineStyle: lineStyleToChart(pair.lineStyle),
      lastValueVisible: false,
      title: '',
    })
    bundle.bands[lowerKey].applyOptions({
      color: anchoredVwapDrawingLineRgba(pair.lowerColor, pair.lowerOpacity),
      lineWidth: pair.lineWidth,
      lineStyle: lineStyleToChart(pair.lineStyle),
      lastValueVisible: false,
      title: '',
    })
    bundle.bandFillPairs[index].fillStyle = bandFillStyle(pair)
  }
  pushBandFill(bundle)
}

export function setAnchoredVwapDrawingChartSeriesData(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
  points: readonly AnchoredVwapDrawingPoint[],
): void {
  bundle.center.setData(anchoredVwapDrawingPointsToLineData(points, 'vwap'))
  for (const key of ANCHORED_VWAP_DRAWING_BAND_SERIES_KEYS) {
    bundle.bands[key].setData(anchoredVwapDrawingPointsToLineData(points, key))
  }
  for (let index = 0; index < bundle.bandFillPairs.length; index += 1) {
    bundle.bandFillPairs[index].points = bandFillPointsForPair(points, index)
  }
  pushBandFill(bundle)
}

export function clearAnchoredVwapDrawingChartSeriesData(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
  for (const pair of bundle.bandFillPairs) {
    pair.points = []
  }
  pushBandFill(bundle)
}

function upsertBandFillLastPoint(
  existing: readonly AnchoredVwapBandFillPoint[],
  next: AnchoredVwapBandFillPoint,
): readonly AnchoredVwapBandFillPoint[] {
  if (existing.length === 0) return [next]
  const last = existing[existing.length - 1]
  if (next.time > last.time) return [...existing, next]
  if (next.time === last.time) return [...existing.slice(0, -1), next]
  return existing
}

export function updateAnchoredVwapDrawingChartSeriesLast(
  bundle: AnchoredVwapDrawingChartSeriesBundle,
  point: AnchoredVwapDrawingPoint,
): void {
  bundle.center.update(anchoredVwapDrawingPointToLinePoint(point, 'vwap'))
  for (const key of ANCHORED_VWAP_DRAWING_BAND_SERIES_KEYS) {
    bundle.bands[key].update(anchoredVwapDrawingPointToLinePoint(point, key))
  }
  for (let index = 0; index < bundle.bandFillPairs.length; index += 1) {
    const keys = BAND_FILL_PAIR_KEYS[index]
    const nextPoint: AnchoredVwapBandFillPoint = {
      time: point.time,
      upper: point[keys.upper],
      lower: point[keys.lower],
    }
    bundle.bandFillPairs[index].points = upsertBandFillLastPoint(
      bundle.bandFillPairs[index].points,
      nextPoint,
    )
  }
  pushBandFill(bundle)
}

function bandPairLinesVisible(
  instanceVisible: boolean,
  pairVisible: boolean,
  multiplier: number,
): boolean {
  return instanceVisible && pairVisible && multiplier > 0
}

function bandPairFillVisible(
  instanceVisible: boolean,
  pair: AnchoredVwapDrawingBandPairSettings,
): boolean {
  return instanceVisible && pair.visible && pair.multiplier > 0 && pair.fillOpacity > 0
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
    const linesVisible = bandPairLinesVisible(instanceVisible, pair.visible, pair.multiplier)
    const upperKey = `upper${index + 1}` as AnchoredVwapDrawingBandSeriesKey
    const lowerKey = `lower${index + 1}` as AnchoredVwapDrawingBandSeriesKey
    bundle.bands[upperKey].applyOptions({
      visible: linesVisible && pair.upperVisible,
      lastValueVisible: false,
      title: '',
    })
    bundle.bands[lowerKey].applyOptions({
      visible: linesVisible && pair.lowerVisible,
      lastValueVisible: false,
      title: '',
    })
    bundle.bandFillPairs[index].visible = bandPairFillVisible(instanceVisible, pair)
  }
  pushBandFill(bundle)
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
