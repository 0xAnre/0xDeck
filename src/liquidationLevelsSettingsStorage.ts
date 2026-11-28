import {
  DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
  sanitizeLiquidationLevelsSettings,
  type LiquidationLevelsSettings,
} from './market/liquidationLevelsSettings.ts'

/**
 * Per-panel live liquidation-level profile settings.
 *
 * Keyed by the unique panel instance id like every other `0xdeck-widget-*`
 * record, so two BTC Perp panels can style their profile differently and the
 * record lives inside its workspace with the panel.
 */
export const WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY =
  '0xdeck-widget-liquidation-levels-settings'

function loadWidgetLiquidationLevelsSettingsMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetLiquidationLevelsSettings(
  panelId: string,
): LiquidationLevelsSettings {
  const map = loadWidgetLiquidationLevelsSettingsMap()
  if (!Object.hasOwn(map, panelId)) {
    return { ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS }
  }
  return sanitizeLiquidationLevelsSettings(map[panelId])
}

export function saveWidgetLiquidationLevelsSettings(
  panelId: string,
  settings: LiquidationLevelsSettings,
): void {
  const map = loadWidgetLiquidationLevelsSettingsMap()
  map[panelId] = sanitizeLiquidationLevelsSettings(settings)
  localStorage.setItem(
    WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY,
    JSON.stringify(map),
  )
}
