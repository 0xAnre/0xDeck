/**
 * The loaded candle window as an *invalidation value*.
 *
 * The chart panel used to publish candle changes as a monotonic counter
 * (`candleRangeRevision`) bumped by the notice refresher. Every consumer read
 * it as "the loaded range changed", so unrelated refreshes — the initial load,
 * every older-history page, every VWAP context merge, every preload step —
 * restarted full REST work: the 12-page liquidation walk was re-requested from
 * the newest cursor, and the bucket window was re-queried (Issue #238 measured
 * 38 `liquidations/history` requests for one page load with a handful of pans).
 *
 * Comparing window endpoints instead means a consumer re-runs only when the
 * range it requested actually changed. Pure, so the comparison is unit tested
 * (`npm run test:market`).
 */

export type CandleWindow = {
  /** Oldest loaded candle open time (unix seconds), `null` when nothing is loaded. */
  oldest: number | null
  /** Newest loaded candle open time (unix seconds), `null` when nothing is loaded. */
  newest: number | null
}

export const EMPTY_CANDLE_WINDOW: CandleWindow = { oldest: null, newest: null }

export function candleWindowOf(candles: readonly { time: number }[]): CandleWindow {
  if (candles.length === 0) return EMPTY_CANDLE_WINDOW

  // Candles are kept ascending; scanning both ends keeps this O(1)-ish for the
  // hot path (live ticks) while staying correct for a merged page.
  let oldest = candles[0].time
  let newest = candles[0].time
  for (const candle of candles) {
    if (candle.time < oldest) oldest = candle.time
    if (candle.time > newest) newest = candle.time
  }
  return { oldest, newest }
}

export function candleWindowEqual(a: CandleWindow, b: CandleWindow): boolean {
  return a.oldest === b.oldest && a.newest === b.newest
}
