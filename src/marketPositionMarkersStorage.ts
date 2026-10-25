export const WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY =
  '0xdeck-widget-market-position-markers'

function loadWidgetMarketPositionMarkersMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, boolean] =>
          typeof entry[0] === 'string' && typeof entry[1] === 'boolean',
      ),
    )
  } catch {
    return {}
  }
}

/** Per-widget Position Markers toggle; unset/invalid defaults to OFF. */
export function loadWidgetMarketPositionMarkers(panelId: string): boolean {
  return loadWidgetMarketPositionMarkersMap()[panelId] === true
}

export function saveWidgetMarketPositionMarkers(panelId: string, enabled: boolean) {
  const map = loadWidgetMarketPositionMarkersMap()
  map[panelId] = enabled
  localStorage.setItem(
    WIDGET_MARKET_POSITION_MARKERS_STORAGE_KEY,
    JSON.stringify(map),
  )
}
