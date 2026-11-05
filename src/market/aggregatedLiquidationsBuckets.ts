/**
 * Browser → 0xDeck backend client for pre-aggregated liquidation history.
 *
 * The events endpoint is newest-first and paged, so a long chart range can only
 * reach the newest ~12k liquidations (~13 days at the time of writing). For
 * chart intervals of **30m and above** the pane therefore reads one
 * `buckets` response for the loaded candle range instead: the backend runs a
 * single SQL `GROUP BY` over the same events and returns `{time, long, short}`
 * objects, exactly the shape `aggregatedLiquidationsChartSeries` already
 * renders.
 *
 * Intervals of **15m and below** keep the event path (live detail + per-event
 * merge). Nothing in this module changes the shared bucketing contract: the
 * backend mirrors `liquidationBucketTime` from `aggregatedLiquidations.ts`.
 */
import { API_BASE } from '../api/apiBase.ts'
import {
  AGGREGATED_LIQUIDATIONS_EXCHANGE,
  AGGREGATED_LIQUIDATIONS_SYMBOL,
  type AggregatedLiquidationBucket,
  type AggregatedLiquidationEvent,
} from './aggregatedLiquidations.ts'
import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import type { CandleInterval } from './types.ts'

export const AGGREGATED_LIQUIDATIONS_BUCKETS_PATH =
  '/market/binance/usdm/btcusdt/liquidations/buckets'

/**
 * Fan-out guard shared with the backend
 * (`MAX_BUCKET_COUNT` in `backend/app/market/liquidation_store.py`). The
 * client keeps its request at or below this many bucket slots; a wider loaded
 * range is narrowed to its newest slots and surfaced as a notice.
 */
export const AGGREGATED_LIQUIDATIONS_BUCKETS_MAX_BUCKETS = 20_000

/** Chart intervals at or above 30m use backend buckets instead of event paging. */
export const AGGREGATED_LIQUIDATIONS_BUCKETS_MIN_INTERVAL_SECONDS = 1800

/** Refresh period for the live-edge bucket window while the pane is enabled. */
export const AGGREGATED_LIQUIDATIONS_BUCKETS_LIVE_REFRESH_MS = 15_000

/** Monday 1970-01-05T00:00:00Z; mirrors `MONDAY_EPOCH_OFFSET_MS` on the backend. */
const MONDAY_EPOCH_OFFSET_MS = 4 * 86_400_000

export type AggregatedLiquidationsBuckets = {
  exchange: typeof AGGREGATED_LIQUIDATIONS_EXCHANGE
  symbol: typeof AGGREGATED_LIQUIDATIONS_SYMBOL
  interval: CandleInterval
  /** Ascending by `time`; empty buckets are omitted. */
  buckets: AggregatedLiquidationBucket[]
  /** True when the backend could not return the whole requested range. */
  truncated: boolean
}

export type AggregatedLiquidationsBucketRequest = {
  /** Epoch milliseconds, inclusive. */
  from: number
  /** Epoch milliseconds, exclusive. */
  to: number
  /** True when the loaded range was narrowed to the newest bucket slots. */
  truncated: boolean
}

export class AggregatedLiquidationsBucketsClientError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AggregatedLiquidationsBucketsClientError'
    this.status = status
  }
}

/** `>= 30m` intervals read backend buckets; `<= 15m` keep the events path. */
export function shouldUseAggregatedLiquidationBuckets(
  interval: CandleInterval,
): boolean {
  return (
    candleIntervalDurationSeconds(interval) >=
    AGGREGATED_LIQUIDATIONS_BUCKETS_MIN_INTERVAL_SECONDS
  )
}

export function aggregatedLiquidationsBucketsPath(params: {
  interval: CandleInterval
  from: number
  to: number
}): string {
  const search = new URLSearchParams({
    interval: params.interval,
    from: String(Math.trunc(params.from)),
    to: String(Math.trunc(params.to)),
  })
  return `${AGGREGATED_LIQUIDATIONS_BUCKETS_PATH}?${search.toString()}`
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null
  }
  return value
}

function readNonNegativeFiniteNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null
  }
  return value
}

/**
 * Parse one buckets response. Unlike the events parser (which drops malformed
 * rows), a malformed bucket is a contract error: dropping it would silently
 * blank one candle on the pane.
 */
export function parseAggregatedLiquidationsBuckets(
  payload: unknown,
  expectedInterval: CandleInterval,
): AggregatedLiquidationsBuckets {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AggregatedLiquidationsBucketsClientError(
      'Liquidation buckets response must be an object',
    )
  }
  const record = payload as Record<string, unknown>

  if (record.exchange !== AGGREGATED_LIQUIDATIONS_EXCHANGE) {
    throw new AggregatedLiquidationsBucketsClientError(
      `Liquidation buckets response exchange must be ${AGGREGATED_LIQUIDATIONS_EXCHANGE}`,
    )
  }
  if (record.symbol !== AGGREGATED_LIQUIDATIONS_SYMBOL) {
    throw new AggregatedLiquidationsBucketsClientError(
      `Liquidation buckets response symbol must be ${AGGREGATED_LIQUIDATIONS_SYMBOL}`,
    )
  }
  if (record.interval !== expectedInterval) {
    throw new AggregatedLiquidationsBucketsClientError(
      `Liquidation buckets response interval must be ${expectedInterval}`,
    )
  }
  if (typeof record.truncated !== 'boolean') {
    throw new AggregatedLiquidationsBucketsClientError(
      'Liquidation buckets response truncated must be boolean',
    )
  }
  if (!Array.isArray(record.buckets)) {
    throw new AggregatedLiquidationsBucketsClientError(
      'Liquidation buckets response buckets must be an array',
    )
  }

  const buckets: AggregatedLiquidationBucket[] = []
  for (const raw of record.buckets) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new AggregatedLiquidationsBucketsClientError(
        'Liquidation bucket must be an object',
      )
    }
    const entry = raw as Record<string, unknown>
    const time = readPositiveInteger(entry.time)
    const long = readNonNegativeFiniteNumber(entry.long)
    const short = readNonNegativeFiniteNumber(entry.short)
    if (time === null || long === null || short === null) {
      throw new AggregatedLiquidationsBucketsClientError(
        'Liquidation bucket fields are invalid',
      )
    }
    if (long <= 0 && short <= 0) {
      throw new AggregatedLiquidationsBucketsClientError(
        'Liquidation bucket must carry a positive long or short notional',
      )
    }
    const previous = buckets[buckets.length - 1]
    if (previous && time <= previous.time) {
      throw new AggregatedLiquidationsBucketsClientError(
        'Liquidation buckets must be strictly ascending by time',
      )
    }
    buckets.push({ time, long, short })
  }

  return {
    exchange: AGGREGATED_LIQUIDATIONS_EXCHANGE,
    symbol: AGGREGATED_LIQUIDATIONS_SYMBOL,
    interval: expectedInterval,
    buckets,
    truncated: record.truncated,
  }
}

export type FetchAggregatedLiquidationsBucketsParams = {
  interval: CandleInterval
  from: number
  to: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function fetchAggregatedLiquidationsBuckets(
  params: FetchAggregatedLiquidationsBucketsParams,
): Promise<AggregatedLiquidationsBuckets> {
  const { interval, from, to, signal, fetchImpl = fetch } = params
  const response = await fetchImpl(
    `${API_BASE}${aggregatedLiquidationsBucketsPath({ interval, from, to })}`,
    {
      headers: { Accept: 'application/json' },
      signal,
    },
  )

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errorBody = (await response.json()) as { detail?: string }
      if (errorBody.detail) detail = errorBody.detail
    } catch {
      // ignore parse errors
    }
    throw new AggregatedLiquidationsBucketsClientError(detail, response.status)
  }

  const json = (await response.json()) as unknown
  return parseAggregatedLiquidationsBuckets(json, interval)
}

