import type { MarketCandle } from '@/market/types'

/** Pre-history stream events keyed by candle open time (seconds). */
export type CandleStreamBuffer = Map<number, MarketCandle>

export function bufferStreamCandle(buffer: CandleStreamBuffer, candle: MarketCandle): void {
  buffer.set(candle.time, candle)
}

/**
 * Merge REST history with buffered live candles. Same timestamp → buffer wins.
 * Result is strictly ascending unique timestamps.
 */
export function mergeHistoryWithStreamBuffer(
  history: readonly MarketCandle[],
  buffer: CandleStreamBuffer,
): MarketCandle[] {
  const byTime = new Map<number, MarketCandle>()

  for (const candle of history) {
    byTime.set(candle.time, candle)
  }

  for (const candle of buffer.values()) {
    byTime.set(candle.time, candle)
  }

  return [...byTime.entries()]
    .sort(([timeA], [timeB]) => timeA - timeB)
    .map(([, candle]) => candle)
}
