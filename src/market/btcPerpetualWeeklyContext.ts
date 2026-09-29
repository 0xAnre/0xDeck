import type { LogicalRange } from 'lightweight-charts'
import type { MarketIndicatorId } from './indicators.ts'
import { mergeOlderMarketCandles } from './mergeMarketCandles.ts'
import type { CandleInterval, MarketCandle } from './types.ts'

export function indicatorNeedsWeeklyContext(indicators: readonly MarketIndicatorId[]): boolean {
  return indicators.includes('weekly-vwap')
}

export function mergeWeeklyContextCandles(
  existing: readonly MarketCandle[],
  weeklyHistory: readonly MarketCandle[],
): MarketCandle[] {
  return mergeOlderMarketCandles(existing, weeklyHistory)
}

/** Count candles in `after` that are strictly older than the first candle in `before`. */
export function countPrependedCandles(
  before: readonly MarketCandle[],
  after: readonly MarketCandle[],
): number {
  if (before.length === 0 || after.length === 0) return 0
  const firstExistingTime = before[0].time
  let count = 0
  for (const candle of after) {
    if (candle.time < firstExistingTime) {
      count += 1
    }
  }
  return count
}

export function shiftVisibleLogicalRange(
  range: LogicalRange | null,
  addedCount: number,
): LogicalRange | null {
  if (range === null || addedCount <= 0) return range
  const from = (range.from as number) + addedCount
  const to = (range.to as number) + addedCount
  return { from, to } as LogicalRange
}

export function shouldApplyWeeklyContextResponse(params: {
  requestGeneration: number
  activeGeneration: number
  requestInterval: CandleInterval
  responseInterval: CandleInterval
  requestId: number
  latestRequestId: number
}): boolean {
  const {
    requestGeneration,
    activeGeneration,
    requestInterval,
    responseInterval,
    requestId,
    latestRequestId,
  } = params
  if (requestId !== latestRequestId) return false
  if (requestGeneration !== activeGeneration) return false
  if (responseInterval !== requestInterval) return false
  return true
}

export function shouldFinalizeWeeklyContextRequest(
  requestId: number,
  latestRequestId: number,
): boolean {
  return requestId === latestRequestId
}

export function shouldShowWeeklyVwapSeries(params: {
  indicatorSelected: boolean
  loadedInterval: CandleInterval | null
  activeInterval: CandleInterval
}): boolean {
  const { indicatorSelected, loadedInterval, activeInterval } = params
  if (!indicatorSelected) return false
  return loadedInterval === activeInterval
}

export function isWeeklyContextAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return error instanceof Error && error.name === 'AbortError'
}

export function canRetryWeeklyContextLoad(loadedInterval: CandleInterval | null): boolean {
  return loadedInterval === null
}
