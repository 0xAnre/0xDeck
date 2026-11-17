import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { shouldStartLiquidationsWalk } from './liquidationsCoverage.ts'

const HOUR_MS = 3_600_000

describe('shouldStartLiquidationsWalk', () => {
  it('walks when nothing is covered yet', () => {
    assert.equal(
      shouldStartLiquidationsWalk({
        coverage: null,
        interval: '15m',
        requestedOldestTimeMs: 1_000,
      }),
      true,
    )
  })

  it('does not walk again for the same or a narrower range', () => {
    const coverage = { interval: '15m' as const, oldestTimeMs: 1_000 }
    assert.equal(
      shouldStartLiquidationsWalk({
        coverage,
        interval: '15m',
        requestedOldestTimeMs: 1_000,
      }),
      false,
    )
    assert.equal(
      shouldStartLiquidationsWalk({
        coverage,
        interval: '15m',
        requestedOldestTimeMs: 2_000,
      }),
      false,
    )
  })

  it('walks when the chart reaches further back', () => {
    assert.equal(
      shouldStartLiquidationsWalk({
        coverage: { interval: '15m', oldestTimeMs: 1_000 },
        interval: '15m',
        requestedOldestTimeMs: 1_000 - HOUR_MS,
      }),
      true,
    )
  })

  it('walks after an interval change even with full coverage', () => {
    assert.equal(
      shouldStartLiquidationsWalk({
        coverage: { interval: '15m', oldestTimeMs: 1_000 },
        interval: '30m',
        requestedOldestTimeMs: 1_000,
      }),
      true,
    )
  })
})
