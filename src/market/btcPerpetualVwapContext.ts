import type { LogicalRange } from 'lightweight-charts'
import {
  fetchBinanceBtcusdtKlinesDailyContext,
  fetchBinanceBtcusdtKlinesMonthlyContext,
  fetchBinanceBtcusdtKlinesQuarterlyContext,
  fetchBinanceBtcusdtKlinesWeeklyContext,
  fetchBinanceBtcusdtKlinesYearlyContext,
} from '../api/client.ts'
import type { VwapContextLevel } from './indicators.ts'
import { mergeOlderMarketCandles } from './mergeMarketCandles.ts'
import type { BinanceKlinesResponse, CandleInterval, MarketCandle } from './types.ts'

export function mergeVwapContextCandles(
  existing: readonly MarketCandle[],
  history: readonly MarketCandle[],
): MarketCandle[] {
  return mergeOlderMarketCandles(existing, history)
}

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

export function shouldApplyVwapContextResponse(params: {
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

export function isVwapContextAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function vwapContextLevelSatisfiesLoaded(
  loadedLevel: VwapContextLevel | null,
  neededLevel: VwapContextLevel,
): boolean {
  if (loadedLevel === null) return false
  const order: VwapContextLevel[] = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly']
  return order.indexOf(loadedLevel) >= order.indexOf(neededLevel)
}

export async function fetchBtcPerpKlinesForContextLevel(
  level: VwapContextLevel,
  interval: CandleInterval,
  signal?: AbortSignal,
): Promise<BinanceKlinesResponse> {
  switch (level) {
    case 'daily':
      return fetchBinanceBtcusdtKlinesDailyContext(interval, signal)
    case 'weekly':
      return fetchBinanceBtcusdtKlinesWeeklyContext(interval, signal)
    case 'monthly':
      return fetchBinanceBtcusdtKlinesMonthlyContext(interval, signal)
    case 'quarterly':
      return fetchBinanceBtcusdtKlinesQuarterlyContext(interval, signal)
    case 'yearly':
      return fetchBinanceBtcusdtKlinesYearlyContext(interval, signal)
    default: {
      const _exhaustive: never = level
      return _exhaustive
    }
  }
}
