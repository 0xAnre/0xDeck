/**
 * MarketLens L4 `liquidations` channel protocol — the open-position
 * liquidation *price* book, not executed liquidation events.
 *
 * Reference (public documentation): https://marketlens.app/api/l4/
 *
 * Provenance: the transport/protocol/decoder semantics below were authored in
 * PR #279 (`experiments/liquidations-l4/src/protocol.ts` at
 * 25b6b4dbe6f913a3f8b794e77770ea4035a5b8b6) as a standalone demo. They are
 * reused here as a normal application module so the chart feature is a
 * separate, main-targeted PR instead of a runtime import of an unmerged
 * experiment. See `docs/MARKETLENS-LIQUIDATION-LEVELS.md` for the shared-module
 * convergence note.
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
 *             has been observed around 28 356 and 33 519); the next delta
 *             continues from it, so the reducer adopts it instead of resetting
 *             to 0.
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

export const LIQUIDATION_LEVELS_COIN = 'BTC'
export const LIQUIDATION_LEVELS_CHANNEL = 'liquidations'
export const LIQUIDATION_LEVELS_STREAM_URL =
  'wss://api.marketlens.app/data/hyperliquid/l4/liquidations/BTC'

/** Where the profile's numbers come from, shown in the UI and docs. */
export const LIQUIDATION_LEVELS_SOURCE_LABEL =
  'MarketLens Hyperliquid L4 · open positions (BTC)'

export interface LiquidationLevelsHead {
  snapshot: boolean
  channel: string
  coin: string
  epoch: string
  seq: number
  ts: number
}

/** One decoded Parquet row, normalised out of the columnar file. */
export interface LiquidationLevelsRawRow {
  /** `0x`-prefixed 20-byte Hyperliquid account address. */
  user: string
  /** Liquidation price, or `null` on a removal row. */
  price: number | null
  /** Signed position size, or `null` on a removal row. */
  size: number | null
  /** When the position last changed, or `null` on a removal row. */
  ts: number | null
}

export interface LiquidationLevelPosition {
  user: string
  price: number
  size: number
  ts: number
}

export interface LiquidationLevelBook {
  epoch: string
  /** `seq` of the last applied file; a delta must be exactly this plus one. */
  seq: number
  /** Head `ts` of the last applied file. */
  headTs: number
  positions: Map<string, LiquidationLevelPosition>
}

export type LiquidationLevelsApplyOutcome =
  | {
      status: 'snapshot'
      book: LiquidationLevelBook
      added: number
      removed: number
      skipped: number
    }
  | {
      status: 'delta'
      book: LiquidationLevelBook
      added: number
      replaced: number
      removed: number
      skipped: number
    }
  | { status: 'duplicate'; book: LiquidationLevelBook }
  | {
      status: 'reset'
      reason: 'epoch' | 'gap' | 'no-snapshot' | 'protocol'
      detail: string
    }

