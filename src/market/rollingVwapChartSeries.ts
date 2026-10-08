import {
  LineSeries,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { isIndicatorSupportedOnInterval } from './indicators.ts'
import { rollingVwapInstancePeriodLabel, type RollingVwapInstance } from './rollingVwapInstances.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
import {
  computeRollingVwapPointsForSettings,
  DEFAULT_ROLLING_VWAP_LINE_COLOR,
  DEFAULT_ROLLING_VWAP_LINE_OPACITY,
  DEFAULT_ROLLING_VWAP_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_LINE_WIDTH,
  rollingVwapCenterLineRgbaColor,
  type RollingVwapBandColors,
  type RollingVwapLineStyle,
  type RollingVwapLineWidth,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import type { CandleInterval, MarketCandle } from './types.ts'

/** Same gray as anchored Daily/Weekly VWAP center lines. */
export const ROLLING_VWAP_LINE_COLOR = DEFAULT_ROLLING_VWAP_LINE_COLOR

export type RollingVwapCenterLinePresentation = {
  lineWidth?: RollingVwapLineWidth
  lineColor?: string
  lineOpacity?: number
  lineStyle?: RollingVwapLineStyle
}

function rollingVwapLineStyleToChart(style: RollingVwapLineStyle): LineStyle {
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

export function rollingVwapCenterLineOptions(
  presentation: RollingVwapCenterLinePresentation = {},
) {
  const lineWidth = presentation.lineWidth ?? DEFAULT_ROLLING_VWAP_LINE_WIDTH
  const lineColor = presentation.lineColor ?? DEFAULT_ROLLING_VWAP_LINE_COLOR
  const lineOpacity = presentation.lineOpacity ?? DEFAULT_ROLLING_VWAP_LINE_OPACITY
  const lineStyle = presentation.lineStyle ?? DEFAULT_ROLLING_VWAP_LINE_STYLE
  return {
    color: rollingVwapCenterLineRgbaColor(lineColor, lineOpacity),
    lineWidth,
    lineStyle: rollingVwapLineStyleToChart(lineStyle),
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    pointMarkersVisible: false,
  }
}

export const ROLLING_VWAP_CENTER_LINE_OPTIONS = rollingVwapCenterLineOptions()

export const ROLLING_VWAP_LINE_CHART_OPTIONS = ROLLING_VWAP_CENTER_LINE_OPTIONS

function rollingVwapBandLineOptions(lineWidth: RollingVwapLineWidth = DEFAULT_ROLLING_VWAP_LINE_WIDTH) {
  return {
    lineWidth,
    priceLineVisible: false,
    lastValueVisible: false,
    title: '',
    crosshairMarkerVisible: false,
    pointMarkersVisible: false,
  }
}

export const ROLLING_VWAP_BAND_SERIES_KEYS = [
  'upper1',
  'lower1',
  'upper2',
  'lower2',
  'upper3',
  'lower3',
] as const

export type RollingVwapBandSeriesKey = (typeof ROLLING_VWAP_BAND_SERIES_KEYS)[number]

export type RollingVwapValueKey = 'vwap' | RollingVwapBandSeriesKey

export type RollingVwapLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

export type RollingVwapChartSeriesBundle = {
  center: ISeriesApi<'Line'>
  bands: Record<RollingVwapBandSeriesKey, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
}

const BAND_COLOR_KEYS: Record<RollingVwapBandSeriesKey, keyof RollingVwapBandColors> = {
  upper1: 'band1',
  lower1: 'band1',
  upper2: 'band2',
  lower2: 'band2',
  upper3: 'band3',
  lower3: 'band3',
}

function toLinePoint(time: number, value: number | null): RollingVwapLinePoint {
  const stamp = time as UTCTimestamp
  if (value === null || !Number.isFinite(value)) {
    return { time: stamp }
  }
  return { time: stamp, value }
}

export function rollingVwapPointToLinePoint(
  point: RollingVwapPoint,
  key: RollingVwapValueKey,
): RollingVwapLinePoint {
  return toLinePoint(point.time, point[key])
}

export function rollingVwapPointsToLineData(
  points: readonly RollingVwapPoint[],
  key: RollingVwapValueKey,
): RollingVwapLinePoint[] {
  return points.map((point) => rollingVwapPointToLinePoint(point, key))
}

export function applyRollingVwapChartLineWidth(
  bundle: RollingVwapChartSeriesBundle,
  lineWidth: RollingVwapLineWidth,
): void {
  bundle.center.applyOptions({ lineWidth })
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    bundle.bands[key].applyOptions({ lineWidth })
  }
}

export function applyRollingVwapCenterLinePresentation(
  center: ISeriesApi<'Line'>,
  settings: Pick<RollingVwapSettings, 'lineColor' | 'lineOpacity' | 'lineStyle'>,
): void {
  center.applyOptions({
    color: rollingVwapCenterLineRgbaColor(settings.lineColor, settings.lineOpacity),
    lineStyle: rollingVwapLineStyleToChart(settings.lineStyle),
  })
}

export function createRollingVwapChartSeriesBundle(
  chart: IChartApi,
  bandColors: RollingVwapBandColors,
  options?: {
    title?: string
    lineWidth?: RollingVwapLineWidth
    lineColor?: string
    lineOpacity?: number
    lineStyle?: RollingVwapLineStyle
  },
): RollingVwapChartSeriesBundle {
  const lineWidth = options?.lineWidth ?? DEFAULT_ROLLING_VWAP_LINE_WIDTH
  const center = chart.addSeries(LineSeries, {
    ...rollingVwapCenterLineOptions({
      lineWidth,
      lineColor: options?.lineColor,
      lineOpacity: options?.lineOpacity,
      lineStyle: options?.lineStyle,
    }),
    title: options?.title ?? '',
    visible: false,
  })

  const bands = {} as Record<RollingVwapBandSeriesKey, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = [center]

  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const colorKey = BAND_COLOR_KEYS[key]
    const series = chart.addSeries(LineSeries, {
      ...rollingVwapBandLineOptions(lineWidth),
      color: bandColors[colorKey],
      visible: false,
    })
    bands[key] = series
    ordered.push(series)
  }

  return { center, bands, ordered }
}

export function removeRollingVwapChartSeriesBundle(
  chart: IChartApi,
  bundle: RollingVwapChartSeriesBundle,
): void {
  for (const series of bundle.ordered) {
    chart.removeSeries(series)
  }
}

export function applyRollingVwapChartBandColors(
  bundle: RollingVwapChartSeriesBundle,
  bandColors: RollingVwapBandColors,
): void {
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const colorKey = BAND_COLOR_KEYS[key]
    bundle.bands[key].applyOptions({ color: bandColors[colorKey] })
  }
}

