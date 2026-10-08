import type { CandleInterval } from './market/types.ts'
import { CANDLE_INTERVALS, DEFAULT_CANDLE_INTERVAL } from './market/types.ts'

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

const MARKET_INTERVAL_LABELS: Record<CandleInterval, string> = {
  '1m': '1m',
  '5m': '5m',
  '30m': '30m',
  '1h': '1H',
  '2h': '2H',
  '4h': '4h',
  '1d': '1d',
  '1w': '1w',
}

export const MARKET_INTERVAL_OPTIONS = CANDLE_INTERVALS.map((value) => ({
  value,
  label: MARKET_INTERVAL_LABELS[value],
}))
