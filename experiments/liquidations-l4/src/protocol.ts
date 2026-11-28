/**
 * MarketLens L4 `liquidations` channel protocol.
 *
 * Reference (public documentation): https://marketlens.app/api/l4/
 *
 * Every WebSocket binary message is one Parquet file. Its Parquet key-value
 * metadata is the file's *head*:
 *
 *   snapshot  "true" | "false"   starts/replaces an epoch, or a delta in it
 *   channel   "liquidations"
 *   coin      "BTC"
 *   epoch     stream epoch id (changes when the producer starts over)
 *   seq       delta counter inside the epoch. A snapshot carries the producer's
 *             current counter, which is NOT necessarily 0 (the live BTC stream
 *             has been observed at 28 356 and 33 519); the next delta continues
 *             from it, so the reducer adopts it instead of resetting to 0.
 *   ts        when the file's prices were taken (ms since epoch)
 *
 * On `liquidations` each row is one open position that has a liquidation price,
 * keyed by `user`:
 *
 *   price  the position's liquidation price (a long is a bid below the mark,
 *          a short an ask above it)
 *   size   the position, signed: positive long, negative short
 *   ts     when the position last changed
 *
 * A delta row carrying only its key (`user`) removes that position; removals
 * come first, then upserts. A snapshot replaces the channel's whole book. A
 * delta of another epoch than the snapshot that started the epoch is void, and
 * a `seq` gap means a delta was missed — both require reconnecting for a fresh
 * snapshot. A later snapshot can arrive at any time and replaces the book.
 *
 * This module is deliberately free of browser and network APIs so the state
 * machine can be tested with plain node:test.
 */

export const COIN = 'BTC'
export const CHANNEL = 'liquidations'
export const LIQUIDATIONS_URL =
  'wss://api.marketlens.app/data/hyperliquid/l4/liquidations/BTC'

export interface Head {
  snapshot: boolean
  channel: string
  coin: string
  epoch: string
  seq: number
  ts: number
}

/** One decoded Parquet row, normalised out of the columnar file. */
export interface RawRow {
  /** `0x`-prefixed 20-byte Hyperliquid account address. */
  user: string
  /** Liquidation price, or `null` on a removal row. */
  price: number | null
  /** Signed position size, or `null` on a removal row. */
  size: number | null
  /** When the position last changed, or `null` on a removal row. */
  ts: number | null
}

export interface Position {
  user: string
  price: number
  size: number
  ts: number
}

export interface Book {
  epoch: string
  /** `seq` of the last applied file; a delta must be exactly this plus one. */
  seq: number
  /** Head `ts` of the last applied file. */
  headTs: number
  positions: Map<string, Position>
}

export type ApplyOutcome =
  | {
      status: 'snapshot'
      book: Book
      added: number
      removed: number
      skipped: number
    }
  | {
      status: 'delta'
      book: Book
      added: number
      replaced: number
      removed: number
      skipped: number
    }
  | { status: 'duplicate'; book: Book }
  | {
      status: 'reset'
      reason: 'epoch' | 'gap' | 'no-snapshot' | 'protocol'
      detail: string
    }

/** A `key_value_metadata` entry as hyparquet exposes it. */
export interface HeadEntry {
  key?: string
  value?: string
}

function requireString(value: string | undefined, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`L4 head is missing "${field}"`)
  }
  return value
}

function requireInteger(value: string | undefined, field: string): number {
  const parsed = Number(requireString(value, field))
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    throw new Error(`L4 head "${field}" is not an integer: ${value}`)
  }
  return parsed
}

/**
 * Parse the head out of a Parquet file's key-value metadata. Returns `null`
 * when the file carries no head at all (not an L4 message); throws when a head
 * is present but cannot be trusted.
 */
export function parseHead(
  entries: readonly HeadEntry[] | null | undefined,
): Head | null {
  if (!entries || entries.length === 0) return null
  const map = new Map<string, string>()
  for (const entry of entries) {
    if (entry.key !== undefined && entry.value !== undefined) {
      map.set(entry.key, entry.value)
    }
  }
  const snapshot = map.get('snapshot')
  if (snapshot !== 'true' && snapshot !== 'false') return null
  return {
    snapshot: snapshot === 'true',
    channel: requireString(map.get('channel'), 'channel'),
    coin: requireString(map.get('coin'), 'coin'),
    epoch: requireString(map.get('epoch'), 'epoch'),
    seq: requireInteger(map.get('seq'), 'seq'),
    ts: requireInteger(map.get('ts'), 'ts'),
  }
}

