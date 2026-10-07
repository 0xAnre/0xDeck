import {
  DEFAULT_MARKET_INDICATORS,
  isMarketIndicatorId,
  type MarketIndicatorId,
} from './market/indicators.ts'

export const WIDGET_MARKET_INDICATORS_STORAGE_KEY = '0xdeck-widget-market-indicators'

function sanitizeIndicatorList(value: unknown): MarketIndicatorId[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<MarketIndicatorId>()
  const result: MarketIndicatorId[] = []
  for (const item of value) {
    if (typeof item !== 'string' || !isMarketIndicatorId(item) || seen.has(item)) continue
    seen.add(item)
    result.push(item)
  }
  return result
}

function loadWidgetMarketIndicatorsMap(): Record<string, MarketIndicatorId[]> {
  try {
    const raw = localStorage.getItem(WIDGET_MARKET_INDICATORS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, unknown] => typeof entry[0] === 'string')
        .map(([panelId, value]) => [panelId, sanitizeIndicatorList(value)]),
    )
  } catch {
    return {}
  }
}

export function loadWidgetMarketIndicators(panelId: string): MarketIndicatorId[] {
  const map = loadWidgetMarketIndicatorsMap()
  if (!(panelId in map)) {
    return [...DEFAULT_MARKET_INDICATORS]
  }
  return map[panelId]
}

export function saveWidgetMarketIndicators(panelId: string, indicators: MarketIndicatorId[]) {
  const map = loadWidgetMarketIndicatorsMap()
  map[panelId] = sanitizeIndicatorList(indicators)
  localStorage.setItem(WIDGET_MARKET_INDICATORS_STORAGE_KEY, JSON.stringify(map))
}
