import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildProfile, positionsAtRow, rowPriceBand } from './model.ts'
import type { Position } from './protocol.ts'

const VIEW = { min: 50_000, max: 100_000 }
const TOP = 0
const BOTTOM = 500

const position = (price: number, size: number, user = '0xa'): Position => ({
  user,
  price,
  size,
  ts: 1,
})

describe('buildProfile', () => {
  it('splits magnitude by side and keeps the sign semantics', () => {
    const profile = buildProfile(
      [position(75_000, 2), position(75_000, -3), position(60_000, 1)],
      { view: VIEW, top: TOP, bottom: BOTTOM },
    )
    assert.equal(profile.totalLong, 3)
    assert.equal(profile.totalShort, 3)
    assert.equal(profile.visibleCount, 3)
    assert.equal(profile.maxLong, 2)
    assert.equal(profile.maxShort, 3)
  })

  it('stacks positions that share a price into one row', () => {
    const profile = buildProfile(
      [position(75_000, 2), position(75_000, 3), position(75_000, -1)],
      { view: VIEW, top: TOP, bottom: BOTTOM },
    )
    const row = Math.floor(
      (500 - ((75_000 - VIEW.min) / (VIEW.max - VIEW.min)) * 500),
    )
    assert.equal(profile.count[row], 3)
    assert.equal(profile.long[row], 5)
    assert.equal(profile.short[row], 1)
  })

  it('skips levels outside the window and counts only what is drawn', () => {
    const profile = buildProfile(
      [position(30_000, 5), position(75_000, 1), position(200_000, 5)],
      { view: VIEW, top: TOP, bottom: BOTTOM },
    )
    assert.equal(profile.visibleCount, 1)
  })

  it('clamps rows into the plot instead of writing outside it', () => {
    const profile = buildProfile(
      [position(VIEW.max, 1), position(VIEW.min, 1)],
      { view: VIEW, top: TOP, bottom: BOTTOM },
    )
    assert.equal(profile.rowCount, 500)
    assert.equal(profile.count[0] + profile.count[499], 2)
    for (const value of profile.count) {
      assert.ok(value === 0 || value === 1)
    }
  })

  it('handles an empty book', () => {
    const profile = buildProfile([], { view: VIEW, top: TOP, bottom: BOTTOM })
    assert.equal(profile.visibleCount, 0)
    assert.equal(profile.maxMagnitude, 0)
    assert.equal(profile.rowCount, 500)
  })
})

describe('rowPriceBand / positionsAtRow', () => {
  const positions = [
    position(75_000, 1, '0xsmall'),
    position(75_000, -9, '0xbig'),
    position(60_000, 2, '0xother'),
  ]
  const profile = buildProfile(positions, {
    view: VIEW,
    top: TOP,
    bottom: BOTTOM,
  })

  it('maps a row back to the price band it covers', () => {
    const row = Math.floor((500 - (25_000 / 50_000) * 500))
    const band = rowPriceBand(profile, row)
    assert.ok(band.min <= 75_000 + 1e-6)
    assert.ok(band.max >= 75_000 - 1e-6)
  })

  it('returns the positions behind a row, biggest first, capped', () => {
    const row = Math.floor((500 - (25_000 / 50_000) * 500))
    const found = positionsAtRow(positions, profile, row)
    assert.equal(found.length, 2)
    assert.equal(found[0].user, '0xbig')
    assert.equal(found[1].user, '0xsmall')
    assert.equal(positionsAtRow(positions, profile, row, 1).length, 1)
  })

  it('returns nothing for an empty row or an out-of-range row', () => {
    assert.deepEqual(positionsAtRow(positions, profile, 0), [])
    assert.deepEqual(positionsAtRow(positions, profile, -1), [])
    assert.deepEqual(positionsAtRow(positions, profile, 10_000), [])
  })
})
