import type {
  CandleInterval,
  MarketCandle,
  MarketExchange,
  MarketSymbol,
} from './types.ts'
import { CANDLE_INTERVALS } from './types.ts'
import { marketSymbolForExchange } from './marketExchange.ts'

const VALID_INTERVALS = new Set<string>(CANDLE_INTERVALS)
const VALID_SYMBOLS = new Set<string>(['BTCUSDT', 'BTC'] satisfies MarketSymbol[])

export type ParseMarketCandleExpectation = {
  exchange?: MarketExchange
  interval?: CandleInterval
  symbol?: MarketSymbol
}

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

function readNonNegativeNumber(value: unknown): number | null {
  const parsed = readNumber(value)
  if (parsed === null || parsed < 0) return null
  return parsed
}

export function parseMarketCandlePayload(
  payload: unknown,
  expectation: ParseMarketCandleExpectation = {},
): MarketCandle | null {
  if (!payload || typeof payload !== 'object') return null

  const record = payload as Record<string, unknown>
  if (typeof record.symbol !== 'string' || !VALID_SYMBOLS.has(record.symbol)) {
    return null
  }
  const symbol = record.symbol as MarketSymbol
  if (!isCandleInterval(record.interval)) return null

  if (expectation.interval && record.interval !== expectation.interval) return null
  if (expectation.symbol && symbol !== expectation.symbol) return null
  if (
    expectation.exchange &&
    symbol !== marketSymbolForExchange(expectation.exchange)
  ) {
    return null
  }

  const time = readNumber(record.time)
  const open = readNumber(record.open)
  const high = readNumber(record.high)
  const low = readNumber(record.low)
  const close = readNumber(record.close)
  const volume = readNonNegativeNumber(record.volume)

  if (
    time === null ||
    open === null ||
    high === null ||
    low === null ||
    close === null ||
    volume === null
  ) {
    return null
  }

  if (typeof record.closed !== 'boolean') return null

  return {
    symbol,
    interval: record.interval,
    time: Math.trunc(time),
    open,
    high,
    low,
    close,
    volume,
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
