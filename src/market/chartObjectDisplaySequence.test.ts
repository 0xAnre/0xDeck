import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  formatNumberedChartObjectLabel,
  migrateChartObjectDisplaySequences,
  nextDisplaySequence,
} from './chartObjectDisplaySequence.ts'

describe('chartObjectDisplaySequence', () => {
  it('formats numbered labels', () => {
    assert.equal(formatNumberedChartObjectLabel('box', 3), 'Box 3')
    assert.equal(formatNumberedChartObjectLabel('frvp', 1), 'Volume Profile 1')
  })

  it('assigns 1..n for legacy instances in order', () => {
    const migrated = migrateChartObjectDisplaySequences([
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
    ])
    assert.deepEqual(
      migrated.map((item) => item.displaySequence),
      [1, 2, 3],
    )
  })

  it('does not renumber when deleting from the middle', () => {
    const migrated = migrateChartObjectDisplaySequences([
      { id: 'a', displaySequence: 1 },
      { id: 'c', displaySequence: 3 },
    ])
    assert.deepEqual(
      migrated.map((item) => item.displaySequence),
      [1, 3],
    )
    assert.equal(nextDisplaySequence(migrated), 4)
  })

  it('fills gaps for invalid or duplicate sequences', () => {
    const migrated = migrateChartObjectDisplaySequences([
      { id: 'a', displaySequence: 1 },
      { id: 'b', displaySequence: 1 },
      { id: 'c' },
    ])
    assert.deepEqual(
      migrated.map((item) => item.displaySequence),
      [1, 2, 3],
    )
  })
})
