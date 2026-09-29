import type { CandleInterval } from '@/market/types'
import { CANDLE_INTERVALS, DEFAULT_CANDLE_INTERVAL } from '@/market/types'

export const WIDGET_MARKET_INTERVAL_STORAGE_KEY = '0xdeck-widget-market-intervals'

const VALID_INTERVALS = new Set<string>(CANDLE_INTERVALS)

function loadWidgetMarketIntervalMap(): Record<string, CandleInterval> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_INTERVAL_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, CandleInterval] =>
          typeof entry[0] === 'string' && VALID_INTERVALS.has(String(entry[1])),
      ),
    )
  } catch {
    return {}
  }
}

export function loadWidgetMarketInterval(panelId: string): CandleInterval {
  return loadWidgetMarketIntervalMap()[panelId] ?? DEFAULT_CANDLE_INTERVAL
}

export function saveWidgetMarketInterval(panelId: string, interval: CandleInterval) {
  const map = loadWidgetMarketIntervalMap()
  map[panelId] = interval
  localStorage.setItem(WIDGET_MARKET_INTERVAL_STORAGE_KEY, JSON.stringify(map))
}

export const MARKET_INTERVAL_OPTIONS = CANDLE_INTERVALS.map((value) => ({
  value,
  label: value,
}))
