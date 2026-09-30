import type { FixedRangeVolumeProfileCandle } from '../market/fixedRangeVolumeProfile.ts'

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
  symbol: 'BTCUSDT'
  start_time: number
  end_time: number
  source_interval: FixedRangeVolumeProfileSourceInterval
  candles: FixedRangeVolumeProfileSourceCandle[]
}

export type FixedRangeVolumeProfileSourceCandle = FixedRangeVolumeProfileCandle & {
  interval: FixedRangeVolumeProfileSourceInterval
  closed: boolean
}

const API_BASE = '/api'

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
  requested: { startTime: number; endTime: number },
): FixedRangeVolumeProfileKlinesResponse {
  if (!body || typeof body !== 'object') {
    throw new FixedRangeVolumeProfileClientError('Volume profile response must be an object')
  }
  const root = body as Record<string, unknown>

  if (root.symbol !== 'BTCUSDT') {
    throw new FixedRangeVolumeProfileClientError('Volume profile response symbol must be BTCUSDT')
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
    symbol: 'BTCUSDT',
    start_time: requested.startTime,
    end_time: requested.endTime,
    source_interval: sourceInterval,
    candles,
  }
}

export type FetchFixedRangeVolumeProfileKlinesParams = {
  startTime: number
  endTime: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function fetchFixedRangeVolumeProfileKlines(
  params: FetchFixedRangeVolumeProfileKlinesParams,
): Promise<FixedRangeVolumeProfileKlinesResponse> {
  const { startTime, endTime, signal, fetchImpl = fetch } = params
  if (!Number.isSafeInteger(startTime) || !Number.isSafeInteger(endTime) || startTime >= endTime) {
    throw new FixedRangeVolumeProfileClientError('Volume profile request bounds are invalid')
  }

  const query = new URLSearchParams({
    start_time: String(startTime),
    end_time: String(endTime),
  })

  const response = await fetchImpl(`${API_BASE}/market/binance/usdm/btcusdt/klines/volume-profile?${query}`, {
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
  return parseFixedRangeVolumeProfileKlinesResponse(json, { startTime, endTime })
}
