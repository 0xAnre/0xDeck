import {
  DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS,
  sanitizeAggregatedLiquidationsSettings,
  type AggregatedLiquidationsSettings,
} from './market/aggregatedLiquidationsSettings.ts'

export const WIDGET_LIQUIDATIONS_SETTINGS_STORAGE_KEY =
  '0xdeck-widget-liquidations-settings'

function loadWidgetLiquidationsSettingsMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_LIQUIDATIONS_SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetLiquidationsSettings(
  panelId: string,
): AggregatedLiquidationsSettings {
  const map = loadWidgetLiquidationsSettingsMap()
  if (!Object.hasOwn(map, panelId)) {
    return { ...DEFAULT_AGGREGATED_LIQUIDATIONS_SETTINGS }
  }
  return sanitizeAggregatedLiquidationsSettings(map[panelId])
}

export function saveWidgetLiquidationsSettings(
  panelId: string,
  settings: AggregatedLiquidationsSettings,
): void {
  const map = loadWidgetLiquidationsSettingsMap()
  map[panelId] = sanitizeAggregatedLiquidationsSettings(settings)
  localStorage.setItem(
    WIDGET_LIQUIDATIONS_SETTINGS_STORAGE_KEY,
    JSON.stringify(map),
  )
}
