import {
  MARKET_EXCHANGE_OPTIONS,
  isMarketExchange,
} from './market/marketExchange.ts'
import {
  DEFAULT_MARKET_EXCHANGE,
  type MarketExchange,
} from './market/types.ts'

export const WIDGET_MARKET_EXCHANGE_STORAGE_KEY = '0xdeck-widget-market-exchanges'

export { MARKET_EXCHANGE_OPTIONS }

function loadWidgetMarketExchangeMap(): Record<string, MarketExchange> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_EXCHANGE_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, MarketExchange] =>
          typeof entry[0] === 'string' && isMarketExchange(entry[1]),
      ),
    )
  } catch {
    return {}
  }
}

export function loadWidgetMarketExchange(panelId: string): MarketExchange {
  return loadWidgetMarketExchangeMap()[panelId] ?? DEFAULT_MARKET_EXCHANGE
}

export function saveWidgetMarketExchange(
  panelId: string,
  exchange: MarketExchange,
) {
  const map = loadWidgetMarketExchangeMap()
  map[panelId] = exchange
  localStorage.setItem(WIDGET_MARKET_EXCHANGE_STORAGE_KEY, JSON.stringify(map))
}
