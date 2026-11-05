import { CANDLE_INTERVALS, type CandleInterval } from './types.ts'

/**
 * Interval → duration in seconds. Exported so a test can pin it to
 * `CANDLE_INTERVALS`: an interval added to one side only would otherwise fall
 * back to `undefined` at runtime (and silently disable features that branch on
 * the duration, such as the liquidation bucket path).
 */
export const CANDLE_INTERVAL_DURATION_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '2h': 7200,
  '4h': 14_400,
  '1d': 86_400,
  '1w': 604_800,
}

export function isCandleInterval(value: unknown): value is CandleInterval {
  return typeof value === 'string' && (CANDLE_INTERVALS as readonly string[]).includes(value)
}

export function candleIntervalDurationSeconds(interval: CandleInterval): number {
  return CANDLE_INTERVAL_DURATION_SECONDS[interval]
}
