import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createLiquidationLevelsIndex } from './liquidationLevelsIndex.ts'
import type {
  LiquidationLevelBook,
  LiquidationLevelPosition,
  LiquidationLevelsApplyOutcome,
} from './liquidationLevelsProtocol.ts'

function book(rows: Array<[string, number, number]>): LiquidationLevelBook {
  const positions = new Map<string, LiquidationLevelPosition>()
  for (const [user, price, size] of rows) {
    positions.set(user, { user, price, size, ts: 1 })
  }
  return { epoch: 'e1', seq: 3, headTs: 10, positions }
}

function snapshot(rows: Array<[string, number, number]>): LiquidationLevelsApplyOutcome {
  return { status: 'snapshot', book: book(rows), added: rows.length, removed: 0, skipped: 0 }
}

describe('liquidation levels price index', () => {
  it('answers a visible price range in ascending order regardless of insert order', () => {
    const index = createLiquidationLevelsIndex()
    index.applyOutcome(
      snapshot([
        ['c', 103, -2],
        ['a', 101, 1],
        ['b', 102, 4],
        ['d', 104, -1],
      ]),
    )
    const found = index.positionsInRange(101, 103)
    assert.deepEqual(
      found.map((position) => position.user),
      ['a', 'b', 'c'],
    )
    // Bounds are inclusive and the range query never returns an outside row.
    assert.deepEqual(
      index.positionsInRange(102, 102).map((position) => position.price),
      [102],
    )
    assert.deepEqual(index.positionsInRange(200, 300), [])
    assert.deepEqual(index.positionsInRange(110, 100), [])
  })

  it('counts both sides absolutely and reports the book size without a walk', () => {
    const index = createLiquidationLevelsIndex()
    index.applyOutcome(
      snapshot([
        ['a', 101, 1.5],
        ['b', 102, 2],
        ['c', 103, -0.5],
      ]),
    )
    assert.deepEqual(index.totals(), { count: 3, long: 3.5, short: 0.5 })
    assert.equal(index.size(), 3)
  })

  it('reflects deltas, removals and resets', () => {
    const index = createLiquidationLevelsIndex()
    index.applyOutcome(snapshot([
      ['a', 101, 1],
      ['b', 102, -1],
    ]))
    const positions = new Map(index.totals() && [])
    void positions
    index.applyOutcome({
      status: 'delta',
      book: book([
        ['a', 101, 1],
        ['b', 103, -2],
      ]),
      added: 0,
      replaced: 1,
      removed: 0,
      skipped: 0,
    })
    assert.deepEqual(
      index.positionsInRange(100, 200).map((position) => [position.user, position.price]),
      [['a', 101], ['b', 103]],
    )
    index.applyOutcome({
      status: 'delta',
      book: book([['a', 101, 1]]),
      added: 0,
      replaced: 0,
      removed: 1,
      skipped: 0,
    })
    assert.deepEqual(index.positionsInRange(100, 200).map((position) => position.user), ['a'])

    index.applyOutcome({ status: 'reset', reason: 'gap', detail: 'gap' })
    assert.equal(index.size(), 0)
    assert.deepEqual(index.positionsInRange(0, 1_000_000), [])
    assert.deepEqual(index.totals(), { count: 0, long: 0, short: 0 })
  })

  it('bumps its revision for applied books and resets, not for duplicates', () => {
    const index = createLiquidationLevelsIndex()
    const before = index.revision()
    index.applyOutcome(snapshot([['a', 101, 1]]))
    const afterSnapshot = index.revision()
    assert.ok(afterSnapshot > before)
    index.applyOutcome(null)
    assert.equal(index.revision(), afterSnapshot)
    index.replaceBook(null)
    assert.ok(index.revision() > afterSnapshot)
    index.clear()
    assert.ok(index.revision() > afterSnapshot)
  })

  it('iterates the same range as the array query without materializing it', () => {
    const index = createLiquidationLevelsIndex()
    index.applyOutcome(
      snapshot([
        ['a', 99, 1],
        ['b', 100, 1],
        ['c', 101, -1],
        ['d', 102, 1],
        ['e', 103, 1],
      ]),
    )
    const array = index.positionsInRange(100, 102)
    const iterated = [...index.iterateRange(100, 102)]
    assert.deepEqual(iterated, array)
    assert.deepEqual([...index.iterateRange(110, 120)], [])
    assert.deepEqual([...index.iterateRange(102, 100)], [])
  })

  it('rebuilds only when the book changed, so a paint on unchanged data is a range query', () => {
    const index = createLiquidationLevelsIndex()
    index.applyOutcome(snapshot([['a', 101, 1]]))
    const first = index.positionsInRange(100, 102)
    const second = index.positionsInRange(100, 102)
    assert.notEqual(first, second) // fresh array per query, no stale slice reuse
    assert.deepEqual(first, second)
  })
})
