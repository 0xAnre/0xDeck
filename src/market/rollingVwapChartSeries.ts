import {
  LineSeries,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import {
  rollingVwapSettingsTimeframeCompatibility,
  rollingVwapTimeframeCompatibilityReason,
  type RollingVwapTimeframeCompatibility,
} from './rollingVwapMinimumTimeframe.ts'
import { rollingVwapInstancePeriodLabel, type RollingVwapInstance } from './rollingVwapInstances.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
import {
  computeRollingVwapPointsForSettings,
  DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_LINE_COLOR,
  DEFAULT_ROLLING_VWAP_LINE_OPACITY,
  DEFAULT_ROLLING_VWAP_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_LINE_WIDTH,
  resolveRollingVwapBandFillStyle,
  rollingVwapCenterLineRgbaColor,
  type RollingVwapBandColors,
  type RollingVwapBandLineStyles,
  type RollingVwapBandLineWidths,
  type RollingVwapBandOpacities,
  type RollingVwapLineStyle,
  type RollingVwapLineWidth,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import { lineChartStrokeStyleToChartLineStyle } from './lineChartStroke.ts'
import { marketStyleColorWithOpacity } from './marketStylePalette.ts'
import type { CandleInterval, MarketCandle } from './types.ts'
import { resolveCandlePaneIndex } from './candlePane.ts'
import {
  attachSessionVwapBandSeriesPrimitive,
  type SessionVwapBandSeriesAttachment,
} from './sessionVwapBandSeriesPrimitive.ts'
import type { SessionVwapBandPoint } from './sessionVwapBandRenderGeometry.ts'

/** Same gray as anchored Daily/Weekly VWAP center lines. */
export const ROLLING_VWAP_LINE_COLOR = DEFAULT_ROLLING_VWAP_LINE_COLOR

export type RollingVwapCenterLinePresentation = {
  lineWidth?: RollingVwapLineWidth
  lineColor?: string
  lineOpacity?: number
  lineStyle?: RollingVwapLineStyle
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
    lineStyle: lineChartStrokeStyleToChartLineStyle(lineStyle),
    priceLineVisible: false,
    lastValueVisible: true,
    crosshairMarkerVisible: false,
    pointMarkersVisible: false,
  }
}

export const ROLLING_VWAP_CENTER_LINE_OPTIONS = rollingVwapCenterLineOptions()

export const ROLLING_VWAP_LINE_CHART_OPTIONS = ROLLING_VWAP_CENTER_LINE_OPTIONS

function rollingVwapBandLineOptions(
  lineWidth: RollingVwapLineWidth = DEFAULT_ROLLING_VWAP_LINE_WIDTH,
  lineStyle: RollingVwapLineStyle = DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE,
) {
  return {
    lineWidth,
    lineStyle: lineChartStrokeStyleToChartLineStyle(lineStyle),
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

/** One attached band-pair fill per deviation band (band 1–3). */
export type RollingVwapBandFillAttachments = Record<
  RollingVwapBandFillKey,
  SessionVwapBandSeriesAttachment
>

export type RollingVwapChartSeriesBundle = {
  center: ISeriesApi<'Line'>
  bands: Record<RollingVwapBandSeriesKey, ISeriesApi<'Line'>>
  ordered: ISeriesApi<'Line'>[]
  bandFills?: RollingVwapBandFillAttachments
}

const BAND_COLOR_KEYS: Record<RollingVwapBandSeriesKey, keyof RollingVwapBandColors> = {
  upper1: 'band1',
  lower1: 'band1',
  upper2: 'band2',
  lower2: 'band2',
  upper3: 'band3',
  lower3: 'band3',
}

export const ROLLING_VWAP_BAND_FILL_KEYS = ['band1', 'band2', 'band3'] as const

export type RollingVwapBandFillKey = (typeof ROLLING_VWAP_BAND_FILL_KEYS)[number]

/** Band colors, their independent opacities and line styles, plus the shared fill. */
export type RollingVwapBandStyle = {
  bandColors: RollingVwapBandColors
  bandOpacities: RollingVwapBandOpacities
  bandLineStyles: RollingVwapBandLineStyles
  bandLineWidths: RollingVwapBandLineWidths
  fillColor: string
  fillOpacity: number
}

const BAND_FILL_POINT_KEYS: Record<
  RollingVwapBandFillKey,
  { upper: RollingVwapBandSeriesKey; lower: RollingVwapBandSeriesKey }
> = {
  band1: { upper: 'upper1', lower: 'lower1' },
  band2: { upper: 'upper2', lower: 'lower2' },
  band3: { upper: 'upper3', lower: 'lower3' },
}

/**
 * Projects one band pair onto the shared session-VWAP fill geometry shape so
 * the same primitive/geometry renders the Rolling VWAP band fills.
 */
export function rollingVwapBandFillPoints(
  points: readonly RollingVwapPoint[],
  bandKey: RollingVwapBandFillKey,
): SessionVwapBandPoint[] {
  const keys = BAND_FILL_POINT_KEYS[bandKey]
  return points.map((point) => ({
    time: point.time,
    upper1: point[keys.upper],
    lower1: point[keys.lower],
  }))
}

function syncRollingVwapBandFillData(
  bundle: RollingVwapChartSeriesBundle,
  points: readonly RollingVwapPoint[],
): void {
  if (!bundle.bandFills) return
  for (const bandKey of ROLLING_VWAP_BAND_FILL_KEYS) {
    bundle.bandFills[bandKey].updateBandData(rollingVwapBandFillPoints(points, bandKey))
  }
}

/** Applies the instance's one Background color + opacity to all three band fills. */
export function applyRollingVwapChartBandFillStyle(
  bundle: RollingVwapChartSeriesBundle,
  settings: Pick<RollingVwapSettings, 'fillColor' | 'fillOpacity'>,
): void {
  if (!bundle.bandFills) return
  const fillStyle = resolveRollingVwapBandFillStyle(settings)
  for (const bandKey of ROLLING_VWAP_BAND_FILL_KEYS) {
    bundle.bandFills[bandKey].setFillStyle(fillStyle)
  }
}

/** Band color with its own opacity folded into the CSS color string. */
export function rollingVwapBandSeriesColor(
  bandStyle: RollingVwapBandStyle,
  colorKey: keyof RollingVwapBandColors,
): string {
  return marketStyleColorWithOpacity(
    bandStyle.bandColors[colorKey],
    bandStyle.bandOpacities[colorKey],
  )
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

/** Center-line width only; each band pair applies its own width separately. */
export function applyRollingVwapChartLineWidth(
  bundle: RollingVwapChartSeriesBundle,
  lineWidth: RollingVwapLineWidth,
): void {
  bundle.center.applyOptions({ lineWidth })
}

/** Applies each deviation band pair's own independent 1–4 px width. */
export function applyRollingVwapChartBandLineWidths(
  bundle: RollingVwapChartSeriesBundle,
  bandStyle: Pick<RollingVwapBandStyle, 'bandLineWidths'>,
): void {
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const colorKey = BAND_COLOR_KEYS[key]
    bundle.bands[key].applyOptions({ lineWidth: bandStyle.bandLineWidths[colorKey] })
  }
}

export function applyRollingVwapCenterLinePresentation(
  center: ISeriesApi<'Line'>,
  settings: Pick<RollingVwapSettings, 'lineColor' | 'lineOpacity' | 'lineStyle'>,
): void {
  center.applyOptions({
    color: rollingVwapCenterLineRgbaColor(settings.lineColor, settings.lineOpacity),
    lineStyle: lineChartStrokeStyleToChartLineStyle(settings.lineStyle),
  })
}

export function createRollingVwapChartSeriesBundle(
  chart: IChartApi,
  bandStyle: RollingVwapBandStyle,
  options?: {
    title?: string
    lineWidth?: RollingVwapLineWidth
    lineColor?: string
    lineOpacity?: number
    lineStyle?: RollingVwapLineStyle
  },
): RollingVwapChartSeriesBundle {
  const lineWidth = options?.lineWidth ?? DEFAULT_ROLLING_VWAP_LINE_WIDTH
  // Overlays belong to the candle pane, which is not pane 0 when the
  // aggregated-liquidations pane sits above the candles.
  const paneIndex = resolveCandlePaneIndex(chart)
  const center = chart.addSeries(LineSeries, {
    ...rollingVwapCenterLineOptions({
      lineWidth,
      lineColor: options?.lineColor,
      lineOpacity: options?.lineOpacity,
      lineStyle: options?.lineStyle,
    }),
    title: options?.title ?? '',
    visible: false,
  }, paneIndex)

  const bands = {} as Record<RollingVwapBandSeriesKey, ISeriesApi<'Line'>>
  const ordered: ISeriesApi<'Line'>[] = [center]

  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const colorKey = BAND_COLOR_KEYS[key]
    const series = chart.addSeries(LineSeries, {
      ...rollingVwapBandLineOptions(
        bandStyle.bandLineWidths[colorKey],
        bandStyle.bandLineStyles[colorKey],
      ),
      color: rollingVwapBandSeriesColor(bandStyle, colorKey),
      visible: false,
    }, paneIndex)
    bands[key] = series
    ordered.push(series)
  }

  const bandFills = {} as RollingVwapBandFillAttachments
  const fillStyle = resolveRollingVwapBandFillStyle(bandStyle)
  for (const bandKey of ROLLING_VWAP_BAND_FILL_KEYS) {
    bandFills[bandKey] = attachSessionVwapBandSeriesPrimitive(center, {
      points: [],
      visible: false,
      fillStyle,
    })
  }

  return { center, bands, ordered, bandFills }
}

export function removeRollingVwapChartSeriesBundle(
  chart: IChartApi,
  bundle: RollingVwapChartSeriesBundle,
): void {
  if (bundle.bandFills) {
    for (const bandKey of ROLLING_VWAP_BAND_FILL_KEYS) {
      bundle.bandFills[bandKey].dispose()
    }
  }
  for (const series of bundle.ordered) {
    chart.removeSeries(series)
  }
}

export function applyRollingVwapChartBandColors(
  bundle: RollingVwapChartSeriesBundle,
  bandStyle: RollingVwapBandStyle,
): void {
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const colorKey = BAND_COLOR_KEYS[key]
    bundle.bands[key].applyOptions({ color: rollingVwapBandSeriesColor(bandStyle, colorKey) })
  }
}

/** Applies each deviation band pair's own `solid` / `dotted` stroke style. */
export function applyRollingVwapChartBandLineStyles(
  bundle: RollingVwapChartSeriesBundle,
  bandStyle: RollingVwapBandStyle,
): void {
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const colorKey = BAND_COLOR_KEYS[key]
    bundle.bands[key].applyOptions({
      lineStyle: lineChartStrokeStyleToChartLineStyle(bandStyle.bandLineStyles[colorKey]),
    })
  }
}

