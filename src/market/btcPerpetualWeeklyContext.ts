import type { CandleInterval } from './types.ts'
import {
  countPrependedCandles,
  isVwapContextAbortError,
  mergeVwapContextCandles,
  shiftVisibleLogicalRange,
  shouldApplyVwapContextResponse,
} from './btcPerpetualVwapContext.ts'
import {
  isIndicatorSupportedOnInterval,
  shouldShowVwapIndicatorSeries,
  type MarketIndicatorId,
} from './indicators.ts'

export {
  countPrependedCandles,
  isVwapContextAbortError as isWeeklyContextAbortError,
  mergeVwapContextCandles as mergeWeeklyContextCandles,
  shiftVisibleLogicalRange,
  shouldApplyVwapContextResponse as shouldApplyWeeklyContextResponse,
}

export function indicatorNeedsWeeklyContext(indicators: readonly MarketIndicatorId[]): boolean {
  return indicators.includes('weekly-vwap')
}

export function shouldShowWeeklyVwapSeries(params: {
  indicatorSelected: boolean
  loadedInterval: CandleInterval | null
  activeInterval: CandleInterval
  loadedLevel?: import('./indicators.ts').VwapContextLevel | null
}): boolean {
  return shouldShowVwapIndicatorSeries({
    indicatorId: 'weekly-vwap',
    indicatorSelected: params.indicatorSelected,
    interval: params.activeInterval,
    loadedLevel: params.loadedLevel ?? null,
    loadedInterval: params.loadedInterval,
  })
}

export function shouldFinalizeWeeklyContextRequest(
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId
}

export function canRetryWeeklyContextLoad(
  loadedInterval: CandleInterval | null,
  activeInterval: CandleInterval,
): boolean {
  return loadedInterval !== activeInterval
}

export function isWeeklySupported(interval: CandleInterval): boolean {
  return isIndicatorSupportedOnInterval('weekly-vwap', interval)
}
