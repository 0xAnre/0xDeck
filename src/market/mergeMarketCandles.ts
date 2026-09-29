import type { MarketCandle } from '@/market/types'

/** Merge older history with current candles; duplicate timestamps keep the newer (live) row. */
export function mergeOlderMarketCandles(
  existing: readonly MarketCandle[],
  older: readonly MarketCandle[],
): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>()
  for (const candle of older) {
    byTime.set(candle.time, candle)
  }
  for (const candle of existing) {
    byTime.set(candle.time, candle)
  }
  return [...byTime.entries()]
    .sort(([timeA], [timeB]) => timeA - timeB)
    .map(([, candle]) => candle)
}
