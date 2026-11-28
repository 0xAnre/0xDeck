import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  EMPTY_TPSL_ROW_DETAIL,
  summarizeTpslRowOrders,
  tpslRowDetailLines,
} from './priceLevelsRowDetail.ts'
import type { TpslOrder } from './liquidationLevelsProtocol.ts'

function order(
  id: string,
  size: number,
  positionSize: number | null,
  price = 60_000,
): TpslOrder {
  const covered = positionSize === null ? 0 : Math.abs(positionSize)
  const effectiveSize =
    covered <= 0 ? 0 : size === 0 ? covered : Math.min(Math.abs(size), covered)
  return {
    id,
    ts: 1,
    price,
    size,
    positionSize,
    user: '0xabc',
    effectiveSize,
    side: positionSize === null || positionSize === 0
      ? null
      : positionSize < 0
        ? 'long'
        : 'short',
  }
}

describe('trigger-order row detail', () => {
  it('separates fixed requested size from whole-position amounts', () => {
    const detail = summarizeTpslRowOrders([
      // fixed 0.5 against a 0.5 position
      order('1', 0.5, 0.5),
      // fixed 2 against a 0.3 position: covered 0.3, requested 2
      order('2', 2, 0.3),
      // whole-position order: no requested size of its own, closes 5
      order('3', 0, 5),
      // priced but no covered position: no bar, no request
      order('4', 0.25, 0),
    ])
    // The uncovered 0.25 order requests nothing that this row paints; it is
    // reported separately instead of inflating the fixed-size request.
    assert.equal(detail.fixedRequested, 2.5)
    assert.equal(detail.fixedCount, 2)
    assert.equal(detail.wholeCount, 1)
    assert.equal(detail.wholeCovered, 5)
    assert.equal(detail.covered, 0.5 + 0.3 + 5)
    assert.equal(detail.coveredCount, 3)
    assert.equal(detail.uncoveredCount, 1)
  })

  it('never labels a whole-position row as a zero requested size', () => {
    const wholeOnly = summarizeTpslRowOrders([order('1', 0, 81.5746), order('2', 0, 2)])
    const lines = tpslRowDetailLines(wholeOnly)
    assert.deepEqual(lines, ['Whole-position orders close 83.5746 BTC (2)'])
    for (const line of lines) {
      assert.doesNotMatch(line, /\brequest(ed)?\b/i)
      assert.doesNotMatch(line, /0 BTC/)
    }

    const mixed = summarizeTpslRowOrders([order('1', 0.0095, 0.0095), order('2', 0, 5)])
    assert.deepEqual(tpslRowDetailLines(mixed), [
      'Fixed-size orders request 0.0095 BTC (1)',
      'Whole-position orders close 5 BTC (1)',
    ])
  })

  it('reports uncovered orders without inventing a size', () => {
    const detail = summarizeTpslRowOrders([order('1', 0.5, null), order('2', 0, 0)])
    assert.equal(detail.fixedRequested, 0)
    assert.equal(detail.fixedCount, 0)
    assert.equal(detail.wholeCount, 0)
    assert.equal(detail.covered, 0)
    assert.equal(detail.uncoveredCount, 2)
    assert.deepEqual(tpslRowDetailLines(detail), ['2 orders with no covered position'])
    // A covered fixed order next to uncovered ones keeps its own request.
    const mixed = summarizeTpslRowOrders([order('1', 0.5, null), order('2', 0.5, 0.5)])
    assert.deepEqual(tpslRowDetailLines(mixed), [
      'Fixed-size orders request 0.5 BTC (1)',
      '1 order with no covered position',
    ])
  })

  it('returns nothing to say for an empty row', () => {
    assert.deepEqual(tpslRowDetailLines(EMPTY_TPSL_ROW_DETAIL), [])
  })
})
