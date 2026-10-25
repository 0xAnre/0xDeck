/**
 * Pure Hyperliquid fill parsing, dedupe, bucketing, filtering and marker grouping.
 *
 * Markers are side-only: every buy fill in a candle bucket becomes one upward
 * marker and every sell fill becomes one downward marker.
 */
import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import type { CandleInterval } from './types.ts'

export type HyperliquidFill = {
  coin: string
  price: number
  size: number
  side: 'B' | 'A'
  time: number
  startPosition: number | null
  direction: string | null
  closedPnl: number | null
  fee: number | null
  hash: string | null
  oid: number | null
  tid: number | null
}

export type BucketedHyperliquidFill = HyperliquidFill & {
  /** Candle open time (unix seconds) in the active chart interval. */
  bucketTime: number
  /** Signed position before/after this fill when `startPosition` is present. */
  positionBefore: number | null
  positionAfter: number | null
}

/** At most one marker per side per candle bucket. */
export type HyperliquidFillMarkerGroup = {
  key: string
  bucketTime: number
  side: 'B' | 'A'
  fills: BucketedHyperliquidFill[]
}

const HYPERLIQUID_COIN = 'BTC'

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function readOptionalNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  return readFiniteNumber(value)
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

type RawFillRecord = Record<string, unknown>

/**
 * Parse one backend/WS fill payload defensively. Accepts both the normalized
 * snake_case shape and the raw upstream camelCase shape.
 */
export function parseHyperliquidFill(raw: unknown): HyperliquidFill | null {
  if (!raw || typeof raw !== 'object') return null
  const record = raw as RawFillRecord

  const coin = readOptionalString(record.coin)
  const side = readOptionalString(record.side)
  if (coin === null || (side !== 'B' && side !== 'A')) return null
  if (coin.toUpperCase() !== HYPERLIQUID_COIN) return null

  const price = readFiniteNumber(record.price ?? record.px)
  const size = readFiniteNumber(record.size ?? record.sz)
  const time = readFiniteNumber(record.time)
  if (
    price === null ||
    price <= 0 ||
    size === null ||
    size <= 0 ||
    time === null ||
    time <= 0
  ) {
    return null
  }

  const oid = readFiniteNumber(record.oid)
  const tid = readFiniteNumber(record.tid)

  return {
    coin: HYPERLIQUID_COIN,
    price,
    size,
    side,
    time: Math.trunc(time),
    startPosition: readOptionalNumber(record.startPosition ?? record.start_position),
    direction: readOptionalString(record.dir ?? record.direction),
    closedPnl: readOptionalNumber(record.closedPnl ?? record.closed_pnl),
    fee: readOptionalNumber(record.fee),
    hash: readOptionalString(record.hash),
    oid: oid === null ? null : Math.trunc(oid),
    tid: tid === null ? null : Math.trunc(tid),
  }
}

/** Stable fill identity: `tid`, falling back to hash + oid + time + coin. */
export function hyperliquidFillIdentityKey(fill: HyperliquidFill): string {
  if (fill.tid !== null) return `tid:${fill.tid}`
  return [fill.hash ?? '', fill.oid ?? '', fill.time, fill.coin].join('|')
}

export function dedupeHyperliquidFills(fills: readonly HyperliquidFill[]): HyperliquidFill[] {
  const seen = new Set<string>()
  const unique: HyperliquidFill[] = []
  for (const fill of fills) {
    const key = hyperliquidFillIdentityKey(fill)
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(fill)
  }
  return unique
}

/** Merge REST + WS fills without duplicates (reconnect/overlap safe). */
export function mergeHyperliquidFills(
  existing: readonly HyperliquidFill[],
  incoming: readonly HyperliquidFill[],
): HyperliquidFill[] {
  return dedupeHyperliquidFills([...existing, ...incoming]).sort(
    (a, b) =>
      a.time - b.time ||
      hyperliquidFillIdentityKey(a).localeCompare(hyperliquidFillIdentityKey(b)),
  )
}

/** Candle bucket (open time, unix seconds) for a fill execution time. */
export function hyperliquidFillBucketSeconds(
  timeMs: number,
  interval: CandleInterval,
): number {
  const duration = candleIntervalDurationSeconds(interval)
  return Math.floor(Math.floor(timeMs / 1000) / duration) * duration
}

export function bucketHyperliquidFills(
  fills: readonly HyperliquidFill[],
  interval: CandleInterval,
): BucketedHyperliquidFill[] {
  return fills.map((fill) => {
    const positionBefore = fill.startPosition
    const positionAfter =
      positionBefore === null
        ? null
        : positionBefore + (fill.side === 'B' ? fill.size : -fill.size)
    return {
      ...fill,
      bucketTime: hyperliquidFillBucketSeconds(fill.time, interval),
      positionBefore,
      positionAfter,
    }
  })
}

/**
 * Keep only fills whose bucket has a loaded candle. Markers may never be
 * anchored to a time the chart does not have; duplicate identities (e.g. after
 * a REST/WS merge) are removed.
 */
export function filterHyperliquidFillsToLoadedCandles(
  fills: readonly BucketedHyperliquidFill[],
  candleTimes: Iterable<number>,
): BucketedHyperliquidFill[] {
  const loaded = new Set(candleTimes)
  const seen = new Set<string>()
  const filtered: BucketedHyperliquidFill[] = []
  for (const fill of fills) {
    if (!loaded.has(fill.bucketTime)) continue
    const key = hyperliquidFillIdentityKey(fill)
    if (seen.has(key)) continue
    seen.add(key)
    filtered.push(fill)
  }
  return filtered
}

/**
 * Collapse same-side fills in one candle bucket into a single marker group.
 * Result has at most one `B` and one `A` group per bucket (max 2 markers).
 */
export function groupHyperliquidFillMarkers(
  fills: readonly BucketedHyperliquidFill[],
): HyperliquidFillMarkerGroup[] {
  const groups = new Map<string, HyperliquidFillMarkerGroup>()
  for (const fill of fills) {
    const key = `${fill.bucketTime}:${fill.side}`
    const group = groups.get(key)
    if (group) {
      group.fills.push(fill)
    } else {
      groups.set(key, {
        key,
        bucketTime: fill.bucketTime,
        side: fill.side,
        fills: [fill],
      })
    }
  }

  return [...groups.values()]
    .map((group) => ({
      ...group,
      fills: [...group.fills].sort(
        (a, b) =>
          a.time - b.time ||
          hyperliquidFillIdentityKey(a).localeCompare(hyperliquidFillIdentityKey(b)),
      ),
    }))
    .sort(
      (a, b) =>
        a.bucketTime - b.bucketTime ||
        (a.side === b.side ? 0 : a.side === 'B' ? -1 : 1),
    )
}
