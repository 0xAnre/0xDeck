import {
  DEFAULT_LIQUIDATION_LEVELS_SETTINGS,
  sanitizeLiquidationLevelsSettings,
  type LiquidationLevelsSettings,
} from './market/liquidationLevelsSettings.ts'
import {
  PRICE_LEVEL_SETTINGS_STORAGE_KEY,
  type PriceLevelKind,
} from './market/priceLevelsKind.ts'

/**
 * Per-panel live liquidation-level profile settings.
 *
 * Keyed by the unique panel instance id like every other `0xdeck-widget-*`
 * record, so two BTC Perp panels can style their profile differently and the
 * record lives inside its workspace with the panel.
 */
export const WIDGET_LIQUIDATION_LEVELS_SETTINGS_STORAGE_KEY =
  PRICE_LEVEL_SETTINGS_STORAGE_KEY.liquidation

function loadWidgetPriceLevelsSettingsMap(
  storageKey: string,
): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(storageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Per-panel settings of one price-level profile. Every profile owns its own
 * record, so the liquidation profile's defaults, storage key and persisted
 * values stay exactly as they were before the trigger-order profiles existed.
 */
export function loadWidgetPriceLevelsSettings(
  panelId: string,
  kind: PriceLevelKind,
): LiquidationLevelsSettings {
  const map = loadWidgetPriceLevelsSettingsMap(PRICE_LEVEL_SETTINGS_STORAGE_KEY[kind])
  if (!Object.hasOwn(map, panelId)) {
    return { ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS }
  }
  return sanitizeLiquidationLevelsSettings(map[panelId])
}

export function saveWidgetPriceLevelsSettings(
  panelId: string,
  kind: PriceLevelKind,
  settings: LiquidationLevelsSettings,
): void {
  const storageKey = PRICE_LEVEL_SETTINGS_STORAGE_KEY[kind]
  const map = loadWidgetPriceLevelsSettingsMap(storageKey)
  map[panelId] = sanitizeLiquidationLevelsSettings(settings)
  localStorage.setItem(storageKey, JSON.stringify(map))
}

/** Liquidation-profile aliases (unchanged key and behaviour). */
export function loadWidgetLiquidationLevelsSettings(
  panelId: string,
): LiquidationLevelsSettings {
  return loadWidgetPriceLevelsSettings(panelId, 'liquidation')
}

export function saveWidgetLiquidationLevelsSettings(
  panelId: string,
  settings: LiquidationLevelsSettings,
): void {
  saveWidgetPriceLevelsSettings(panelId, 'liquidation', settings)
}
