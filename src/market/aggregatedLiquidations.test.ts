import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  appendAggregatedLiquidationEvents,
  bucketAggregatedLiquidationEvents,
  filterAggregatedLiquidationBucketsToCandles,
  liquidationBucketTime,
  parseAggregatedLiquidationEvent,
  type AggregatedLiquidationEvent,
} from './aggregatedLiquidations.ts'

const MINUTE = 60_000
const BASE_TIME = 1_792_000_020_000 // 2026-10-15T...:20Z, not a bucket boundary.

type EventOverrides = Partial<Record<string, unknown>>

function relayEvent(overrides: EventOverrides = {}): Record<string, unknown> {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    side: 'long',
    price: 80_000,
    quantity: 0.5,
    notional: 40_000,
    time: BASE_TIME,
    trade_time: BASE_TIME + 1,
    id: `event-${overrides.id ?? 'default'}`,
    ...overrides,
  }
}

function parsed(overrides: EventOverrides = {}): AggregatedLiquidationEvent {
  const event = parseAggregatedLiquidationEvent(relayEvent(overrides))
  assert.ok(event)
  return event
}

describe('parseAggregatedLiquidationEvent', () => {
  it('accepts normalized relay events and preserves positive notional', () => {
    const long = parsed()
    const short = parsed({ side: 'short', id: 'short' })
    assert.equal(long.side, 'long')
    assert.equal(long.notional, 40_000)
    assert.equal(short.side, 'short')
  })

  it('derives notional only when the field is absent', () => {
    const event = parseAggregatedLiquidationEvent({
      ...relayEvent(),
      notional: undefined,
    })
    assert.ok(event)
    assert.equal(event.notional, 40_000)
  })

  it('accepts numeric strings but rejects bad numbers', () => {
    const event = parseAggregatedLiquidationEvent(
      relayEvent({ price: '81000.5', quantity: '0.25', notional: '20250.125' }),
    )
    assert.ok(event)
    assert.equal(event.notional, 20_250.125)
    assert.equal(
      parseAggregatedLiquidationEvent(relayEvent({ price: 'not-a-number' })),
      null,
    )
  })

  it('rejects unknown exchange, symbol, side, and malformed payloads', () => {
    assert.equal(parseAggregatedLiquidationEvent(null), null)
    assert.equal(parseAggregatedLiquidationEvent([]), null)
    assert.equal(parseAggregatedLiquidationEvent('event'), null)
    assert.equal(
      parseAggregatedLiquidationEvent(relayEvent({ exchange: 'hyperliquid' })),
      null,
    )
    assert.equal(parseAggregatedLiquidationEvent(relayEvent({ symbol: 'ETHUSDT' })), null)
    assert.equal(parseAggregatedLiquidationEvent(relayEvent({ side: 'both' })), null)
  })

  it('rejects non-finite or non-positive price, quantity, notional and time', () => {
    for (const overrides of [
      { price: 0 },
      { price: -1 },
      { price: Number.NaN },
      { quantity: 0 },
      { quantity: -0.5 },
      { quantity: Number.POSITIVE_INFINITY },
      { notional: 0 },
      { notional: -1 },
      { notional: Number.NaN },
      { time: 0 },
      { time: -1 },
      { trade_time: 0 },
    ] satisfies EventOverrides[]) {
      assert.equal(
        parseAggregatedLiquidationEvent(relayEvent(overrides)),
        null,
        JSON.stringify(overrides),
      )
    }
  })

  it('falls back to a stable identity when the relay id is missing', () => {
    const raw = relayEvent({ id: undefined })
    const first = parseAggregatedLiquidationEvent(raw)
    const second = parseAggregatedLiquidationEvent({ ...raw })
    assert.ok(first && second)
    assert.equal(first.id, second.id)
    assert.ok(first.id.includes('BTCUSDT'))
  })
})

describe('appendAggregatedLiquidationEvents', () => {
  it('does not double-count duplicate event ids', () => {
    const first = parsed({ id: 'a' })
    const duplicate = parsed({ id: 'a', notional: 999_999 })
    const next = appendAggregatedLiquidationEvents([first], [duplicate])
    assert.deepEqual(next, [first])
  })

  it('keeps memory bounded by dropping the oldest events', () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      parsed({ id: `e${index}`, time: BASE_TIME + index * MINUTE }),
    )
    const next = appendAggregatedLiquidationEvents([], events, 3)
    assert.deepEqual(
      next.map((event) => event.id),
      ['e2', 'e3', 'e4'],
    )
  })
})

describe('bucketAggregatedLiquidationEvents', () => {
  it('sums long and short notional into one positive candle bucket', () => {
    const events = [
      parsed({ id: 'l1', side: 'long', notional: 1_000, time: BASE_TIME }),
      parsed({ id: 'l2', side: 'long', notional: 250, time: BASE_TIME + 5_000 }),
      parsed({ id: 's1', side: 'short', notional: 400, time: BASE_TIME + 10_000 }),
    ]
    const buckets = bucketAggregatedLiquidationEvents(events, '1m')
    assert.equal(buckets.length, 1)
    assert.equal(buckets[0].time, BASE_TIME / 1000)
    assert.equal(buckets[0].long, 1_250)
    assert.equal(buckets[0].short, 400)
    assert.ok(buckets[0].long > 0 && buckets[0].short > 0)
  })

  it('uses the existing candle interval durations for bucket boundaries', () => {
    const eventTimeMs = BASE_TIME + 7 * MINUTE
    assert.equal(liquidationBucketTime(eventTimeMs, '1m') % 60, 0)
    assert.equal(liquidationBucketTime(eventTimeMs, '5m') % 300, 0)
    const fifteenMinute = liquidationBucketTime(eventTimeMs, '15m')
    assert.equal(fifteenMinute % 900, 0)
    assert.equal(fifteenMinute, Date.UTC(2026, 9, 14, 17, 45) / 1000)
  })

  it('rebuckets cleanly when the interval changes', () => {
    const events = [
      parsed({ id: 'a', time: BASE_TIME }),
      parsed({ id: 'b', time: BASE_TIME + 7 * MINUTE }),
    ]
    const oneMinute = bucketAggregatedLiquidationEvents(events, '1m')
    const fifteenMinute = bucketAggregatedLiquidationEvents(events, '15m')
    assert.equal(oneMinute.length, 2)
    assert.equal(fifteenMinute.length, 1)
    assert.notEqual(oneMinute[0].time, fifteenMinute[0].time)
  })

  it('ignores non-positive notional defensively', () => {
    const invalid = [
      { ...parsed({ id: 'a' }), notional: 0 },
      { ...parsed({ id: 'b' }), notional: Number.NaN },
    ]
    assert.deepEqual(bucketAggregatedLiquidationEvents(invalid, '1m'), [])
  })
})

describe('filterAggregatedLiquidationBucketsToCandles', () => {
  it('keeps only buckets whose candle is loaded', () => {
    const buckets = [
      { time: 100, long: 10, short: 0 },
      { time: 200, long: 0, short: 20 },
      { time: 300, long: 5, short: 5 },
    ]
    assert.deepEqual(
      filterAggregatedLiquidationBucketsToCandles(buckets, [200, 300]),
      [
        { time: 200, long: 0, short: 20 },
        { time: 300, long: 5, short: 5 },
      ],
    )
  })

  it('returns no bars when no candles are loaded', () => {
    assert.deepEqual(
      filterAggregatedLiquidationBucketsToCandles(
        [{ time: 100, long: 10, short: 0 }],
        [],
      ),
      [],
    )
  })
})
