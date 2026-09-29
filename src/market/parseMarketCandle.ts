import type { CandleInterval, MarketCandle } from '@/market/types'
import { CANDLE_INTERVALS } from '@/market/types'

const VALID_INTERVALS = new Set<string>(CANDLE_INTERVALS)

function isCandleInterval(value: unknown): value is CandleInterval {
  return typeof value === 'string' && VALID_INTERVALS.has(value)
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function parseMarketCandlePayload(payload: unknown): MarketCandle | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  if (record.symbol !== 'BTCUSDT') return null
  if (!isCandleInterval(record.interval)) return null

  const time = readNumber(record.time)
  const open = readNumber(record.open)
  const high = readNumber(record.high)
  const low = readNumber(record.low)
  const close = readNumber(record.close)

  if (
    time === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null
  ) {
    return null
  }

  if (typeof record.closed !== 'boolean') return null

  return {
    symbol: 'BTCUSDT',
    interval: record.interval,
    time: Math.trunc(time),
    open,
    high,
    low,
    close,
    closed: record.closed,
  }
}

export type LiveCandleApplyResult = 'ignore' | 'update' | 'append'

export function applyLiveCandle(
  candles: MarketCandle[],
  candle: MarketCandle,
): LiveCandleApplyResult {
  if (candles.length === 0) {
    candles.push(candle)
    return 'append'
  }

  const last = candles[candles.length - 1]
  if (candle.time < last.time) return 'ignore'
  if (candle.time === last.time) {
    candles[candles.length - 1] = candle
    return 'update'
  }

  candles.push(candle)
  return 'append'
}
