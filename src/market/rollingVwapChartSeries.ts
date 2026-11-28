import { LineSeries, type IChartApi, type ISeriesApi, type UTCTimestamp } from 'lightweight-charts'
import {
  rollingVwapSettingsTimeframeCompatibility,
  rollingVwapTimeframeCompatibilityReason,
  type RollingVwapTimeframeCompatibility,
} from './rollingVwapMinimumTimeframe.ts'
import { rollingVwapInstancePeriodLabel, type RollingVwapInstance } from './rollingVwapInstances.ts'
import type { RollingVwapPoint } from './rollingVwap.ts'
import {
  computeRollingVwapPointsForSettings,
  DEFAULT_ROLLING_VWAP_LINE_COLOR,
  DEFAULT_ROLLING_VWAP_LINE_OPACITY,
  DEFAULT_ROLLING_VWAP_LINE_STYLE,
  DEFAULT_ROLLING_VWAP_LINE_WIDTH,
  resolveRollingVwapBandDistances,
  resolveRollingVwapBandFillStyle,
  rollingVwapCenterLineRgbaColor,
  type RollingVwapBandColors,
  type RollingVwapLineStyle,
  type RollingVwapLineWidth,
  type RollingVwapSettings,
} from './rollingVwapSettings.ts'
import {
  resolveRollingVwapBandPrimitiveStyle,
  ROLLING_VWAP_BAND_VALUE_KEYS,
  ROLLING_VWAP_BAND_VALUE_KEY_PAIR,
  type RollingVwapBandStyle,
  type RollingVwapBandValueKey,
} from './rollingVwapBandRenderGeometry.ts'
import {
  attachRollingVwapBandSeriesPrimitive,
  type RollingVwapBandSeriesAttachment,
} from './rollingVwapBandSeriesPrimitive.ts'
import { lineChartStrokeStyleToChartLineStyle } from './lineChartStroke.ts'
import { marketStyleColorWithOpacity } from './marketStylePalette.ts'
import type { CandleInterval, MarketCandle } from './types.ts'
import { resolveCandlePaneIndex } from './candlePane.ts'

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

export const ROLLING_VWAP_BAND_SERIES_KEYS = ROLLING_VWAP_BAND_VALUE_KEYS

export type RollingVwapBandSeriesKey = RollingVwapBandValueKey

export type RollingVwapValueKey = 'vwap' | RollingVwapBandSeriesKey

export type RollingVwapLinePoint =
  | { time: UTCTimestamp; value: number }
  | { time: UTCTimestamp }

/** Re-exported so callers keep one Rolling VWAP band style vocabulary. */
export type { RollingVwapBandStyle }

/**
 * The instance's one native centre series plus its one band primitive. There
 * are no per-band native series any more: hit testing, selection and styling
 * resolve through the primitive instead of `ordered` series identities.
 */
export type RollingVwapChartSeriesBundle = {
  center: ISeriesApi<'Line'>
  bands: RollingVwapBandSeriesAttachment
}

/** Applies the instance's one Background color + opacity to all three band fills. */
export function applyRollingVwapChartBandFillStyle(
  bundle: RollingVwapChartSeriesBundle,
  settings: Pick<RollingVwapSettings, 'fillColor' | 'fillOpacity'>,
): void {
  const style = bundle.bands.getStyle()
  const fillStyle = resolveRollingVwapBandFillStyle(settings)
  if (style.fillStyle === fillStyle) return
  bundle.bands.setStyle({ ...style, fillStyle })
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

/** Center-line width only; each band pair applies its own width on the primitive. */
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
  const style = bundle.bands.getStyle()
  const outlines = { ...style.outlines }
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const pair = ROLLING_VWAP_BAND_VALUE_KEY_PAIR[key]
    outlines[key] = { ...outlines[key], widthPx: bandStyle.bandLineWidths[pair] }
  }
  bundle.bands.setStyle({ ...style, outlines })
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
  const center = chart.addSeries(
    LineSeries,
    {
      ...rollingVwapCenterLineOptions({
        lineWidth,
        lineColor: options?.lineColor,
        lineOpacity: options?.lineOpacity,
        lineStyle: options?.lineStyle,
      }),
      title: options?.title ?? '',
      visible: false,
    },
    paneIndex,
  )

  const bands = attachRollingVwapBandSeriesPrimitive(center, {
    points: [],
    visible: false,
    bandVisible: { band1: false, band2: false, band3: false },
    style: resolveRollingVwapBandPrimitiveStyle(bandStyle),
    haloPart: null,
  })

  return { center, bands }
}

