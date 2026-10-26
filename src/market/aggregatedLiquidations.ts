/**
 * Pure Aggregated Liquidations logic for the BTC Perp widget.
 *
 * The backend relays normalized Binance USD-M `forceOrder` events. This module
 * validates them defensively, deduplicates repeated snapshots in bounded
 * memory, and aggregates positive long/short USD notional into candle buckets
 * that line up with the chart interval.
 *
 * Live events arrive over the relay channel; events collected while the
 * backend runs are also loadable from SQLite history through
 * `aggregatedLiquidationsHistory.ts`, which reuses this parser and merger.
 * Binance `forceOrder` events are not a complete market-wide liquidation total.
 */
import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import type { CandleInterval } from './types.ts'

export const AGGREGATED_LIQUIDATIONS_CHANNEL = 'binance.usdm.btcusdt.liquidations'
export const AGGREGATED_LIQUIDATIONS_EXCHANGE = 'binance'
export const AGGREGATED_LIQUIDATIONS_SYMBOL = 'BTCUSDT'

/** Upper bound for the raw live-event buffer used to rebucket on interval change. */
export const MAX_LIQUIDATION_EVENTS = 5000

export type LiquidationSide = 'long' | 'short'

export type AggregatedLiquidationEvent = {
  id: string
  exchange: typeof AGGREGATED_LIQUIDATIONS_EXCHANGE
  symbol: typeof AGGREGATED_LIQUIDATIONS_SYMBOL
  side: LiquidationSide
  /** Average execution price (`ap`) in USD. */
  price: number
  /** Accumulated filled quantity (`z`). */
  quantity: number
  /** Positive USD notional (`z * ap`). */
  notional: number
  /** Binance event time `E` in epoch milliseconds. */
  time: number
  /**
   * Binance order trade time `T` in epoch milliseconds. This is the execution
   * timestamp and the value used for candle bucketing, because `E` can be ~1s
   * later and cross a candle boundary on 1m/5m charts.
   */
  tradeTime: number
}

export type AggregatedLiquidationBucket = {
  /** Candle open time in unix seconds. */
  time: number
  /** Positive USD notional liquidated on longs (SELL force orders). */
  long: number
  /** Positive USD notional liquidated on shorts (BUY force orders). */
  short: number
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

function readPositiveNumber(value: unknown): number | null {
  const parsed = readFiniteNumber(value)
  return parsed !== null && parsed > 0 ? parsed : null
}

function readPositiveInt(value: unknown): number | null {
  const parsed = readFiniteNumber(value)
  if (parsed === null || !Number.isFinite(parsed) || parsed <= 0) return null
  const truncated = Math.trunc(parsed)
  return truncated > 0 ? truncated : null
}

function fallbackEventId(
  side: LiquidationSide,
  time: number,
  tradeTime: number,
  price: number,
  quantity: number,
): string {
  return [
    AGGREGATED_LIQUIDATIONS_EXCHANGE,
    AGGREGATED_LIQUIDATIONS_SYMBOL,
    side,
    time,
    tradeTime,
    quantity,
    price,
  ].join('|')
}

/**
 * Parse one relay payload into a validated live liquidation event.
 * Invalid/malformed events return null instead of rendering `NaN`.
 */
export function parseAggregatedLiquidationEvent(
  raw: unknown,
): AggregatedLiquidationEvent | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const record = raw as RawRecord

  if (record.exchange !== AGGREGATED_LIQUIDATIONS_EXCHANGE) return null
  if (record.symbol !== AGGREGATED_LIQUIDATIONS_SYMBOL) return null

  const side = record.side
  if (side !== 'long' && side !== 'short') return null

  const price = readPositiveNumber(record.price)
  const quantity = readPositiveNumber(record.quantity)
  const time = readPositiveInt(record.time)
  const tradeTime = readPositiveInt(record.trade_time ?? record.tradeTime ?? record.time)
  if (price === null || quantity === null || time === null || tradeTime === null) {
    return null
  }

  let notional: number
  const rawNotional = record.notional
  if (rawNotional === undefined || rawNotional === null) {
    notional = price * quantity
  } else {
    const parsed = readPositiveNumber(rawNotional)
    if (parsed === null) return null
    notional = parsed
  }
  if (!Number.isFinite(notional) || notional <= 0) return null

  const id =
    typeof record.id === 'string' && record.id !== ''
      ? record.id
      : fallbackEventId(side, time, tradeTime, price, quantity)

  return {
    id,
    exchange: AGGREGATED_LIQUIDATIONS_EXCHANGE,
    symbol: AGGREGATED_LIQUIDATIONS_SYMBOL,
    side,
    price,
    quantity,
    notional,
    time,
    tradeTime,
  }
}

