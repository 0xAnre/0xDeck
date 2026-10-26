/**
 * Pure Order Book Depth logic for the BTC Perp widget.
 *
 * The backend relays periodic imbalance samples derived from one synchronized
 * Binance USD-M BTCUSDT local order book. This module validates those samples
 * defensively, keeps only complete coverage, and buckets samples into exact
 * chart candle opens.
 *
 * Coverage is honest: Binance REST snapshots truncate at 1000 levels, so an
 * incomplete sample is never rendered as a measurement for the requested
 * distance.
 */
import { candleBucketTime } from './candleBucketTime.ts'
import type { CandleInterval } from './types.ts'

export const ORDER_BOOK_DEPTH_CHANNEL = 'binance.usdm.btcusdt.orderbook'
export const ORDER_BOOK_DEPTH_SOURCE = 'binance'
export const ORDER_BOOK_DEPTH_EXCHANGE = 'binance'
export const ORDER_BOOK_DEPTH_SYMBOL = 'BTCUSDT'

export const ORDER_BOOK_DEPTH_DISTANCES = [0.25, 0.5, 1, 2.5] as const
export type OrderBookDepthDistance = (typeof ORDER_BOOK_DEPTH_DISTANCES)[number]

export const DEFAULT_ORDER_BOOK_DEPTH_DISTANCE: OrderBookDepthDistance = 2.5

/** Bounded retention for the merged live + history sample buffer. */
export const MAX_ORDER_BOOK_DEPTH_SAMPLES = 20_000

export type OrderBookDepthSample = {
  id: string
  source: typeof ORDER_BOOK_DEPTH_SOURCE
  exchange: typeof ORDER_BOOK_DEPTH_EXCHANGE
  symbol: typeof ORDER_BOOK_DEPTH_SYMBOL
  distance: OrderBookDepthDistance
  /** Sample time in epoch milliseconds. */
  time: number
  mid: number
  bidNotional: number
  askNotional: number
  imbalance: number
  bidCoveragePct: number
  askCoveragePct: number
  complete: boolean
}

export type OrderBookDepthPoint = {
  /** Candle open time in unix seconds. */
  time: number
  /** Imbalance percentage in −100…+100. */
  value: number
}

export type OrderBookDepthThresholds = {
  positive: number
  negative: number
}

type RawRecord = Record<string, unknown>

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readNonNegativeNumber(value: unknown): number | null {
  const parsed = readFiniteNumber(value)
  return parsed !== null && parsed >= 0 ? parsed : null
}

function readPositiveInt(value: unknown): number | null {
  const parsed = readFiniteNumber(value)
  if (parsed === null || parsed <= 0) return null
  const truncated = Math.trunc(parsed)
  return truncated > 0 ? truncated : null
}

export function isOrderBookDepthDistance(
  value: unknown,
): value is OrderBookDepthDistance {
  return (
    typeof value === 'number' &&
    (ORDER_BOOK_DEPTH_DISTANCES as readonly number[]).includes(value)
  )
}

function sampleId(
  distance: OrderBookDepthDistance,
  time: number,
): string {
  return `${ORDER_BOOK_DEPTH_SOURCE}|${ORDER_BOOK_DEPTH_SYMBOL}|${distance}|${time}`
}

/**
 * Parse one relay/history sample. Malformed samples return null instead of
 * reaching the chart as `NaN` or as a fabricated zero.
 */
export function parseOrderBookDepthSample(
  raw: unknown,
): OrderBookDepthSample | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as RawRecord

  if (record.source !== ORDER_BOOK_DEPTH_SOURCE) return null
  if (record.exchange !== ORDER_BOOK_DEPTH_EXCHANGE) return null
  if (record.symbol !== ORDER_BOOK_DEPTH_SYMBOL) return null

  const distance = record.distance
  if (!isOrderBookDepthDistance(distance)) return null

  const time = readPositiveInt(record.time)
  const mid = readFiniteNumber(record.mid)
  const bidNotional = readNonNegativeNumber(
    record.bid_notional ?? record.bidNotional,
  )
  const askNotional = readNonNegativeNumber(
    record.ask_notional ?? record.askNotional,
  )
  const imbalance = readFiniteNumber(record.imbalance)
  const bidCoveragePct = readNonNegativeNumber(
    record.bid_coverage_pct ?? record.bidCoveragePct,
  )
  const askCoveragePct = readNonNegativeNumber(
    record.ask_coverage_pct ?? record.askCoveragePct,
  )
  const complete = record.complete

  if (
    time === null ||
    mid === null ||
    mid <= 0 ||
    bidNotional === null ||
    askNotional === null ||
    imbalance === null ||
    imbalance < -100 ||
    imbalance > 100 ||
    bidCoveragePct === null ||
    askCoveragePct === null ||
    typeof complete !== 'boolean'
  ) {
    return null
  }

  return {
    id:
      typeof record.id === 'string' && record.id !== ''
        ? record.id
        : sampleId(distance, time),
    source: ORDER_BOOK_DEPTH_SOURCE,
    exchange: ORDER_BOOK_DEPTH_EXCHANGE,
    symbol: ORDER_BOOK_DEPTH_SYMBOL,
    distance,
    time,
    mid,
    bidNotional,
    askNotional,
    imbalance,
    bidCoveragePct,
    askCoveragePct,
    complete,
  }
}