export function removeRollingVwapChartSeriesBundle(
  chart: IChartApi,
  bundle: RollingVwapChartSeriesBundle,
): void {
  bundle.bands.dispose()
  chart.removeSeries(bundle.center)
}

export function applyRollingVwapChartBandColors(
  bundle: RollingVwapChartSeriesBundle,
  bandStyle: RollingVwapBandStyle,
): void {
  const style = bundle.bands.getStyle()
  const outlines = { ...style.outlines }
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const colorKey = ROLLING_VWAP_BAND_VALUE_KEY_PAIR[key]
    outlines[key] = {
      ...outlines[key],
      color: rollingVwapBandSeriesColor(bandStyle, colorKey),
    }
  }
  bundle.bands.setStyle({ ...style, outlines })
}

/** Applies each deviation band pair's own `solid` / `dotted` stroke style. */
export function applyRollingVwapChartBandLineStyles(
  bundle: RollingVwapChartSeriesBundle,
  bandStyle: Pick<RollingVwapBandStyle, 'bandLineStyles'>,
): void {
  const style = bundle.bands.getStyle()
  const outlines = { ...style.outlines }
  for (const key of ROLLING_VWAP_BAND_SERIES_KEYS) {
    const pair = ROLLING_VWAP_BAND_VALUE_KEY_PAIR[key]
    outlines[key] = { ...outlines[key], lineStyle: bandStyle.bandLineStyles[pair] }
  }
  bundle.bands.setStyle({ ...style, outlines })
}

function applyRollingVwapBandPrimitivePresentation(
  bundle: RollingVwapChartSeriesBundle,
  settings: RollingVwapSettings,
): void {
  bundle.bands.setStyle(resolveRollingVwapBandPrimitiveStyle(settings))
}

export function applyRollingVwapChartInstancePresentation(
  bundle: RollingVwapChartSeriesBundle,
  instance: RollingVwapInstance,
  interval: CandleInterval,
): void {
  applyRollingVwapBandPrimitivePresentation(bundle, instance.settings)
  applyRollingVwapChartLineWidth(bundle, instance.settings.lineWidth)
  applyRollingVwapCenterLinePresentation(bundle.center, instance.settings)
  bundle.center.applyOptions({
    title: rollingVwapInstancePeriodLabel(instance, interval),
    lastValueVisible: true,
    priceLineVisible: false,
  })
}

export function setRollingVwapChartSeriesData(
  bundle: RollingVwapChartSeriesBundle,
  points: readonly RollingVwapPoint[],
): void {
  bundle.center.setData(rollingVwapPointsToLineData(points, 'vwap'))
  bundle.bands.setPoints(points)
}

export function clearRollingVwapChartSeriesData(bundle: RollingVwapChartSeriesBundle): void {
  bundle.center.setData([])
  bundle.bands.setPoints([])
}

export function updateRollingVwapChartSeriesLast(
  bundle: RollingVwapChartSeriesBundle,
  point: RollingVwapPoint,
): void {
  bundle.center.update(rollingVwapPointToLinePoint(point, 'vwap'))
  bundle.bands.updateLastPoint(point)
}

function bandPairVisible(instanceVisible: boolean, distance: number): boolean {
  return instanceVisible && distance > 0
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

  const distances = resolveRollingVwapBandDistances(instance.settings)
  bundle.bands.setVisibility(instanceVisible, {
    band1: bandPairVisible(instanceVisible, distances.band1),
    band2: bandPairVisible(instanceVisible, distances.band2),
    band3: bandPairVisible(instanceVisible, distances.band3),
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
    displaySequence: 1,
  }
  setRollingVwapInstanceSeriesVisibility(bundle, legacyInstance, params.interval)
}

/** Recompute from candles and patch only the latest point on the centre series. */
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