/**
 * Append events with bounded memory, dropping already-seen identities so a
 * repeated Binance snapshot is never double-counted.
 */
export function appendAggregatedLiquidationEvents(
  current: readonly AggregatedLiquidationEvent[],
  incoming: readonly AggregatedLiquidationEvent[],
  maxEvents: number = MAX_LIQUIDATION_EVENTS,
): AggregatedLiquidationEvent[] {
  const seen = new Set(current.map((event) => event.id))
  const next = [...current]
  for (const event of incoming) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    next.push(event)
  }
  next.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id))
  const boundedMax = Math.max(1, Math.trunc(maxEvents))
  if (next.length > boundedMax) {
    next.splice(0, next.length - boundedMax)
  }
  return next
}

/**
 * Epoch offset (ms) of Monday 1970-01-05T00:00:00Z, the reference weekly open.
 * `1w` candles from Binance open Monday 00:00 UTC, while the Unix epoch is a
 * Thursday, so weekly buckets cannot be floored on the epoch itself.
 */
const MONDAY_EPOCH_OFFSET_MS = 4 * 86_400_000

/** Exact candle-open bucket (unix seconds) for an order trade time. */
export function liquidationBucketTime(
  tradeTimeMs: number,
  interval: CandleInterval,
): number {
  const durationMs = candleIntervalDurationSeconds(interval) * 1000
  if (interval === '1w') {
    const weeks = Math.floor((tradeTimeMs - MONDAY_EPOCH_OFFSET_MS) / durationMs)
    return (MONDAY_EPOCH_OFFSET_MS + weeks * durationMs) / 1000
  }
  return Math.floor(tradeTimeMs / durationMs) * (durationMs / 1000)
}

/**
 * Aggregate events into positive long/short USD buckets for one chart interval.
 * Buckets use the order trade time so history and live events align with the
 * candle that actually contains the liquidation. Re-running this after an
 * interval change yields fresh bucket boundaries, so stale buckets from the
 * previous interval can never be displayed.
 */
export function bucketAggregatedLiquidationEvents(
  events: readonly AggregatedLiquidationEvent[],
  interval: CandleInterval,
): AggregatedLiquidationBucket[] {
  const buckets = new Map<number, { long: number; short: number }>()
  for (const event of events) {
    if (!Number.isFinite(event.notional) || event.notional <= 0) continue
    // Use the execution/trade timestamp, not Binance event time. Candles are
    // built from trades; the event timestamp is published slightly later and
    // can cross a 1m/5m bucket boundary, which used to make those bars land on
    // a candle that was not loaded/visible yet.
    const time = liquidationBucketTime(event.tradeTime, interval)
    let bucket = buckets.get(time)
    if (!bucket) {
      bucket = { long: 0, short: 0 }
      buckets.set(time, bucket)
    }
    bucket[event.side] += event.notional
  }

  return [...buckets.entries()]
    .filter(([, value]) => value.long > 0 || value.short > 0)
    .sort(([a], [b]) => a - b)
    .map(([time, value]) => ({
      time,
      long: value.long,
      short: value.short,
    }))
}

/**
 * Keep only buckets whose candle is loaded in the chart, so the pane never
 * draws bars outside the visible candle history window.
 */
export function filterAggregatedLiquidationBucketsToCandles(
  buckets: readonly AggregatedLiquidationBucket[],
  candleTimes: readonly number[],
): AggregatedLiquidationBucket[] {
  if (buckets.length === 0 || candleTimes.length === 0) return []
  const candleTimeSet = new Set(candleTimes)
  return buckets.filter((bucket) => candleTimeSet.has(bucket.time))
}
