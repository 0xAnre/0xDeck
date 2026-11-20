import {
  DEFAULT_POSITION_MARKER_SETTINGS,
  sanitizePositionMarkerSettings,
  type PositionMarkerSettings,
} from './market/positionMarkers.ts'

export const WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY =
  '0xdeck-widget-market-position-markers'

/**
 * Read the whole per-panel map through the sanitizer, so a legacy boolean entry
 * (`true` / `false`) becomes `{ enabled, size: 1.25 }` on read and every other
 * entry becomes a valid settings object. The next save writes the whole map in
 * the current shape.
 */
function loadWidgetMarketPositionMarkerSettingsMap(): Record<
  string,
  PositionMarkerSettings
> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).map(([panelId, value]) => [
        panelId,
        sanitizePositionMarkerSettings(value),
      ]),
    )
  } catch {
    return {}
  }
}

/**
 * Per-widget Position Markers settings. Unset or invalid records default to OFF
 * at the default marker size; a legacy boolean record keeps its toggle state.
 */
export function loadWidgetMarketPositionMarkerSettings(
  panelId: string,
): PositionMarkerSettings {
  return (
    loadWidgetMarketPositionMarkerSettingsMap()[panelId] ?? {
      ...DEFAULT_POSITION_MARKER_SETTINGS,
    }
  )
}

export function saveWidgetMarketPositionMarkerSettings(
  panelId: string,
  settings: PositionMarkerSettings,
) {
  const map = loadWidgetMarketPositionMarkerSettingsMap()
  map[panelId] = sanitizePositionMarkerSettings(settings)
  localStorage.setItem(
    WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
    JSON.stringify(map),
  )
}
