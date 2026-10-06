import type { CandleInterval } from './types.ts'

export const MARKET_INDICATOR_IDS = [
  'triple-ema',
  'sma-20',
  'sma-50',
  'sma-100',
  'sma-200',
  'daily-vwap',
  'weekly-vwap',
  'monthly-vwap',
  'quarterly-vwap',
  'yearly-vwap',
  'rolling-vwap',
] as const

export type MarketIndicatorId = (typeof MARKET_INDICATOR_IDS)[number]

const INDICATOR_ID_SET = new Set<string>(MARKET_INDICATOR_IDS)

export function isMarketIndicatorId(value: string): value is MarketIndicatorId {
  return INDICATOR_ID_SET.has(value)
}

export type VwapContextLevel = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'

export const VWAP_CONTEXT_LEVEL_ORDER: readonly VwapContextLevel[] = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
]

export type MarketIndicatorDefinition = {
  label: string
  supportedIntervals: readonly CandleInterval[]
  contextLevel: VwapContextLevel | null
}

export const MARKET_INDICATOR_DEFINITIONS: Record<MarketIndicatorId, MarketIndicatorDefinition> = {
  'triple-ema': {
    label: '3 EMA',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d', '1w'],
    contextLevel: null,
  },
  'sma-20': {
    label: 'SMA 20',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d', '1w'],
    contextLevel: null,
  },
  'sma-50': {
    label: 'SMA 50',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d', '1w'],
    contextLevel: null,
  },
  'sma-100': {
    label: 'SMA 100',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d', '1w'],
    contextLevel: null,
  },
  'sma-200': {
    label: 'SMA 200',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d', '1w'],
    contextLevel: null,
  },
  'daily-vwap': {
    label: 'Daily VWAP',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d'],
    contextLevel: 'daily',
  },
  'weekly-vwap': {
    label: 'Weekly VWAP',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d'],
    contextLevel: 'weekly',
  },
  'monthly-vwap': {
    label: 'Monthly VWAP',
    supportedIntervals: ['4h', '1d'],
    contextLevel: 'monthly',
  },
  'quarterly-vwap': {
    label: 'Quarterly VWAP',
    supportedIntervals: ['4h', '1d'],
    contextLevel: 'quarterly',
  },
  'yearly-vwap': {
    label: 'Yearly VWAP',
    supportedIntervals: ['1d', '1w'],
    contextLevel: 'yearly',
  },
  'rolling-vwap': {
    label: 'Rolling VWAP',
    supportedIntervals: ['1m', '5m', '30m', '4h', '1d', '1w'],
    contextLevel: null,
  },
}

export const MARKET_INDICATOR_LABELS: Record<MarketIndicatorId, string> = Object.fromEntries(
  MARKET_INDICATOR_IDS.map((id) => [id, MARKET_INDICATOR_DEFINITIONS[id].label]),
) as Record<MarketIndicatorId, string>

export const DEFAULT_MARKET_INDICATORS: MarketIndicatorId[] = []

export type MarketIndicatorOption = {
  value: MarketIndicatorId
  label: string
  disabled: boolean
}

export function isIndicatorSupportedOnInterval(
  indicatorId: MarketIndicatorId,
  interval: CandleInterval,
): boolean {
  return MARKET_INDICATOR_DEFINITIONS[indicatorId].supportedIntervals.includes(interval)
}

export function buildMarketIndicatorOptions(interval: CandleInterval): MarketIndicatorOption[] {
  return MARKET_INDICATOR_IDS.map((id) => ({
    value: id,
    label: MARKET_INDICATOR_DEFINITIONS[id].label,
    disabled: !isIndicatorSupportedOnInterval(id, interval),
  }))
}

export function compareVwapContextLevels(a: VwapContextLevel, b: VwapContextLevel): number {
  return VWAP_CONTEXT_LEVEL_ORDER.indexOf(a) - VWAP_CONTEXT_LEVEL_ORDER.indexOf(b)
}

export function vwapContextLevelCovers(
  loaded: VwapContextLevel,
  required: VwapContextLevel,
): boolean {
  return compareVwapContextLevels(loaded, required) >= 0
}

/** Widest VWAP context required by active indicators on this interval; defaults to daily for candle load. */
export function requiredVwapContextLevel(
  indicators: readonly MarketIndicatorId[],
  interval: CandleInterval,
): VwapContextLevel {
  let max: VwapContextLevel = 'daily'
  for (const id of indicators) {
    const def = MARKET_INDICATOR_DEFINITIONS[id]
    if (!def.contextLevel) continue
    if (!isIndicatorSupportedOnInterval(id, interval)) continue
    if (compareVwapContextLevels(def.contextLevel, max) > 0) {
      max = def.contextLevel
    }
  }
  return max
}

export function indicatorContextLevel(indicatorId: MarketIndicatorId): VwapContextLevel | null {
  return MARKET_INDICATOR_DEFINITIONS[indicatorId].contextLevel
}

export function shouldShowVwapIndicatorSeries(params: {
  indicatorId: MarketIndicatorId
  indicatorSelected: boolean
  interval: CandleInterval
  loadedLevel: VwapContextLevel | null
  loadedInterval: CandleInterval | null
}): boolean {
  const { indicatorId, indicatorSelected, interval, loadedLevel, loadedInterval } = params
  if (!indicatorSelected) return false
  if (!isIndicatorSupportedOnInterval(indicatorId, interval)) return false
  const needed = indicatorContextLevel(indicatorId)
  if (!needed) return false
  if (loadedInterval !== interval || loadedLevel === null) return false
  return vwapContextLevelCovers(loadedLevel, needed)
}
