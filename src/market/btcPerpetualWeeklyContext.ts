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

export function countPrependedCandles(beforeLength: number, afterLength: number): number {
  return Math.max(0, afterLength - beforeLength)
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
}): boolean {
  const { requestGeneration, activeGeneration, requestInterval, responseInterval } = params
  if (requestGeneration !== activeGeneration) return false
  if (responseInterval !== requestInterval) return false
  return true
}

export function isWeeklyContextAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return error instanceof Error && error.name === 'AbortError'
}

export function canRetryWeeklyContextLoad(loadedInterval: CandleInterval | null): boolean {
  return loadedInterval === null
}
