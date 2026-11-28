import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  applyTpslFile,
  classifyTpslRow,
  tpslOrderEffectiveSize,
  tpslOrderFromRow,
  tpslOrderSide,
  tpslRowFromDecoded,
  tpslTotals,
  type TpslBook,
  type TpslHead,
  type TpslRawRow,
} from './liquidationLevelsProtocol.ts'

const head = (over: Partial<TpslHead> = {}): TpslHead => ({
  snapshot: false,
  channel: 'stop_losses',
  coin: 'BTC',
  epoch: 'e1',
  seq: 1,
  ts: 1_700_000_000_000,
  ...over,
})

const order = (
  id: string,
  price: number,
  size: number,
  positionSize: number | null = size,
  ts = 1_700_000_000_000,
): TpslRawRow => ({ id, ts, price, size, user: '0xabc', positionSize })

const removal = (id: string): TpslRawRow => ({
  id,
  ts: null,
  price: null,
  size: null,
  user: null,
  positionSize: null,
})

function snapshotBook(
  rows: TpslRawRow[],
  over: Partial<TpslHead> = {},
): TpslBook {
  const outcome = applyTpslFile(null, head({ snapshot: true, seq: 0, ...over }), rows)
  assert.equal(outcome.status, 'snapshot')
  if (outcome.status !== 'snapshot') throw new Error('unreachable')
  return outcome.book
}

describe('tpslRowFromDecoded', () => {
  it('keeps the 64-bit order id as a decimal string and the signed sizes', () => {
    const row = tpslRowFromDecoded([
      618_686_448_556n,
      1_700_000_000_000n,
      59_452n,
      -0.00164,
      new Uint8Array(20),
      -0.00001,
    ])
    assert.equal(row.id, '618686448556')
    assert.equal(row.price, 59_452)
    assert.equal(row.size, -0.00164)
    assert.equal(row.positionSize, -0.00001)
    assert.equal(row.user?.length, 42)
  })

  it('keeps a key-only removal row null instead of inventing values', () => {
    const row = tpslRowFromDecoded([618_685_761_881n, null, null, null, null, null])
    assert.deepEqual(row, {
      id: '618685761881',
      ts: null,
      price: null,
      size: null,
      user: null,
      positionSize: null,
    })
  })

  it('accepts an id that hyparquet already produced as a string or number', () => {
    assert.equal(tpslRowFromDecoded(['81200000001', null, 1, 0, null, 1]).id, '81200000001')
    assert.equal(tpslRowFromDecoded([42, null, 1, 0, null, 1]).id, '42')
    assert.throws(() => tpslRowFromDecoded([null, null, 1, 0, null, 1]))
  })
})

describe('classifyTpslRow — zero size is whole-position, not a removal', () => {
  it('distinguishes key-only removals, position-wide orders and fixed orders', () => {
    assert.equal(classifyTpslRow(removal('1')), 'remove')
    assert.equal(classifyTpslRow(order('2', 100_000, 0, -3.2)), 'upsert')
    assert.equal(classifyTpslRow(order('3', 100_000, -0.5, -0.5)), 'upsert')
    assert.equal(classifyTpslRow(order('4', 100_000, 0.25, 0.25)), 'upsert')
    // Price/size present but no covered position is still a real order row.
    assert.equal(classifyTpslRow(order('5', 100_000, -0.5, 0)), 'upsert')
    assert.equal(classifyTpslRow(order('6', 100_000, -0.5, null)), 'upsert')
  })

  it('rejects rows that cannot be trusted', () => {
    assert.equal(classifyTpslRow({ ...order('7', 100_000, 1), price: null }), 'invalid')
    assert.equal(classifyTpslRow({ ...order('8', 100_000, 1), size: null }), 'invalid')
    assert.equal(classifyTpslRow(order('9', 0, 1)), 'invalid')
    assert.equal(classifyTpslRow(order('10', Number.NaN, 1)), 'invalid')
  })
})

describe('tpsl order magnitude and side', () => {
  it('covers the whole position for a size-zero order', () => {
    assert.equal(tpslOrderEffectiveSize(0, -3.2), 3.2)
    assert.equal(tpslOrderEffectiveSize(0, 0.8), 0.8)
    // No position on the side it closes: no covered size, never fabricated.
    assert.equal(tpslOrderEffectiveSize(0, 0), 0)
    assert.equal(tpslOrderEffectiveSize(0, null), 0)
  })

  it('caps a fixed order at its own size and at the position it would close', () => {
    // Real live rows: |position| smaller and larger than the order size.
    assert.equal(tpslOrderEffectiveSize(-0.00164, -0.00001), 0.00001)
    assert.equal(tpslOrderEffectiveSize(-0.0356, -0.04892), 0.0356)
    assert.equal(tpslOrderEffectiveSize(0.5, 0), 0)
    assert.equal(tpslOrderEffectiveSize(0.5, null), 0)
    assert.equal(tpslOrderEffectiveSize(Number.NaN, 1), 0)
  })

  it('reads the side from the signed closing order (sell closes a long)', () => {
    assert.equal(tpslOrderSide(-3.2), 'long')
    assert.equal(tpslOrderSide(3.2), 'short')
    assert.equal(tpslOrderSide(0), null)
    assert.equal(tpslOrderSide(null), null)
  })

  it('builds a hover-ready order with both requested and effective size', () => {
    const parsed = tpslOrderFromRow(order('11', 100_000, -0.8528, -0.39327), 5)
    assert.ok(parsed)
    assert.equal(parsed.size, -0.8528)
    assert.equal(parsed.positionSize, -0.39327)
    assert.equal(parsed.effectiveSize, 0.39327)
    assert.equal(parsed.side, 'long')
    assert.equal(parsed.ts, 1_700_000_000_000)
  })
})

