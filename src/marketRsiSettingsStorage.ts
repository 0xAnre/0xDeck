import { createDefaultRsiSettings, sanitizeRsiSettings, type RsiSettings } from './market/rsi.ts'

export const WIDGET_MARKET_RSI_SETTINGS_STORAGE_KEY = '0xdeck-widget-market-rsi-settings'

function loadRsiSettingsMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_RSI_SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetRsiSettings(panelId: string): RsiSettings {
  const map = loadRsiSettingsMap()
  if (!(panelId in map)) return createDefaultRsiSettings()
  return sanitizeRsiSettings(map[panelId])
}

export function saveWidgetRsiSettings(panelId: string, settings: RsiSettings): void {
  const map = loadRsiSettingsMap()
  map[panelId] = sanitizeRsiSettings(settings)
  localStorage.setItem(WIDGET_MARKET_RSI_SETTINGS_STORAGE_KEY, JSON.stringify(map))
}