/**
 * Keep only complete samples. An incomplete sample can never become a point,
 * even if it is the only sample available.
 */
export function filterCompleteOrderBookDepthSamples(
  samples: readonly OrderBookDepthSample[],
  distance?: OrderBookDepthDistance,
): OrderBookDepthSample[] {
  return samples.filter(
    (sample) =>
      sample.complete &&
      Number.isFinite(sample.imbalance) &&
      sample.imbalance >= -100 &&
      sample.imbalance <= 100 &&
      (distance === undefined || sample.distance === distance),
  )
}

/**
 * Aggregate samples into chart candle buckets: the last complete sample per
 * bucket wins, and buckets without a complete sample stay gaps. Bucket times
 * come from the shared `candleBucketTime` helper so they land exactly on candle
 * opens, including the `1w` Monday-open offset.
 */
export function bucketOrderBookDepthSamples(
  samples: readonly OrderBookDepthSample[],
  interval: CandleInterval,
): OrderBookDepthPoint[] {
  const latestByBucket = new Map<number, OrderBookDepthSample>()
  for (const sample of filterCompleteOrderBookDepthSamples(samples)) {
    const bucket = candleBucketTime(sample.time, interval)
    const current = latestByBucket.get(bucket)
    if (
      !current ||
      sample.time > current.time ||
      (sample.time === current.time && sample.id.localeCompare(current.id) > 0)
    ) {
      latestByBucket.set(bucket, sample)
    }
  }
  return [...latestByBucket.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, sample]) => ({ time, value: sample.imbalance }))
}

/**
 * Merge live and stored samples without double counting, then bound memory.
 * Identity is the backend sample `id`, so a sample received both over the live
 * socket and in a history page contributes once.
 */
export function mergeOrderBookDepthSamples(
  current: readonly OrderBookDepthSample[],
  incoming: readonly OrderBookDepthSample[],
  maxSamples: number = MAX_ORDER_BOOK_DEPTH_SAMPLES,
): OrderBookDepthSample[] {
  const seen = new Set<string>()
  const merged: OrderBookDepthSample[] = []
  for (const sample of [...current, ...incoming]) {
    if (seen.has(sample.id)) continue
    seen.add(sample.id)
    merged.push(sample)
  }
  merged.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  const bounded = Math.max(1, Math.trunc(maxSamples))
  if (merged.length > bounded) {
    merged.splice(0, merged.length - bounded)
  }
  return merged
}

export function latestOrderBookDepthSample(
  samples: readonly OrderBookDepthSample[],
  distance: OrderBookDepthDistance,
): OrderBookDepthSample | null {
  let latest: OrderBookDepthSample | null = null
  for (const sample of samples) {
    if (sample.distance !== distance) continue
    if (!latest || sample.time > latest.time) latest = sample
  }
  return latest
}

/**
 * Explicit notice for missing/insufficient coverage. `null` means the latest
 * sample for the selected distance is complete and may be rendered.
 */
export function orderBookDepthCoverageNotice(
  samples: readonly OrderBookDepthSample[],
  distance: OrderBookDepthDistance,
): string | null {
  const latest = latestOrderBookDepthSample(samples, distance)
  if (latest?.complete) return null
  if (!latest) {
    return `Insufficient order-book coverage for ${distance}% depth: waiting for a synchronized Binance book sample.`
  }
  return `Insufficient order-book coverage for ${distance}% depth (bid ${latest.bidCoveragePct.toFixed(3)}%, ask ${latest.askCoveragePct.toFixed(3)}%).`
}

/** Validate a threshold pair; invalid or inverted pairs fall back to defaults. */
export function sanitizeOrderBookDepthThresholds(
  value: unknown,
  defaults: OrderBookDepthThresholds = { positive: 25, negative: -25 },
): OrderBookDepthThresholds {
  if (!value || typeof value !== 'object') return { ...defaults }
  const record = value as RawRecord
  const positive = readFiniteNumber(record.positive)
  const negative = readFiniteNumber(record.negative)
  if (
    positive === null ||
    negative === null ||
    positive < -100 ||
    positive > 100 ||
    negative < -100 ||
    negative > 100 ||
    positive <= negative
  ) {
    return { ...defaults }
  }
  return { positive, negative }
}
