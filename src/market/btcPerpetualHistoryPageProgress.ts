import type { MarketCandle } from './types.ts'

export function olderHistoryPageMadeProgress(
  candleCountBefore: number,
  oldestTimeBefore: number,
  candlesAfter: readonly MarketCandle[],
): boolean {
  return (
    candlesAfter.length > candleCountBefore ||
    (candlesAfter.length > 0 && candlesAfter[0].time < oldestTimeBefore)
  )
}
