export const WIDGET_MARKET_CROSSHAIR_STORAGE_KEY = '0xdeck-widget-market-crosshair'

const DEFAULT_CROSSHAIR_ENABLED = true

function parseStoredCrosshairEnabled(value: unknown): boolean | null {
  if (value === true) return true
  if (value === false) return false
  return null
}

function loadWidgetMarketCrosshairMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_CROSSHAIR_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, unknown] => typeof entry[0] === 'string')
        .map(([panelId, value]) => {
          const enabled = parseStoredCrosshairEnabled(value)
          return enabled === null ? null : [panelId, enabled]
        })
        .filter((entry): entry is [string, boolean] => entry !== null),
    )
  } catch {
    return {}
  }
}

export function loadWidgetMarketCrosshairEnabled(panelId: string): boolean {
  const map = loadWidgetMarketCrosshairMap()
  if (!(panelId in map)) {
    return DEFAULT_CROSSHAIR_ENABLED
  }
  return map[panelId]
}

export function saveWidgetMarketCrosshairEnabled(panelId: string, enabled: boolean) {
  const map = loadWidgetMarketCrosshairMap()
  map[panelId] = enabled === true
  localStorage.setItem(WIDGET_MARKET_CROSSHAIR_STORAGE_KEY, JSON.stringify(map))
}
