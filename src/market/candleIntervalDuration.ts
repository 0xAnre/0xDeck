import { CANDLE_INTERVALS, type CandleInterval } from './types.ts'

const CANDLE_INTERVAL_DURATION_SECONDS: Record<CandleInterval, number> = {
  '1m': 60,
  '5m': 300,
  '30m': 1800,
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