export function applyRollingVwapChartInstancePresentation(
  bundle: RollingVwapChartSeriesBundle,
  instance: RollingVwapInstance,
  interval: CandleInterval,
): void {
  applyRollingVwapChartBandColors(bundle, instance.settings.bandColors)
  applyRollingVwapChartLineWidth(bundle, instance.settings.lineWidth)
  applyRollingVwapCenterLinePresentation(bundle.center, instance.settings)
  bundle.center.applyOptions({
    title: rollingVwapInstancePeriodLabel(instance, interval),
    lastValueVisible: true,
    priceLineVisible: false,
  })
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    bundle.bands[key].applyOptions({
      lastValueVisible: false,
      title: '',
      priceLineVisible: false,
    })
  }
}

export function setRollingVwapChartSeriesData(
  bundle: RollingVwapChartSeriesBundle,
  points: readonly RollingVwapPoint[],
): void {
  bundle.center.setData(rollingVwapPointsToLineData(points, 'vwap'))
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    bundle.bands[key].setData(rollingVwapPointsToLineData(points, key))
  }
}

export function clearRollingVwapChartSeriesData(bundle: RollingVwapChartSeriesBundle): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
}

export function updateRollingVwapChartSeriesLast(
  bundle: RollingVwapChartSeriesBundle,
  point: RollingVwapPoint,
): void {
  bundle.center.update(rollingVwapPointToLinePoint(point, 'vwap'))
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    bundle.bands[key].update(rollingVwapPointToLinePoint(point, key))
  }
}

function bandPairVisible(instanceVisible: boolean, multiplier: number): boolean {
  return instanceVisible && multiplier > 0
}

export function setRollingVwapInstanceSeriesVisibility(
  bundle: RollingVwapChartSeriesBundle,
  instance: RollingVwapInstance,
  interval: CandleInterval,
): void {
  const instanceVisible =
    instance.enabled && isIndicatorSupportedOnInterval('rolling-vwap', interval)
  const title = rollingVwapInstancePeriodLabel(instance, interval)
  bundle.center.applyOptions({
    visible: instanceVisible,
    title,
    lastValueVisible: true,
    priceLineVisible: false,
  })

  const { multipliers } = instance.settings
  bundle.bands.upper1.applyOptions({
    visible: bandPairVisible(instanceVisible, multipliers.multiplier1),
    lastValueVisible: false,
    title: '',
  })
  bundle.bands.lower1.applyOptions({
    visible: bandPairVisible(instanceVisible, multipliers.multiplier1),
    lastValueVisible: false,
    title: '',
  })
  bundle.bands.upper2.applyOptions({
    visible: bandPairVisible(instanceVisible, multipliers.multiplier2),
    lastValueVisible: false,
    title: '',
  })
  bundle.bands.lower2.applyOptions({
    visible: bandPairVisible(instanceVisible, multipliers.multiplier2),
    lastValueVisible: false,
    title: '',
  })
  bundle.bands.upper3.applyOptions({
    visible: bandPairVisible(instanceVisible, multipliers.multiplier3),
    lastValueVisible: false,
    title: '',
  })
  bundle.bands.lower3.applyOptions({
    visible: bandPairVisible(instanceVisible, multipliers.multiplier3),
    lastValueVisible: false,
    title: '',
  })
}

/** @deprecated Use setRollingVwapInstanceSeriesVisibility with instance model (Stage 4B+). */
export function setRollingVwapChartSeriesVisibility(
  bundle: RollingVwapChartSeriesBundle,
  params: {
    activeIndicators: readonly string[]
    interval: CandleInterval
    settings: RollingVwapSettings
  },
): void {
  const legacyInstance: RollingVwapInstance = {
    id: 'legacy',
    enabled: params.activeIndicators.includes('rolling-vwap'),
    settings: params.settings,
  }
  setRollingVwapInstanceSeriesVisibility(bundle, legacyInstance, params.interval)
}

/** Recompute from candles and patch only the latest point on all seven series. */
export function applyRollingVwapLiveFromCandles(
  candles: readonly MarketCandle[],
  bundle: RollingVwapChartSeriesBundle,
  interval: CandleInterval,
  settings: RollingVwapSettings,
): void {
  if (candles.length === 0) return
  const points = computeRollingVwapPointsForSettings(candles, interval, settings)
  if (points.length === 0) return
  updateRollingVwapChartSeriesLast(bundle, points[points.length - 1])
}
