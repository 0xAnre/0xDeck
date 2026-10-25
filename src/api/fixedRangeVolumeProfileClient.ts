import type { FixedRangeVolumeProfileCandle } from '../market/fixedRangeVolumeProfile.ts'
import {
  marketKlinesPath,
  marketSymbolForExchange,
} from '../market/marketExchange.ts'
import type { MarketExchange, MarketSymbol } from '../market/types.ts'
import { API_BASE } from './apiBase.ts'

export const FIXED_RANGE_VP_SOURCE_INTERVALS = [
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1d',
] as const

export type FixedRangeVolumeProfileSourceInterval =
  (typeof FIXED_RANGE_VP_SOURCE_INTERVALS)[number]

export type FixedRangeVolumeProfileKlinesResponse = {
  exchange: MarketExchange
  symbol: MarketSymbol
  start_time: number
  end_time: number
  source_interval: FixedRangeVolumeProfileSourceInterval
  candles: FixedRangeVolumeProfileSourceCandle[]
  /** Provider candle limit for the source interval, when the provider documents one. */
  history_limit?: number | null
  /** Earliest candle open (unix seconds) the provider can serve for the source interval. */
  available_from?: number | null
  /** True when part of the requested range predates the provider's history window. */
  history_unavailable?: boolean
}

export type FixedRangeVolumeProfileSourceCandle = FixedRangeVolumeProfileCandle & {
  interval: FixedRangeVolumeProfileSourceInterval
  closed: boolean
}

export class FixedRangeVolumeProfileClientError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'FixedRangeVolumeProfileClientError'
    this.status = status
  }
}

function isSourceInterval(value: unknown): value is FixedRangeVolumeProfileSourceInterval {
  return (
    typeof value === 'string' &&
    (FIXED_RANGE_VP_SOURCE_INTERVALS as readonly string[]).includes(value)
  )
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseOhlc(
  record: Record<string, unknown>,
  field: 'open' | 'high' | 'low' | 'close',
): number | null {
  const value = record[field]
  if (!isFiniteNumber(value)) return null
  return value
}

export function parseFixedRangeVolumeProfileKlinesResponse(
  body: unknown,
  requested: {
    startTime: number
    endTime: number
    exchange?: MarketExchange
  },
): FixedRangeVolumeProfileKlinesResponse {
  if (!body || typeof body !== 'object') {
    throw new FixedRangeVolumeProfileClientError('Volume profile response must be an object')
  }
  const root = body as Record<string, unknown>
  const exchange = requested.exchange ?? 'binance'

  if (root.exchange !== undefined && root.exchange !== exchange) {
    throw new FixedRangeVolumeProfileClientError(
      `Volume profile response exchange must be ${exchange}`,
    )
  }

  const expectedSymbol = marketSymbolForExchange(exchange)
  if (root.symbol !== expectedSymbol) {
    throw new FixedRangeVolumeProfileClientError(
      `Volume profile response symbol must be ${expectedSymbol}`,
    )
  }

  if (!Number.isInteger(root.start_time) || root.start_time !== requested.startTime) {
    throw new FixedRangeVolumeProfileClientError('Volume profile response start_time mismatch')
  }
  if (!Number.isInteger(root.end_time) || root.end_time !== requested.endTime) {
    throw new FixedRangeVolumeProfileClientError('Volume profile response end_time mismatch')
  }
  if (!isSourceInterval(root.source_interval)) {
    throw new FixedRangeVolumeProfileClientError('Volume profile response source_interval is invalid')
  }

  const sourceInterval = root.source_interval
  if (!Array.isArray(root.candles)) {
    throw new FixedRangeVolumeProfileClientError('Volume profile response candles must be an array')
  }

  // Availability metadata is optional and additive (Binance omits/returns
  // neutral values), so older responses stay readable.
  if (
    root.history_unavailable !== undefined &&
    typeof root.history_unavailable !== 'boolean'
  ) {
    throw new FixedRangeVolumeProfileClientError(
      'Volume profile response history_unavailable must be boolean',
    )
  }
  const historyUnavailable = root.history_unavailable === true
  let availableFrom: number | null = null
  if (root.available_from !== undefined && root.available_from !== null) {
    if (!Number.isInteger(root.available_from) || (root.available_from as number) <= 0) {
      throw new FixedRangeVolumeProfileClientError(
        'Volume profile response available_from is invalid',
      )
    }
    availableFrom = root.available_from as number
  }
  if (historyUnavailable && availableFrom === null) {
    throw new FixedRangeVolumeProfileClientError(
      'Volume profile response history_unavailable requires available_from',
    )
  }

  const byTime = new Map<number, FixedRangeVolumeProfileSourceCandle>()
  for (const item of root.candles) {
    if (!item || typeof item !== 'object') {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle must be an object')
    }
    const record = item as Record<string, unknown>
    if (!Number.isInteger(record.time) || (record.time as number) <= 0) {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle time is invalid')
    }
    const time = record.time as number
    if (time < requested.startTime || time >= requested.endTime) {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle time is outside request range')
    }

    const open = parseOhlc(record, 'open')
    const high = parseOhlc(record, 'high')
    const low = parseOhlc(record, 'low')
    const close = parseOhlc(record, 'close')
    if (open === null || high === null || low === null || close === null) {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle OHLC is invalid')
    }
    if (low > high || low > open || low > close || high < open || high < close) {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle OHLC range is invalid')
    }

    if (!isFiniteNumber(record.volume) || record.volume < 0) {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle volume is invalid')
    }
    if (typeof record.closed !== 'boolean') {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle closed must be boolean')
    }
    if (record.interval !== sourceInterval) {
      throw new FixedRangeVolumeProfileClientError('Volume profile candle interval mismatch')
    }

    byTime.set(time, {
      time,
      open,
      high,
      low,
      close,
      volume: record.volume,
      interval: sourceInterval,
      closed: record.closed,
    })
  }

  const candles = [...byTime.values()].sort((a, b) => a.time - b.time)

  return {
    exchange,
    symbol: expectedSymbol,
    start_time: requested.startTime,
    end_time: requested.endTime,
    source_interval: sourceInterval,
    candles,
    history_limit:
      root.history_limit === undefined ? null : (root.history_limit as number | null),
    available_from: availableFrom,
    history_unavailable: historyUnavailable,
  }
}

export type FetchFixedRangeVolumeProfileKlinesParams = {
  startTime: number
  endTime: number
  exchange?: MarketExchange
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function fetchFixedRangeVolumeProfileKlines(
  params: FetchFixedRangeVolumeProfileKlinesParams,
): Promise<FixedRangeVolumeProfileKlinesResponse> {
  const { startTime, endTime, exchange = 'binance', signal, fetchImpl = fetch } = params
  if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) || startTime >= endTime) {
    throw new FixedRangeVolumeProfileClientError('Volume profile request bounds are invalid')
  }

  const query = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
  })

  const response = await fetchImpl(`${API_BASE}${marketKlinesPath(exchange, '/volume-profile')}?${query}`, {
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errorBody = (await response.json()) as { detail?: string }
      if (errorBody.detail) detail = errorBody.detail
    } catch {
      // ignore parse errors
    }
    throw new FixedRangeVolumeProfileClientError(detail, response.status)
  }

  const json = (await response.json()) as unknown
  return parseFixedRangeVolumeProfileKlinesResponse(json, {
    startTime,
    endTime,
    exchange,
  })
}
