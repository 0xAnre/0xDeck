import {
  isLineChartHexColor,
  isLineChartStrokeWidth,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './market/lineChartStroke.ts'
import { isMarketStyleOpacityPercent } from './market/marketStylePalette.ts'
import { isMarketIndicatorId, type MarketIndicatorId } from './market/indicators.ts'
import { VWAP_CHART_SERIES_KEYS, type VwapChartSeriesKey } from './market/vwapChartLineStyles.ts'

/** Per-line style overrides for the time-based VWAP center and band lines. */
export type MarketIndicatorSeriesStyle = {
  color?: string
  opacity?: number
  lineWidth?: LineChartStrokeWidth
  lineStyle?: LineChartStrokeStyle
}

export type MarketIndicatorSeriesStyles = Partial<
  Record<VwapChartSeriesKey, MarketIndicatorSeriesStyle>
>

export type MarketIndicatorPresentation = {
  color?: string
  opacity?: number
  lineWidth?: LineChartStrokeWidth
  lineStyle?: LineChartStrokeStyle
  /**
   * Independent per-series overrides for the time-based VWAP center line and
   * previous-session upper/lower band lines. Missing series/fields fall back to
   * the flat color/opacity/lineWidth/lineStyle above, which keeps pre-#192
   * saved presentations rendering exactly as before.
   */
  series?: MarketIndicatorSeriesStyles
  /** Session VWAP band fill color; independent from the line color. */
  fillColor?: string
  /** Session VWAP band fill opacity percent (0 hides the fill). */
  fillOpacity?: number
}

export const WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY =
  '0xdeck-widget-market-indicator-presentation'

function sanitizeSeriesStyle(value: unknown): MarketIndicatorSeriesStyle | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const style: MarketIndicatorSeriesStyle = {}
  if (isLineChartHexColor(record.color)) {
    style.color = record.color
  }
  if (isMarketStyleOpacityPercent(record.opacity)) {
    style.opacity = record.opacity
  }
  if (isLineChartStrokeWidth(record.lineWidth)) {
    style.lineWidth = record.lineWidth
  }
  const lineStyle = sanitizeLineChartStrokeStyle(record.lineStyle)
  if (lineStyle !== undefined) {
    style.lineStyle = lineStyle
  }
  return Object.keys(style).length > 0 ? style : null
}

function sanitizeSeriesStyles(value: unknown): MarketIndicatorSeriesStyles | undefined {
  if (!value || typeof value !== 'object') return undefined
  const record = value as Record<string, unknown>
  const series: MarketIndicatorSeriesStyles = {}
  for (const key of VWAP_CHART_SERIES_KEYS) {
    const style = sanitizeSeriesStyle(record[key])
    if (style) series[key] = style
  }
  return Object.keys(series).length > 0 ? series : undefined
}

/** Field-by-field sanitizer for one persisted indicator presentation record. */
export function sanitizeMarketIndicatorPresentation(
  value: unknown,
): MarketIndicatorPresentation | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const presentation: MarketIndicatorPresentation = {}
  if (isLineChartHexColor(record.color)) {
    presentation.color = record.color
  }
  if (isMarketStyleOpacityPercent(record.opacity)) {
    presentation.opacity = record.opacity
  }
  if (isLineChartStrokeWidth(record.lineWidth)) {
    presentation.lineWidth = record.lineWidth
  }
  const lineStyle = sanitizeLineChartStrokeStyle(record.lineStyle)
  if (lineStyle !== undefined) {
    presentation.lineStyle = lineStyle
  }
  const series = sanitizeSeriesStyles(record.series)
  if (series) {
    presentation.series = series
  }
  if (isLineChartHexColor(record.fillColor)) {
    presentation.fillColor = record.fillColor
  }
  if (isMarketStyleOpacityPercent(record.fillOpacity)) {
    presentation.fillOpacity = record.fillOpacity
  }
  return Object.keys(presentation).length > 0 ? presentation : {}
}

/**
 * Overlays changed per-series fields onto the stored series map so saving one
 * line does not drop the overrides of the other two. Each field is sanitized.
 */
export function mergeMarketIndicatorSeriesStyles(
  base: MarketIndicatorSeriesStyles | undefined,
  patch: MarketIndicatorSeriesStyles | undefined,
): MarketIndicatorSeriesStyles | undefined {
  if (!patch) return base
  const merged: MarketIndicatorSeriesStyles = { ...base }
  for (const key of VWAP_CHART_SERIES_KEYS) {
    const patchStyle = patch[key]
    if (!patchStyle) continue
    merged[key] = { ...merged[key], ...patchStyle }
  }
  return Object.keys(merged).length > 0 ? merged : undefined
}

function loadPresentationMap(): Record<string, Record<string, unknown>> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, Record<string, unknown>>
  } catch {
    return {}
  }
}

export function loadWidgetMarketIndicatorPresentation(
  panelId: string,
  indicatorId: MarketIndicatorId,
): MarketIndicatorPresentation {
  if (!isMarketIndicatorId(indicatorId)) return {}
  const map = loadPresentationMap()
  const panel = map[panelId]
  if (!panel || typeof panel !== 'object') return {}
  const entry = panel[indicatorId]
  return sanitizeMarketIndicatorPresentation(entry) ?? {}
}

export function saveWidgetMarketIndicatorPresentation(
  panelId: string,
  indicatorId: MarketIndicatorId,
  presentation: MarketIndicatorPresentation,
): void {
  const map = loadPresentationMap()
  const panel = map[panelId] ?? {}
  const sanitized = sanitizeMarketIndicatorPresentation(presentation) ?? {}
  if (Object.keys(sanitized).length === 0) {
    delete panel[indicatorId]
  } else {
    panel[indicatorId] = sanitized
  }
  if (Object.keys(panel).length === 0) {
    delete map[panelId]
  } else {
    map[panelId] = panel
  }
  localStorage.setItem(WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY, JSON.stringify(map))
}
