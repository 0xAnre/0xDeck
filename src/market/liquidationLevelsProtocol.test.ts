/**
 * Protocol tests for the live liquidation-price book.
 *
 * Provenance: adapted from PR #279
 * (`experiments/liquidations-l4/src/protocol.test.ts` at
 * 25b6b4dbe6f913a3f8b794e77770ea4035a5b8b6) with the application module's
 * names. The snapshot/sequence/epoch/gap/removal semantics are unchanged.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyLiquidationLevelsFile,
  classifyLiquidationLevelRow,
  liquidationLevelsTotals,
  liquidationLevelRowFromDecoded,
  parseLiquidationLevelsHead,
  type LiquidationLevelBook,
  type LiquidationLevelsHead,
  type LiquidationLevelsRawRow,
} from './liquidationLevelsProtocol.ts'

const head = (over: Partial<LiquidationLevelsHead> = {}): LiquidationLevelsHead => ({
  snapshot: false,
  channel: 'liquidations',
  coin: 'BTC',
  epoch: 'e1',
  seq: 1,
  ts: 1_700_000_000_000,
  ...over,
})

const position = (
  user: string,
  price: number,
  size: number,
  ts = 1_700_000_000_000,
): LiquidationLevelsRawRow => ({ user, price, size, ts })

const removal = (user: string): LiquidationLevelsRawRow => ({ user, price: null, size: null, ts: null })

function snapshotBook(rows: LiquidationLevelsRawRow[], over: Partial<LiquidationLevelsHead> = {}): LiquidationLevelBook {
  const outcome = applyLiquidationLevelsFile(null, head({ snapshot: true, seq: 0, ...over }), rows)
  assert.equal(outcome.status, 'snapshot')
  if (outcome.status !== 'snapshot') throw new Error('unreachable')
  return outcome.book
}

describe('parseLiquidationLevelsHead', () => {
  it('parses the Parquet key-value head into typed fields', () => {
    const parsed = parseLiquidationLevelsHead([
      { key: 'snapshot', value: 'true' },
      { key: 'channel', value: 'liquidations' },
      { key: 'coin', value: 'BTC' },
      { key: 'epoch', value: '1795829765666' },
      { key: 'seq', value: '0' },
      { key: 'ts', value: '1795844223010' },
    ])
    assert.deepEqual(parsed, {
      snapshot: true,
      channel: 'liquidations',
      coin: 'BTC',
      epoch: '1795829765666',
      seq: 0,
      ts: 1795844223010,
    })
  })

  it('returns null when the file carries no L4 head', () => {
    assert.equal(parseLiquidationLevelsHead(null), null)
    assert.equal(parseLiquidationLevelsHead([]), null)
    assert.equal(parseLiquidationLevelsHead([{ key: 'other', value: 'x' }]), null)
  })

  it('rejects a head whose numbers are not integers', () => {
    assert.throws(() =>
      parseLiquidationLevelsHead([
        { key: 'snapshot', value: 'false' },
        { key: 'channel', value: 'liquidations' },
        { key: 'coin', value: 'BTC' },
        { key: 'epoch', value: 'e1' },
        { key: 'seq', value: '1.5' },
        { key: 'ts', value: '2' },
      ]),
    )
    assert.throws(() =>
      parseLiquidationLevelsHead([
        { key: 'snapshot', value: 'false' },
        { key: 'channel', value: 'liquidations' },
        { key: 'coin', value: 'BTC' },
        { key: 'epoch', value: 'e1' },
      ]),
    )
  })
})

describe('liquidationLevelRowFromDecoded', () => {
  it('turns a 20-byte account into a 0x address and keeps decimals signed', () => {
    const bytes = new Uint8Array(20)
    bytes[0] = 0x8c
    bytes[19] = 0xd6
    const row = liquidationLevelRowFromDecoded([bytes, 85_412.3, -0.18981, new Date(1_700_000_000_000)])
    assert.equal(row.user.length, 42)
    assert.equal(row.user, `0x8c${'0'.repeat(36)}d6`)
    assert.equal(row.price, 85_412.3)
    assert.equal(row.size, -0.18981)
    assert.equal(row.ts, 1_700_000_000_000)
  })

  it('keeps removal rows null instead of inventing values', () => {
    const row = liquidationLevelRowFromDecoded([new Uint8Array(20), null, null, null])
    assert.equal(row.price, null)
    assert.equal(row.size, null)
    assert.equal(row.ts, null)
  })

  it('throws when a row has no key', () => {
    assert.throws(() => liquidationLevelRowFromDecoded([null, 1, 2, 3]))
  })
})

describe('classifyLiquidationLevelRow', () => {
  it('distinguishes removals, upserts and unusable rows', () => {
    assert.equal(classifyLiquidationLevelRow(removal('0xa')), 'remove')
    assert.equal(classifyLiquidationLevelRow(position('0xa', 100, 0)), 'remove')
    assert.equal(classifyLiquidationLevelRow({ user: '0xa', price: null, size: 1, ts: 1 }), 'invalid')
    assert.equal(classifyLiquidationLevelRow({ user: '0xa', price: 100, size: null, ts: 1 }), 'invalid')
    assert.equal(classifyLiquidationLevelRow(position('0xa', 0, 1)), 'invalid')
    assert.equal(classifyLiquidationLevelRow(position('0xa', -5, 1)), 'invalid')
    assert.equal(classifyLiquidationLevelRow(position('0xa', 100, 1)), 'upsert')
  })
})

describe('applyLiquidationLevelsFile — snapshot', () => {
  it('replaces the whole book and starts a new epoch', () => {
    const book = snapshotBook(
      [position('0xa', 90_000, 1.5), position('0xb', 70_000, -2), removal('0xc')],
      { epoch: 'e9', ts: 111 },
    )
    assert.equal(book.epoch, 'e9')
    assert.equal(book.seq, 0)
    assert.equal(book.headTs, 111)
    assert.equal(book.positions.size, 2)
    assert.deepEqual(book.positions.get('0xa'), {
      user: '0xa',
      price: 90_000,
      size: 1.5,
      ts: 1_700_000_000_000,
    })
  })

  it("adopts the snapshot's own sequence so the next delta is contiguous", () => {
    const book = snapshotBook([position('0xa', 90_000, 1)], { seq: 28_356 })
    assert.equal(book.seq, 28_356)
    const applied = applyLiquidationLevelsFile(book, head({ seq: 28_357 }), [position('0xb', 80_000, 1)])
    assert.equal(applied.status, 'delta')
    if (applied.status !== 'delta') throw new Error('unreachable')
    assert.equal(applied.book.seq, 28_357)
    const gap = applyLiquidationLevelsFile(applied.book, head({ seq: 28_359 }), [])
    assert.equal(gap.status, 'reset')
    if (gap.status !== 'reset') throw new Error('unreachable')
    assert.equal(gap.reason, 'gap')
  })

  it('discards levels the previous book had but the snapshot does not', () => {
    const first = snapshotBook([position('0xa', 90_000, 1), position('0xb', 80_000, 1)])
    const outcome = applyLiquidationLevelsFile(
      first,
      head({ snapshot: true, seq: 0, epoch: 'e2' }),
      [position('0xa', 90_000, 1)],
    )
    assert.equal(outcome.status, 'snapshot')
    if (outcome.status !== 'snapshot') throw new Error('unreachable')
    assert.equal(outcome.book.positions.size, 1)
    assert.equal(outcome.book.positions.has('0xb'), false)
  })

  it('does not mutate the book it replaces', () => {
    const first = snapshotBook([position('0xa', 90_000, 1)])
    applyLiquidationLevelsFile(first, head({ snapshot: true, seq: 0, epoch: 'e2' }), [
      position('0xa', 91_000, 3),
    ])
    assert.deepEqual(first.positions.get('0xa'), {
      user: '0xa',
      price: 90_000,
      size: 1,
      ts: 1_700_000_000_000,
    })
  })
})

describe('applyLiquidationLevelsFile — delta', () => {
  it('adds, replaces and removes by user key', () => {
    const book = snapshotBook([position('0xa', 90_000, 1), position('0xb', 80_000, -1)])
    const outcome = applyLiquidationLevelsFile(book, head({ seq: 1 }), [
      removal('0xb'),
      position('0xa', 91_000, 2),
      position('0xd', 60_000, -3),
    ])
    assert.equal(outcome.status, 'delta')
    if (outcome.status !== 'delta') throw new Error('unreachable')
    assert.equal(outcome.added, 1)
    assert.equal(outcome.replaced, 1)
    assert.equal(outcome.removed, 1)
    assert.equal(outcome.book.seq, 1)
    assert.equal(outcome.book.positions.size, 2)
    assert.equal(outcome.book.positions.get('0xa')?.price, 91_000)
    assert.equal(outcome.book.positions.get('0xa')?.size, 2)
    assert.equal(outcome.book.positions.has('0xb'), false)
    assert.equal(outcome.book.positions.get('0xd')?.size, -3)
  })

  it('leaves the previous book untouched (a render can keep reading it)', () => {
    const book = snapshotBook([position('0xa', 90_000, 1)])
    applyLiquidationLevelsFile(book, head({ seq: 1 }), [removal('0xa')])
    assert.equal(book.positions.size, 1)
    assert.equal(book.seq, 0)
  })

  it('treats a re-delivered sequence number as an idempotent duplicate', () => {
    const book = snapshotBook([position('0xa', 90_000, 1)])
    const applied = applyLiquidationLevelsFile(book, head({ seq: 1 }), [position('0xb', 80_000, 1)])
    assert.equal(applied.status, 'delta')
    if (applied.status !== 'delta') throw new Error('unreachable')
    const outcome = applyLiquidationLevelsFile(applied.book, head({ seq: 1 }), [position('0xc', 70_000, 1)])
    assert.equal(outcome.status, 'duplicate')
    if (outcome.status !== 'duplicate') throw new Error('unreachable')
    assert.equal(outcome.book.positions.size, 2)
  })

  it('requires a snapshot before any delta', () => {
    const outcome = applyLiquidationLevelsFile(null, head({ seq: 4 }), [position('0xa', 90_000, 1)])
    assert.equal(outcome.status, 'reset')
    if (outcome.status !== 'reset') throw new Error('unreachable')
    assert.equal(outcome.reason, 'no-snapshot')
  })

  it('rejects a delta from another epoch instead of mixing books', () => {
    const book = snapshotBook([position('0xa', 90_000, 1)], { epoch: 'e1' })
    const outcome = applyLiquidationLevelsFile(book, head({ epoch: 'e2', seq: 1 }), [
      position('0xb', 80_000, 1),
    ])
    assert.equal(outcome.status, 'reset')
    if (outcome.status !== 'reset') throw new Error('unreachable')
    assert.equal(outcome.reason, 'epoch')
  })

  it('reports a sequence gap so the caller reconnects for a fresh snapshot', () => {
    const book = snapshotBook([position('0xa', 90_000, 1)], { seq: 0 })
    const outcome = applyLiquidationLevelsFile(book, head({ seq: 5 }), [position('0xb', 80_000, 1)])
    assert.equal(outcome.status, 'reset')
    if (outcome.status !== 'reset') throw new Error('unreachable')
    assert.equal(outcome.reason, 'gap')
    assert.match(outcome.detail, /expected seq 1, received 5/)
  })

  it('rejects a file for another channel or coin', () => {
    const book = snapshotBook([position('0xa', 90_000, 1)])
    const otherChannel = applyLiquidationLevelsFile(book, head({ channel: 'order_book', seq: 1 }), [])
    const otherCoin = applyLiquidationLevelsFile(book, head({ coin: 'HYPE', seq: 1 }), [])
    assert.equal(otherChannel.status, 'reset')
    assert.equal(otherCoin.status, 'reset')
  })

  it('counts unusable rows instead of applying them', () => {
    const book = snapshotBook([position('0xa', 90_000, 1)])
    const outcome = applyLiquidationLevelsFile(book, head({ seq: 1 }), [
      { user: '0xbad', price: null, size: 4, ts: 1 },
      position('0xb', 80_000, 1),
    ])
    assert.equal(outcome.status, 'delta')
    if (outcome.status !== 'delta') throw new Error('unreachable')
    assert.equal(outcome.skipped, 1)
    assert.equal(outcome.book.positions.has('0xbad'), false)
    assert.equal(outcome.book.positions.size, 2)
  })
})

describe('totals', () => {
  it('sums signed positions per side', () => {
    const book = snapshotBook([
      position('0xa', 90_000, 1.25),
      position('0xb', 80_000, -0.75),
      position('0xc', 70_000, 2),
    ])
    assert.deepEqual(liquidationLevelsTotals(book), { count: 3, long: 3.25, short: 0.75 })
    assert.deepEqual(liquidationLevelsTotals(null), { count: 0, long: 0, short: 0 })
  })
})
