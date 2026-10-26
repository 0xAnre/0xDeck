import {
  DEFAULT_ORDER_BOOK_DEPTH_SETTINGS,
  sanitizeOrderBookDepthSettings,
  type OrderBookDepthSettings,
} from './market/orderBookDepthSettings.ts'

export const WIDGET_ORDER_BOOK_DEPTH_SETTINGS_STORAGE_KEY =
  '0xdeck-widget-order-book-depth-settings'

function loadOrderBookDepthSettingsMap(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(WIDGET_ORDER_BOOK_DEPTH_SETTINGS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}

export function loadWidgetOrderBookDepthSettings(
  panelId: string,
): OrderBookDepthSettings {
  const map = loadOrderBookDepthSettingsMap()
  if (!Object.hasOwn(map, panelId)) {
    return { ...DEFAULT_ORDER_BOOK_DEPTH_SETTINGS }
  }
  return sanitizeOrderBookDepthSettings(map[panelId])
}

export function saveWidgetOrderBookDepthSettings(
  panelId: string,
  settings: OrderBookDepthSettings,
): void {
  const map = loadOrderBookDepthSettingsMap()
  map[panelId] = sanitizeOrderBookDepthSettings(settings)
  localStorage.setItem(
    WIDGET_ORDER_BOOK_DEPTH_SETTINGS_STORAGE_KEY,
    JSON.stringify(map),
  )
}