export function applyRollingVwapChartInstancePresentation(
  bundle: RollingVwapChartSeriesBundle,
  instance: RollingVwapInstance,
  interval: CandleInterval,
): void {
  applyRollingVwapChartBandColors(bundle, instance.settings)
  applyRollingVwapChartBandLineWidths(bundle, instance.settings)
  applyRollingVwapChartBandLineStyles(bundle, instance.settings)
  applyRollingVwapChartBandFillStyle(bundle, instance.settings)
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
  syncRollingVwapBandFillData(bundle, points)
}

export function clearRollingVwapChartSeriesData(bundle: RollingVwapChartSeriesBundle): void {
  for (const series of bundle.ordered) {
    series.setData([])
  }
  syncRollingVwapBandFillData(bundle, [])
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

/** Resolved compatibility for an instance on the active chart interval. */
export function getRollingVwapInstanceTimeframeCompatibility(
  instance: RollingVwapInstance,
  interval: CandleInterval,
): RollingVwapTimeframeCompatibility {
  return rollingVwapSettingsTimeframeCompatibility(instance.settings.fixedTimePeriod, interval)
}

export function setRollingVwapInstanceSeriesVisibility(
  bundle: RollingVwapChartSeriesBundle,
  instance: RollingVwapInstance,
  interval: CandleInterval,
): void {
  const compatibility = getRollingVwapInstanceTimeframeCompatibility(instance, interval)
  const instanceVisible = instance.enabled && compatibility.supported
  const title = rollingVwapInstancePeriodLabel(instance, interval)
  bundle.center.applyOptions({
    visible: instanceVisible,
    title: compatibility.supported
      ? title
      : `${title} (${rollingVwapTimeframeCompatibilityReason(compatibility) ?? 'unsupported'})`,
    lastValueVisible: instanceVisible,
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

  bundle.bandFills?.band1.setBandVisible(
    bandPairVisible(instanceVisible, multipliers.multiplier1),
  )
  bundle.bandFills?.band2.setBandVisible(
    bandPairVisible(instanceVisible, multipliers.multiplier2),
  )
  bundle.bandFills?.band3.setBandVisible(
    bandPairVisible(instanceVisible, multipliers.multiplier3),
  )
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
    displaySequence: 1,
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
  syncRollingVwapBandFillData(bundle, points)
}