/** Decode a Parquet row (`user`, `price`, `size`, `ts`, in that order). */
export function rowFromDecoded(row: readonly unknown[]): RawRow {
  const userBytes = row[0]
  let user: string
  if (userBytes instanceof Uint8Array) {
    user = `0x${Array.from(userBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  } else if (typeof userBytes === 'string') {
    user = userBytes.toLowerCase()
  } else {
    throw new Error('liquidations row has no user key')
  }
  return {
    user,
    price: toNumber(row[1]),
    size: toNumber(row[2]),
    ts: row[3] instanceof Date ? row[3].getTime() : toNumber(row[3]),
  }
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'bigint') return Number(value)
  if (value instanceof Date) return value.getTime()
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * How one row must be applied.
 *
 * `remove`  the row carries only its key (`user`), the protocol's removal form;
 *           a size of exactly zero also means no position on that side, so it
 *           removes the level rather than leaving a stale one on screen.
 * `upsert`  a position at a positive liquidation price with a signed size.
 * `invalid` anything else: ignored and counted, never guessed at.
 */
export type RowKind = 'remove' | 'upsert' | 'invalid'

export function classifyRow(row: RawRow): RowKind {
  if (row.price === null && row.size === null) return 'remove'
  if (row.price === null || row.size === null) return 'invalid'
  if (row.size === 0) return 'remove'
  if (!Number.isFinite(row.price) || row.price <= 0) return 'invalid'
  if (!Number.isFinite(row.size)) return 'invalid'
  return 'upsert'
}

/** True when a row carries only its key, which the protocol defines as removal. */
export function isRemovalRow(row: RawRow): boolean {
  return row.price === null && row.size === null
}

export function totals(book: Book | null): {
  count: number
  long: number
  short: number
} {
  let long = 0
  let short = 0
  if (book) {
    for (const position of book.positions.values()) {
      if (position.size > 0) long += position.size
      else short -= position.size
    }
  }
  return { count: book?.positions.size ?? 0, long, short }
}

/**
 * Apply one decoded file to the book.
 *
 * A snapshot always replaces the book (the stream may restart at any time).
 * A delta is only applied when it belongs to the current epoch and its `seq`
 * immediately follows the last applied one; the caller must reconnect on
 * `reset` instead of guessing, so a missed delta can never silently leave
 * liquidity on screen that no longer exists.
 */
export function applyFile(
  book: Book | null,
  head: Head,
  rows: readonly RawRow[],
): ApplyOutcome {
  if (head.channel !== CHANNEL) {
    return {
      status: 'reset',
      reason: 'protocol',
      detail: `unexpected channel "${head.channel}"`,
    }
  }
  if (head.coin !== COIN) {
    return {
      status: 'reset',
      reason: 'protocol',
      detail: `unexpected coin "${head.coin}"`,
    }
  }

  if (head.snapshot) {
    const positions = new Map<string, Position>()
    let skipped = 0
    for (const row of rows) {
      // A snapshot is a full picture: a removal row in one is meaningless.
      if (classifyRow(row) !== 'upsert') {
        skipped += 1
        continue
      }
      positions.set(row.user, {
        user: row.user,
        price: row.price as number,
        size: row.size as number,
        ts: (row.ts ?? head.ts) as number,
      })
    }
    return {
      status: 'snapshot',
      book: {
        epoch: head.epoch,
        // The snapshot's head carries the producer's current delta counter
        // (observed on the live stream: a snapshot with seq 28356 is followed
        // by 28357). Adopting it keeps the epoch's sequence continuous; a
        // producer that sends 0 behaves identically.
        seq: head.seq,
        headTs: head.ts,
        positions,
      },
      added: positions.size,
      removed: 0,
      skipped,
    }
  }

  if (!book) {
    return {
      status: 'reset',
      reason: 'no-snapshot',
      detail: 'delta received before any snapshot',
    }
  }
  if (head.epoch !== book.epoch) {
    return {
      status: 'reset',
      reason: 'epoch',
      detail: `delta epoch ${head.epoch} does not match book epoch ${book.epoch}`,
    }
  }
  if (head.seq === book.seq) {
    // Re-delivery of a delta already applied: nothing to do, no gap.
    return { status: 'duplicate', book }
  }
  if (head.seq !== book.seq + 1) {
    return {
      status: 'reset',
      reason: 'gap',
      detail: `expected seq ${book.seq + 1}, received ${head.seq}`,
    }
  }

  const positions = new Map(book.positions)
  let added = 0
  let replaced = 0
  let removed = 0
  let skipped = 0
  for (const row of rows) {
    const kind = classifyRow(row)
    if (kind === 'remove') {
      if (positions.delete(row.user)) removed += 1
      else skipped += 1
      continue
    }
    if (kind === 'invalid') {
      skipped += 1
      continue
    }
    if (positions.has(row.user)) replaced += 1
    else added += 1
    positions.set(row.user, {
      user: row.user,
      price: row.price as number,
      size: row.size as number,
      ts: (row.ts ?? head.ts) as number,
    })
  }
  return {
    status: 'delta',
    book: { epoch: book.epoch, seq: head.seq, headTs: head.ts, positions },
    added,
    replaced,
    removed,
    skipped,
  }
}
