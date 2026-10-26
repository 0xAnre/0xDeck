import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import type { CandleInterval } from './types.ts'

/**
 * Epoch offset (ms) of Monday 1970-01-05T00:00:00Z, the reference weekly open.
 * `1w` candles from Binance open Monday 00:00 UTC, while the Unix epoch is a
 * Thursday, so weekly buckets cannot be floored on the epoch itself.
 */
const MONDAY_EPOCH_OFFSET_MS = 4 * 86_400_000

/**
 * Exact candle-open bucket (unix seconds) for any event/sample timestamp.
 *
 * Every indicator that buckets time-series data into chart candles uses this
 * helper so points land exactly on candle opens, including the Monday-open
 * `1w` offset.
 */
export function candleBucketTime(
  timestampMs: number,
  interval: CandleInterval,
): number {
  const durationMs = candleIntervalDurationSeconds(interval) * 1000
  if (interval === '1w') {
    const weeks = Math.floor((timestampMs - MONDAY_EPOCH_OFFSET_MS) / durationMs)
    return (MONDAY_EPOCH_OFFSET_MS + weeks * durationMs) / 1000
  }
  return Math.floor(timestampMs / durationMs) * (durationMs / 1000)
}
