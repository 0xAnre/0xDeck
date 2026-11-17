import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  parseAggregatedLiquidationEvent,
  type AggregatedLiquidationEvent,
} from './aggregatedLiquidations.ts'
import {
  applyLiquidationsGapFill,
  shouldStartLiquidationsWalk,
} from './liquidationsCoverage.ts'

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

describe('applyLiquidationsGapFill', () => {
  const coverage = { interval: '15m' as const, oldestTimeMs: 1_000 }

  function event(id: string, tradeTime: number): AggregatedLiquidationEvent {
    const parsed = parseAggregatedLiquidationEvent({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      side: 'long',
      price: 80_000,
      quantity: 0.5,
      notional: 40_000,
      time: tradeTime,
      trade_time: tradeTime,
      id,
    })
    assert.ok(parsed)
    return parsed
  }

  it('keeps the coverage record and stays silent for a complete fill', () => {
    const outcome = applyLiquidationsGapFill({
      interval: '15m',
      coverage,
      fill: { events: [event('a', 2_000)], truncated: false },
    })
    assert.deepEqual(outcome.coverage, coverage)
    assert.equal(outcome.notice, null)
  })

  // #239 third review (NIT-1): a truncated fill used to only drop the coverage
  // record, so the empty middle of the pane stayed silent until the user panned
  // or zoomed. Reverting that branch (coverage dropped, no notice) fails here.
  it('drops coverage and reports the gap when the fill hits the page cap', () => {
    const outcome = applyLiquidationsGapFill({
      interval: '15m',
      coverage,
      fill: {
        events: [event('newest', 3_000), event('oldest', 2_000)],
        truncated: true,
      },
    })
    assert.equal(outcome.coverage, null)
    assert.equal(outcome.notice?.interval, '15m')
    assert.match(outcome.notice?.message ?? '', /events cover /)
    assert.match(outcome.notice?.message ?? '', /older bars .* not shown \(history page limit\)/)
  })

  it('reports a truncated fill that returned no events', () => {
    const outcome = applyLiquidationsGapFill({
      interval: '30m',
      coverage: null,
      fill: { events: [], truncated: true },
    })
    assert.equal(outcome.coverage, null)
    assert.match(outcome.notice?.message ?? '', /truncated by the page limit/)
  })
})
