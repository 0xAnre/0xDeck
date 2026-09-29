export const MARKET_INDICATOR_IDS = ['triple-ema', 'daily-vwap', 'weekly-vwap'] as const

export type MarketIndicatorId = (typeof MARKET_INDICATOR_IDS)[number]

const INDICATOR_ID_SET = new Set<string>(MARKET_INDICATOR_IDS)

export function isMarketIndicatorId(value: string): value is MarketIndicatorId {
  return INDICATOR_ID_SET.has(value)
}

export const MARKET_INDICATOR_LABELS: Record<MarketIndicatorId, string> = {
  'triple-ema': '3 EMA',
  'daily-vwap': 'Daily VWAP',
  'weekly-vwap': 'Weekly VWAP',
}

export const DEFAULT_MARKET_INDICATORS: MarketIndicatorId[] = []

export const MARKET_INDICATOR_OPTIONS = MARKET_INDICATOR_IDS.map((id) => ({
  value: id,
  label: MARKET_INDICATOR_LABELS[id],
}))
