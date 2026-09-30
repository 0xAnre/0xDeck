import {
  createDefaultRollingVwapSettings,
  sanitizeRollingVwapSettings,
  type RollingVwapSettings,
} from './market/rollingVwapSettings.ts'

export const WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY = '0xdeck-widget-rolling-vwap-settings'

function loadWidgetRollingVwapSettingsMap(): Record<string, RollingVwapSettings> {
  try {
    const raw = localStorage.getItem(WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, unknown] => typeof entry[0] === 'string')
        .map(([panelId, value]) => [panelId, sanitizeRollingVwapSettings(value)]),
    )
  } catch {
    return {}
  }
}

export function loadWidgetRollingVwapSettings(panelId: string): RollingVwapSettings {
  const map = loadWidgetRollingVwapSettingsMap()
  if (!(panelId in map)) {
    return createDefaultRollingVwapSettings()
  }
  return sanitizeRollingVwapSettings(map[panelId])
}

export function saveWidgetRollingVwapSettings(panelId: string, settings: RollingVwapSettings): void {
  const map = loadWidgetRollingVwapSettingsMap()
  map[panelId] = sanitizeRollingVwapSettings(settings)
  localStorage.setItem(WIDGET_ROLLING_VWAP_SETTINGS_STORAGE_KEY, JSON.stringify(map))
}
