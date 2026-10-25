/**
 * Pure Hyperliquid fill classification, dedupe, bucketing and filtering.
 *
 * Classification is based on `startPosition` (the signed position size before
 * the fill), never on the current position's average entry price. When a fill
 * omits `startPosition`, a chronological running position is used instead.
 */
import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import type { CandleInterval } from './types.ts'

export type HyperliquidFillKind = 'entry' | 'reduce' | 'close'
export type HyperliquidFillEventSide = 'long' | 'short'

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

export type HyperliquidFillEvent = {
  /** Stable identity for this event (a reversal yields two event keys). */
  key: string
  kind: HyperliquidFillKind
  side: HyperliquidFillEventSide
  price: number
  size: number
  /** Actual execution time in epoch milliseconds. */
  time: number
  direction: string | null
  tid: number | null
  positionBefore: number
  positionAfter: number
}

export type BucketedHyperliquidFillEvent = HyperliquidFillEvent & {
  /** Candle open time (unix seconds) in the active chart interval. */
  bucketTime: number
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

function signOf(value: number): -1 | 0 | 1 {
  if (value > 0) return 1
  if (value < 0) return -1
  return 0
}

function sideForSignedPosition(value: number): HyperliquidFillEventSide {
  return value >= 0 ? 'long' : 'short'
}

function buildEvent(
  fill: HyperliquidFill,
  kind: HyperliquidFillKind,
  side: HyperliquidFillEventSide,
  before: number,
  after: number,
): HyperliquidFillEvent {
  return {
    key: `${hyperliquidFillIdentityKey(fill)}:${kind}:${side}`,
    kind,
    side,
    price: fill.price,
    size: fill.size,
    time: fill.time,
    direction: fill.direction,
    tid: fill.tid,
    positionBefore: before,
    positionAfter: after,
  }
}

/**
 * Classify BTC fills into entry / reduce / close events.
 *
 * A sign flip produces a close for the old side and an entry for the new side
 * at the same fill time. A partial close is always `reduce`, never `close`.
 */
export function classifyHyperliquidFills(rawFills: readonly unknown[]): HyperliquidFillEvent[] {
  const parsed = rawFills
    .map(parseHyperliquidFill)
    .filter((fill): fill is HyperliquidFill => fill !== null)

  const fills = dedupeHyperliquidFills(parsed).sort(
    (a, b) =>
      a.time - b.time ||
      hyperliquidFillIdentityKey(a).localeCompare(hyperliquidFillIdentityKey(b)),
  )

  const events: HyperliquidFillEvent[] = []
  let runningPosition = 0

  for (const fill of fills) {
    const before = fill.startPosition ?? runningPosition
    const signedSize = fill.side === 'B' ? fill.size : -fill.size
    const after = before + signedSize
    runningPosition = after

    if (after === before) continue

    const beforeSign = signOf(before)
    const afterSign = signOf(after)

    if (beforeSign === 0) {
      events.push(buildEvent(fill, 'entry', sideForSignedPosition(after), before, after))
      continue
    }

    if (beforeSign === afterSign) {
      const kind: HyperliquidFillKind =
        Math.abs(after) > Math.abs(before) ? 'entry' : after === 0 ? 'close' : 'reduce'
      events.push(buildEvent(fill, kind, sideForSignedPosition(before), before, after))
      continue
    }

    if (afterSign === 0) {
      events.push(buildEvent(fill, 'close', sideForSignedPosition(before), before, after))
      continue
    }

    // Reversal: close the old side, then enter the new side at the same time.
    events.push(buildEvent(fill, 'close', sideForSignedPosition(before), before, 0))
    events.push(buildEvent(fill, 'entry', sideForSignedPosition(after), 0, after))
  }

  return events
}

/** Candle bucket (open time, unix seconds) for a fill execution time. */
export function hyperliquidFillBucketSeconds(
  timeMs: number,
  interval: CandleInterval,
): number {
  const duration = candleIntervalDurationSeconds(interval)
  return Math.floor(Math.floor(timeMs / 1000) / duration) * duration
}

export function bucketHyperliquidFillEvents(
  events: readonly HyperliquidFillEvent[],
  interval: CandleInterval,
): BucketedHyperliquidFillEvent[] {
  return events.map((event) => ({
    ...event,
    bucketTime: hyperliquidFillBucketSeconds(event.time, interval),
  }))
}

/**
 * Keep only events whose bucket has a loaded candle. Markers may never be
 * anchored to a time the chart does not have, and duplicate event keys (e.g.
 * after a REST/WS merge) are removed.
 */
export function filterHyperliquidFillEventsToLoadedCandles(
  events: readonly BucketedHyperliquidFillEvent[],
  candleTimes: Iterable<number>,
): BucketedHyperliquidFillEvent[] {
  const loaded = new Set(candleTimes)
  const seen = new Set<string>()
  const filtered: BucketedHyperliquidFillEvent[] = []
  for (const event of events) {
    if (!loaded.has(event.bucketTime)) continue
    if (seen.has(event.key)) continue
    seen.add(event.key)
    filtered.push(event)
  }
  return filtered
}

export function hyperliquidFillEventLabel(event: HyperliquidFillEvent): string {
  const side = event.side === 'long' ? 'Long' : 'Short'
  switch (event.kind) {
    case 'entry':
      return `${side} entry`
    case 'reduce':
      return `${side} reduce`
    case 'close':
      return `${side} close`
  }
}