/**
 * Build the half-open `[from, to)` request for the loaded candle range.
 *
 * `to` is the end of the newest loaded candle so its still-open bucket is
 * included. When the range spans more than `maxBuckets` slots the request is
 * narrowed to the newest slots and `truncated` is set, which the panel turns
 * into a coverage notice instead of a silent gap.
 */
export function buildAggregatedLiquidationsBucketRequest(
  candleTimes: readonly number[],
  interval: CandleInterval,
  maxBuckets: number = AGGREGATED_LIQUIDATIONS_BUCKETS_MAX_BUCKETS,
): AggregatedLiquidationsBucketRequest | null {
  if (candleTimes.length === 0) return null

  const durationSeconds = candleIntervalDurationSeconds(interval)
  const durationMs = durationSeconds * 1000
  const offsetMs = interval === '1w' ? MONDAY_EPOCH_OFFSET_MS : 0
  let oldestMs = Math.min(...candleTimes) * 1000
  const newestMs = Math.max(...candleTimes) * 1000
  const to = newestMs + durationMs
  const cappedMax = Math.max(1, Math.trunc(maxBuckets))

  const lastSlot = Math.floor((to - 1 - offsetMs) / durationMs)
  const firstSlot = Math.floor((oldestMs - offsetMs) / durationMs)
  const slots = lastSlot - firstSlot + 1
  let truncated = false
  if (slots > cappedMax) {
    truncated = true
    // Retain the newest `cappedMax` bucket slots. Rounding down is safe: the
    // oldest retained bucket may start before the loaded range's first candle
    // and is filtered out by `filterAggregatedLiquidationBucketsToCandles`.
    oldestMs = Math.max(
      oldestMs,
      offsetMs + (lastSlot - cappedMax + 1) * durationMs,
    )
  }

  return { from: oldestMs, to, truncated }
}

/** Deterministic UTC label (`2026-10-01 00:00 UTC`) for coverage notices. */
export function formatAggregatedLiquidationsCoverageTime(epochMs: number): string {
  const iso = new Date(epochMs).toISOString()
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}

/**
 * Notice for a bucket response that does not cover the loaded chart range.
 * `null` means full coverage and the pane shows no notice.
 */
export function describeAggregatedLiquidationsBucketNotice(
  request: AggregatedLiquidationsBucketRequest | null,
  response: Pick<AggregatedLiquidationsBuckets, 'truncated'> | null,
): string | null {
  if (!request) return null
  if (!request.truncated && !response?.truncated) return null
  return (
    `Aggregated Liquidations buckets cover ${formatAggregatedLiquidationsCoverageTime(request.from)}` +
    ` to ${formatAggregatedLiquidationsCoverageTime(request.to)};` +
    ` older bars in the loaded chart range are not shown (bucket limit).`
  )
}

/**
 * Notice for the paged events path when the page cap stopped the walk.
 * `null` means the whole requested range was read.
 */
export function describeAggregatedLiquidationsEventNotice(
  events: readonly AggregatedLiquidationEvent[],
  truncated: boolean,
): string | null {
  if (!truncated) return null
  if (events.length === 0) {
    return 'Aggregated Liquidations history is truncated by the page limit; no events were loaded.'
  }
  let oldest = events[0].tradeTime
  let newest = events[0].tradeTime
  for (const event of events) {
    if (event.tradeTime < oldest) oldest = event.tradeTime
    if (event.tradeTime > newest) newest = event.tradeTime
  }
  return (
    `Aggregated Liquidations events cover ${formatAggregatedLiquidationsCoverageTime(oldest)}` +
    ` to ${formatAggregatedLiquidationsCoverageTime(newest)};` +
    ` older bars in the loaded chart range are not shown (history page limit).`
  )
}