/** A `key_value_metadata` entry as hyparquet exposes it. */
export interface LiquidationLevelsHeadEntry {
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
export function parseLiquidationLevelsHead(
  entries: readonly LiquidationLevelsHeadEntry[] | null | undefined,
): LiquidationLevelsHead | null {
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
export function liquidationLevelRowFromDecoded(
  row: readonly unknown[],
): LiquidationLevelsRawRow {
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
export type LiquidationLevelRowKind = 'remove' | 'upsert' | 'invalid'

export function classifyLiquidationLevelRow(
  row: LiquidationLevelsRawRow,
): LiquidationLevelRowKind {
  if (row.price === null && row.size === null) return 'remove'
  if (row.price === null || row.size === null) return 'invalid'
  if (row.size === 0) return 'remove'
  if (!Number.isFinite(row.price) || row.price <= 0) return 'invalid'
  if (!Number.isFinite(row.size)) return 'invalid'
  return 'upsert'
}

export function liquidationLevelsTotals(book: LiquidationLevelBook | null): {
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
export function applyLiquidationLevelsFile(
  book: LiquidationLevelBook | null,
  head: LiquidationLevelsHead,
  rows: readonly LiquidationLevelsRawRow[],
): LiquidationLevelsApplyOutcome {
  if (head.channel !== LIQUIDATION_LEVELS_CHANNEL) {
    return {
      status: 'reset',
      reason: 'protocol',
      detail: `unexpected channel "${head.channel}"`,
    }
  }
  if (head.coin !== LIQUIDATION_LEVELS_COIN) {
    return {
      status: 'reset',
      reason: 'protocol',
      detail: `unexpected coin "${head.coin}"`,
    }
  }

  if (head.snapshot) {
    const positions = new Map<string, LiquidationLevelPosition>()
    let skipped = 0
    for (const row of rows) {
      // A snapshot is a full picture: a removal row in one is meaningless.
      if (classifyLiquidationLevelRow(row) !== 'upsert') {
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
    const kind = classifyLiquidationLevelRow(row)
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

/* -------------------------------------------------------------------------- */
/* TPSL: live resting stop-loss / take-profit trigger orders                   */
/* -------------------------------------------------------------------------- */

/**
 * MarketLens L4 `tpsl` stream — two multiplexed channels on one connection.
 *
 * Public documentation: https://marketlens.app/api/l4/
 *
 * Verified against the live Parquet bytes (2026-11-28, BTC):
 *  - one socket carries both channels, each with its **own** snapshot, epoch
 *    and delta `seq` (observed snapshots at `stop_losses` seq 15 272 with 8 246
 *    rows and `take_profits` seq 11 758 with 11 047 rows — non-zero, despite the
 *    published "snapshot seq is 0" text);
 *  - schema: `id` INT64 (hyparquet yields a **bigint**), `ts` INT64,
 *    `price`/`size`/`position_size` DECIMAL(18, s), `user` FIXED_LEN_BYTE_ARRAY
 *    (20). Prices/sizes arrive already scaled (BTC: 1 price decimal, 5 size
 *    decimals).
 *  - a row is an order keyed by `id`; a row carrying only its key (`price`,
 *    `size`, `position_size`, `user` null) removes that order;
 *  - **`size === 0` is not a deletion**: it is a position-wide order that closes
 *    the whole position. A non-zero `size` is a fixed order that closes at most
 *    its size. Both are signed like the closing order (negative = sell, closes a
 *    long; positive = buy, closes a short);
 *  - `position_size` is that trader's position the order would close, signed the
 *    same way; `0` when there is none on the side it closes, and null on
 *    removal rows. Real bytes contained fixed orders with `|position_size|` both
 *    smaller and larger than `|size|`, so the effective covered size is
 *    `min(|size|, |position_size|)` (or `|position_size|` for a whole-position
 *    order);
 *  - `size` and `position_size` never disagreed in sign (0 mismatches in
 *    18 172 priced rows across both snapshots).
 *
 * These are waiting trigger orders at their trigger price — not filled orders,
 * not historical events, and not guaranteed executable liquidity.
 */

export const TPSL_CHANNELS = ['take_profits', 'stop_losses'] as const

export type TpslChannel = (typeof TPSL_CHANNELS)[number]

export const TPSL_STREAM_URL =
  'wss://api.marketlens.app/data/hyperliquid/l4/tpsl/BTC'

const TPSL_CHANNEL_SET = new Set<string>(TPSL_CHANNELS)

export function isTpslChannel(value: string): value is TpslChannel {
  return TPSL_CHANNEL_SET.has(value)
}

export interface TpslHead {
  snapshot: boolean
  channel: string
  coin: string
  epoch: string
  seq: number
  ts: number
}

/** One decoded TPSL row; a removal row has only `id`. */
export interface TpslRawRow {
  /** Decimal string of the unsigned 64-bit order id (bigint-safe). */
  id: string
  ts: number | null
  /** Trigger price, or `null` on a removal row. */
  price: number | null
  /** Signed order size: 0 = whole position, otherwise a fixed size. */
  size: number | null
  /** `0x`-prefixed 20-byte account address, or `null` on a removal row. */
  user: string | null
  /** Signed position the order would close, `0` = none on that side. */
  positionSize: number | null
}

/** Which side of the trader's position the order would close. */
export type TpslSide = 'long' | 'short'

export interface TpslOrder {
  id: string
  ts: number
  price: number
  /** Requested order size exactly as published (signed; 0 = whole position). */
  size: number
  /** Position the order would close, `null` when the file carried none. */
  positionSize: number | null
  user: string | null
  /** Absolute position-covered size, the profile's bar magnitude. */
  effectiveSize: number
  /** Position side the order closes, `null` when no position is covered. */
  side: TpslSide | null
}

export interface TpslBook {
  channel: TpslChannel
  epoch: string
  /** `seq` of the last applied file (a snapshot's is adopted, zero or not). */
  seq: number
  headTs: number
  orders: Map<string, TpslOrder>
}

export type TpslApplyOutcome =
  | {
      status: 'snapshot'
      channel: TpslChannel
      book: TpslBook
      added: number
      skipped: number
    }
  | {
      status: 'delta'
      channel: TpslChannel
      book: TpslBook
      added: number
      replaced: number
      removed: number
      skipped: number
    }
  | { status: 'duplicate'; channel: TpslChannel; book: TpslBook }
  | {
      status: 'reset'
      channel: TpslChannel | null
      reason: 'channel' | 'epoch' | 'gap' | 'no-snapshot' | 'protocol'
      detail: string
    }

/**
 * Parse a TPSL head. Returns `null` when the file carries no head at all and
 * throws when a head is present but cannot be trusted (same contract as the
 * liquidation head).
 */
export function parseTpslHead(
  entries: readonly LiquidationLevelsHeadEntry[] | null | undefined,
): TpslHead | null {
  const head = parseLiquidationLevelsHead(entries)
  if (!head) return null
  return head
}

function tpslOrderIdFromDecoded(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string' && value.length > 0) return value
  if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
    return BigInt(value).toString()
  }
  throw new Error('tpsl row has no order id')
}

function tpslUserFromDecoded(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Uint8Array) {
    return `0x${Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('')}`
  }
  if (typeof value === 'string') return value.toLowerCase()
  return null
}

/** Decode a Parquet row (`id`, `ts`, `price`, `size`, `user`, `position_size`). */
export function tpslRowFromDecoded(row: readonly unknown[]): TpslRawRow {
  return {
    id: tpslOrderIdFromDecoded(row[0]),
    ts: row[1] instanceof Date ? row[1].getTime() : toNumber(row[1]),
    price: toNumber(row[2]),
    size: toNumber(row[3]),
    user: tpslUserFromDecoded(row[4]),
    positionSize: toNumber(row[5]),
  }
}

export type TpslRowKind = 'remove' | 'upsert' | 'invalid'

/**
 * `remove` only when the row carries its key alone. `size === 0` is a valid
 * position-wide order, never a removal.
 */
export function classifyTpslRow(row: TpslRawRow): TpslRowKind {
  if (row.price === null && row.size === null && row.positionSize === null) {
    return 'remove'
  }
  if (row.price === null || row.size === null) return 'invalid'
  if (!Number.isFinite(row.price) || row.price <= 0) return 'invalid'
  if (!Number.isFinite(row.size)) return 'invalid'
  return 'upsert'
}

/**
 * Bar magnitude: the position size the order can actually close.
 *
 * A whole-position order (`size === 0`) covers the whole position; a fixed
 * order closes at most its own size, and never more than the position it would
 * close. `position_size` 0 or missing means no covered position (0).
 */
export function tpslOrderEffectiveSize(
  size: number,
  positionSize: number | null,
): number {
  if (!Number.isFinite(size)) return 0
  const position = positionSize === null ? 0 : Math.abs(positionSize)
  if (!Number.isFinite(position) || position <= 0) return 0
  if (size === 0) return position
  const requested = Math.abs(size)
  return Number.isFinite(requested) ? Math.min(requested, position) : 0
}

/**
 * Position side the order would close: the feed signs `position_size` like the
 * closing order, so negative (a sell) closes a long and positive (a buy)
 * closes a short. `0`/missing means no position on that side.
 */
export function tpslOrderSide(positionSize: number | null): TpslSide | null {
  if (positionSize === null || !Number.isFinite(positionSize) || positionSize === 0) {
    return null
  }
  return positionSize < 0 ? 'long' : 'short'
}

export function tpslOrderFromRow(row: TpslRawRow, headTs: number): TpslOrder | null {
  if (classifyTpslRow(row) !== 'upsert') return null
  const price = row.price as number
  const size = row.size as number
  return {
    id: row.id,
    ts: row.ts ?? headTs,
    price,
    size,
    positionSize: row.positionSize,
    user: row.user,
    effectiveSize: tpslOrderEffectiveSize(size, row.positionSize),
    side: tpslOrderSide(row.positionSize),
  }
}

/**
 * Apply one decoded TPSL file to its channel's book.
 *
 * Both channels are independent: a file only ever touches the book of its own
 * `channel`, and only that channel's epoch/`seq` sequence is compared. A gap, a
 * foreign epoch, a delta before a snapshot or a foreign channel returns
 * `reset`; the caller reconnects for fresh snapshots and never mixes the two
 * sequences.
 */
export function applyTpslFile(
  book: TpslBook | null,
  head: TpslHead,
  rows: readonly TpslRawRow[],
): TpslApplyOutcome {
  if (!isTpslChannel(head.channel)) {
    return {
      status: 'reset',
      channel: null,
      reason: 'channel',
      detail: `unexpected tpsl channel "${head.channel}"`,
    }
  }
  const channel = head.channel
  if (head.coin !== LIQUIDATION_LEVELS_COIN) {
    return {
      status: 'reset',
      channel,
      reason: 'protocol',
      detail: `unexpected coin "${head.coin}"`,
    }
  }
  const currentBook = book && book.channel === channel ? book : null

  if (head.snapshot) {
    const orders = new Map<string, TpslOrder>()
    let skipped = 0
    for (const row of rows) {
      const order = tpslOrderFromRow(row, head.ts)
      if (!order) {
        skipped += 1
        continue
      }
      orders.set(order.id, order)
    }
    return {
      status: 'snapshot',
      channel,
      book: {
        channel,
        epoch: head.epoch,
        // The snapshot's counter is adopted whether it is 0 or not; the live
        // stream sends non-zero counters and the next delta continues from it.
        seq: head.seq,
        headTs: head.ts,
        orders,
      },
      added: orders.size,
      skipped,
    }
  }

  if (!currentBook) {
    return {
      status: 'reset',
      channel,
      reason: 'no-snapshot',
      detail: 'tpsl delta received before that channel had a snapshot',
    }
  }
  if (head.epoch !== currentBook.epoch) {
    return {
      status: 'reset',
      channel,
      reason: 'epoch',
      detail: `tpsl delta epoch ${head.epoch} does not match channel epoch ${currentBook.epoch}`,
    }
  }
  if (head.seq === currentBook.seq) {
    return { status: 'duplicate', channel, book: currentBook }
  }
  if (head.seq !== currentBook.seq + 1) {
    return {
      status: 'reset',
      channel,
      reason: 'gap',
      detail: `expected seq ${currentBook.seq + 1}, received ${head.seq}`,
    }
  }

  const orders = new Map(currentBook.orders)
  let added = 0
  let replaced = 0
  let removed = 0
  let skipped = 0
  for (const row of rows) {
    const kind = classifyTpslRow(row)
    if (kind === 'remove') {
      if (orders.delete(row.id)) removed += 1
      else skipped += 1
      continue
    }
    const order = tpslOrderFromRow(row, head.ts)
    if (!order) {
      skipped += 1
      continue
    }
    if (orders.has(order.id)) replaced += 1
    else added += 1
    orders.set(order.id, order)
  }
  return {
    status: 'delta',
    channel,
    book: {
      channel,
      epoch: currentBook.epoch,
      seq: head.seq,
      headTs: head.ts,
      orders,
    },
    added,
    replaced,
    removed,
    skipped,
  }
}

/** Absolute size per position side, counted on demand (hover/summary only). */
export function tpslTotals(book: TpslBook | null): {
  count: number
  long: number
  short: number
  effective: number
} {
  let long = 0
  let short = 0
  let effective = 0
  if (book) {
    for (const order of book.orders.values()) {
      effective += order.effectiveSize
      if (order.side === 'long') long += order.effectiveSize
      else if (order.side === 'short') short += order.effectiveSize
    }
  }
  return { count: book?.orders.size ?? 0, long, short, effective }
}