describe('applyTpslFile — two independent channels', () => {
  it('adopts a non-zero snapshot counter per channel and applies its delta', () => {
    const book = snapshotBook(
      [order('1', 95_000, 0, -1), order('2', 105_000, -0.5, -0.5)],
      { channel: 'take_profits', seq: 11_758 },
    )
    assert.equal(book.channel, 'take_profits')
    assert.equal(book.seq, 11_758)
    assert.equal(book.orders.size, 2)

    const outcome = applyTpslFile(
      book,
      head({ channel: 'take_profits', seq: 11_759 }),
      [order('1', 96_000, 0, -2), removal('2'), order('3', 110_000, 0.4, 0.4)],
    )
    assert.equal(outcome.status, 'delta')
    if (outcome.status !== 'delta') throw new Error('unreachable')
    assert.equal(outcome.added, 1)
    assert.equal(outcome.replaced, 1)
    assert.equal(outcome.removed, 1)
    assert.equal(outcome.book.orders.size, 2)
    assert.equal(outcome.book.orders.get('1')?.effectiveSize, 2)
    assert.equal(outcome.book.orders.has('2'), false)
    assert.equal(outcome.book.orders.get('3')?.side, 'short')
  })

  it('keys the same order id independently per channel', () => {
    const stop = snapshotBook([order('777', 90_000, 0, -1)], { channel: 'stop_losses' })
    const take = snapshotBook([order('777', 120_000, 0.5, 0.5)], {
      channel: 'take_profits',
    })
    assert.equal(stop.channel, 'stop_losses')
    assert.equal(take.channel, 'take_profits')
    assert.notEqual(stop.orders.get('777')?.price, take.orders.get('777')?.price)
    // A delta on one channel never mutates the other book object (apply is
    // pure: the returned book is the new state).
    const nextTake = applyTpslFile(
      take,
      head({ channel: 'take_profits', seq: 1 }),
      [removal('777')],
    )
    assert.equal(nextTake.status, 'delta')
    if (nextTake.status !== 'delta') throw new Error('unreachable')
    assert.equal(nextTake.book.orders.size, 0)
    assert.equal(take.orders.size, 1)
    assert.equal(stop.orders.size, 1)
  })

  it('detects a gap/epoch/foreign channel per channel without touching the other', () => {
    const stop = snapshotBook([order('1', 90_000, 0, -1)], {
      channel: 'stop_losses',
      seq: 10,
    })
    const gap = applyTpslFile(stop, head({ channel: 'stop_losses', seq: 12 }), [])
    assert.equal(gap.status, 'reset')
    if (gap.status !== 'reset') throw new Error('unreachable')
    assert.equal(gap.reason, 'gap')
    assert.equal(gap.channel, 'stop_losses')

    const take = snapshotBook([order('2', 120_000, 0, 1)], {
      channel: 'take_profits',
      epoch: 'e9',
      seq: 1,
    })
    const epoch = applyTpslFile(take, head({ channel: 'take_profits', epoch: 'e1', seq: 2 }), [])
    assert.equal(epoch.status, 'reset')
    if (epoch.status !== 'reset') throw new Error('unreachable')
    assert.equal(epoch.reason, 'epoch')

    const foreign = applyTpslFile(take, head({ channel: 'liquidations', seq: 2 }), [])
    assert.equal(foreign.status, 'reset')
    if (foreign.status !== 'reset') throw new Error('unreachable')
    assert.equal(foreign.reason, 'channel')
    assert.equal(foreign.channel, null)
  })

  it('requires the channel snapshot before its deltas and ignores duplicates', () => {
    const before = applyTpslFile(null, head({ channel: 'stop_losses', seq: 3 }), [])
    assert.equal(before.status, 'reset')
    if (before.status !== 'reset') throw new Error('unreachable')
    assert.equal(before.reason, 'no-snapshot')

    const book = snapshotBook([order('1', 90_000, 0, -1)], { seq: 5 })
    const duplicate = applyTpslFile(book, head({ seq: 5 }), [removal('1')])
    assert.equal(duplicate.status, 'duplicate')
    assert.equal(book.orders.size, 1)
  })

  it('drops a removal row inside a snapshot instead of treating it as data', () => {
    const book = snapshotBook([order('1', 90_000, 0, -1), removal('2')], { seq: 0 })
    assert.equal(book.orders.size, 1)
    assert.equal(book.orders.has('2'), false)
  })

  it('keeps a same-address position with multiple orders as separate orders', () => {
    const a: TpslRawRow = { ...order('1', 95_000, 0, -1), user: '0xaaa' }
    const b: TpslRawRow = { ...order('2', 96_000, 0.5, -0.5), user: '0xaaa' }
    const book = snapshotBook([a, b])
    assert.equal(book.orders.size, 2)
  })

  it('reports absolute size per covered side', () => {
    const book = snapshotBook([
      order('1', 95_000, 0, -1),
      order('2', 105_000, 0, 2.5),
      order('3', 106_000, 0.4, 0),
    ])
    assert.deepEqual(tpslTotals(book), { count: 3, long: 1, short: 2.5, effective: 3.5 })
    assert.deepEqual(tpslTotals(null), { count: 0, long: 0, short: 0, effective: 0 })
  })
})
