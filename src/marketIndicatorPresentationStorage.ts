import {
  isLineChartHexColor,
  isLineChartStrokeStyle,
  isLineChartStrokeWidth,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './market/lineChartStroke.ts'
import { isMarketIndicatorId, type MarketIndicatorId } from './market/indicators.ts'

export type MarketIndicatorPresentation = {
  color?: string
  lineWidth?: LineChartStrokeWidth
  lineStyle?: LineChartStrokeStyle
}

export const WIDGET_MARKET_INDICATOR_PRESENTATION_STORAGE_KEY =
  '0xdeck-widget-market-indicator-presentation'

function sanitizePresentation(value: unknown): MarketIndicatorPresentation | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const presentation: MarketIndicatorPresentation = {}
  if (isLineChartHexColor(record.color)) {
    presentation.color = record.color
  }
  if (isLineChartStrokeWidth(record.lineWidth)) {
    presentation.lineWidth = record.lineWidth
  }
  if (isLineChartStrokeStyle(record.lineStyle)) {
    presentation.lineStyle = record.lineStyle
  }
  return Object.keys(presentation).length > 0 ? presentation : {}
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
  return sanitizePresentation(entry) ?? {}
}

export function saveWidgetMarketIndicatorPresentation(
  panelId: string,
  indicatorId: MarketIndicatorId,
  presentation: MarketIndicatorPresentation,
): void {
  const map = loadPresentationMap()
  const panel = map[panelId] ?? {}
  const sanitized = sanitizePresentation(presentation) ?? {}
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
