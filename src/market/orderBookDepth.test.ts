import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MAX_ORDER_BOOK_DEPTH_SAMPLES,
  bucketOrderBookDepthSamples,
  filterCompleteOrderBookDepthSamples,
  mergeOrderBookDepthSamples,
  orderBookDepthCoverageNotice,
  parseOrderBookDepthSample,
  type OrderBookDepthSample,
} from './orderBookDepth.ts'

const BASE_TIME_MS = Date.UTC(2026, 9, 14, 17, 45)
const MINUTE = 60_000

function rawSample(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'binance|BTCUSDT|2.5|1792000000000',
    source: 'binance',
    exchange: 'binance',
    symbol: 'BTCUSDT',
    distance: 2.5,
    time: BASE_TIME_MS,
    mid: 80_000,
    bid_notional: 1_000_000,
    ask_notional: 900_000,
    imbalance: 5.263,
    bid_coverage_pct: 0.153,
    ask_coverage_pct: 0.18,
    complete: false,
    ...overrides,
  }
}

function parsed(overrides: Record<string, unknown> = {}): OrderBookDepthSample {
  const sample = parseOrderBookDepthSample(rawSample(overrides))
  assert.ok(sample)
  return sample
}

describe('parseOrderBookDepthSample', () => {
  it('normalizes snake_case backend fields and keeps the completion flag', () => {
    const sample = parsed()
    assert.equal(sample.distance, 2.5)
    assert.equal(sample.bidNotional, 1_000_000)
    assert.equal(sample.askNotional, 900_000)
    assert.equal(sample.bidCoveragePct, 0.153)
    assert.equal(sample.askCoveragePct, 0.18)
    assert.equal(sample.complete, false)
  })

  it('accepts camelCase fields and derives a missing id', () => {
    const sample = parseOrderBookDepthSample({
      ...rawSample({ id: undefined, distance: 0.5 }),
      bidNotional: 10,
      askNotional: 20,
      bidCoveragePct: 0.4,
      askCoveragePct: 0.6,
    })
    assert.ok(sample)
    assert.equal(sample.id, `binance|BTCUSDT|0.5|${BASE_TIME_MS}`)
  })

  it('rejects malformed samples instead of rendering NaN', () => {
    for (const overrides of [
      { source: 'hyperliquid' },
      { exchange: 'hyperliquid' },
      { symbol: 'ETHUSDT' },
      { distance: 3 },
      { distance: '2.5' },
      { time: 0 },
      { mid: 0 },
      { bid_notional: -1 },
      { imbalance: 101 },
      { imbalance: 'NaN' },
      { bid_coverage_pct: -1 },
      { complete: 'yes' },
      { complete: undefined },
    ]) {
      assert.equal(parseOrderBookDepthSample(rawSample(overrides)), null, overrides)
    }
    assert.equal(parseOrderBookDepthSample(null), null)
    assert.equal(parseOrderBookDepthSample([]), null)
  })
})

describe('filterCompleteOrderBookDepthSamples', () => {
  it('never turns an incomplete sample into a point', () => {
    const complete = parsed({ id: 'complete', complete: true })
    const incomplete = parsed({ id: 'incomplete', complete: false })
    assert.deepEqual(
      filterCompleteOrderBookDepthSamples([complete, incomplete]).map((s) => s.id),
      ['complete'],
    )
  })

  it('filters by the selected distance', () => {
    const tight = parsed({ id: 'tight', distance: 0.25, complete: true })
    const wide = parsed({ id: 'wide', distance: 2.5, complete: true })
    assert.deepEqual(
      filterCompleteOrderBookDepthSamples([tight, wide], 2.5).map((s) => s.id),
      ['wide'],
    )
  })
})

describe('bucketOrderBookDepthSamples', () => {
  it('keeps the last complete sample per candle bucket and leaves gaps', () => {
    const first = parsed({
      id: 'first',
      time: BASE_TIME_MS + 5_000,
      imbalance: 10,
      complete: true,
    })
    const last = parsed({
      id: 'last',
      time: BASE_TIME_MS + 55_000,
      imbalance: 20,
      complete: true,
    })
    const nextCandle = parsed({
      id: 'next',
      time: BASE_TIME_MS + MINUTE + 10_000,
      imbalance: -30,
      complete: true,
    })
    const incomplete = parsed({
      id: 'incomplete',
      time: BASE_TIME_MS + MINUTE * 2 + 10_000,
      imbalance: 99,
      complete: false,
    })

    assert.deepEqual(
      bucketOrderBookDepthSamples(
        [first, last, nextCandle, incomplete],
        '1m',
      ),
      [
        { time: BASE_TIME_MS / 1000, value: 20 },
        { time: BASE_TIME_MS / 1000 + 60, value: -30 },
      ],
    )
  })

  it('rebuckets cleanly when the interval changes', () => {
    const a = parsed({
      id: 'a',
      time: BASE_TIME_MS + 10_000,
      imbalance: 10,
      complete: true,
    })
    const b = parsed({
      id: 'b',
      time: BASE_TIME_MS + 7 * MINUTE,
      imbalance: 20,
      complete: true,
    })
    assert.equal(bucketOrderBookDepthSamples([a, b], '1m').length, 2)
    assert.equal(bucketOrderBookDepthSamples([a, b], '15m').length, 1)
  })

  it('aligns 1w buckets to the Monday candle open', () => {
    const mondayOpenMs = Date.UTC(2026, 9, 12)
    const thursday = mondayOpenMs + 3 * 86_400_000 + 5 * 3_600_000
    const sample = parsed({
      id: 'weekly',
      time: thursday,
      imbalance: -40,
      complete: true,
    })
    const previousSunday = parsed({
      id: 'previous',
      time: mondayOpenMs - 1_000,
      imbalance: 40,
      complete: true,
    })

    assert.deepEqual(
      bucketOrderBookDepthSamples([sample, previousSunday], '1w'),
      [
        { time: (mondayOpenMs - 7 * 86_400_000) / 1000, value: 40 },
        { time: mondayOpenMs / 1000, value: -40 },
      ],
    )
  })

  it('returns no points when nothing has complete coverage', () => {
    assert.deepEqual(
      bucketOrderBookDepthSamples(
        [parsed({ complete: false }), parsed({ id: 'other', complete: false })],
        '1m',
      ),
      [],
    )
  })
})

describe('mergeOrderBookDepthSamples', () => {
  it('counts a sample received live and from history once', () => {
    const live = parsed({ id: 'shared', time: BASE_TIME_MS })
    const history = parsed({ id: 'shared', time: BASE_TIME_MS })
    const older = parsed({ id: 'older', time: BASE_TIME_MS - 1_000 })
    const newer = parsed({ id: 'newer', time: BASE_TIME_MS + 1_000 })

    assert.deepEqual(
      mergeOrderBookDepthSamples([live, newer], [history, older]).map((s) => s.id),
      ['older', 'shared', 'newer'],
    )
  })

  it('bounds retained memory to the newest samples', () => {
    const samples = Array.from({ length: 5 }, (_, index) =>
      parsed({ id: `s-${index}`, time: BASE_TIME_MS + index }),
    )
    const merged = mergeOrderBookDepthSamples([], samples, 2)
    assert.deepEqual(merged.map((sample) => sample.id), ['s-3', 's-4'])
    assert.ok(MAX_ORDER_BOOK_DEPTH_SAMPLES >= 2)
  })
})

describe('orderBookDepthCoverageNotice', () => {
  it('reports insufficient coverage for an incomplete latest sample', () => {
    const notice = orderBookDepthCoverageNotice(
      [parsed({ complete: false })],
      2.5,
    )
    assert.match(notice ?? '', /Insufficient order-book coverage/)
    assert.match(notice ?? '', /2\.5%/)
  })

  it('reports waiting when no sample exists yet', () => {
    assert.match(
      orderBookDepthCoverageNotice([], 2.5) ?? '',
      /Insufficient order-book coverage/,
    )
  })

  it('clears the notice once the selected distance is complete', () => {
    assert.equal(
      orderBookDepthCoverageNotice([parsed({ complete: true })], 2.5),
      null,
    )
    // A complete sample for another distance does not clear this distance.
    assert.match(
      orderBookDepthCoverageNotice(
        [parsed({ id: 'tight', distance: 0.25, complete: true })],
        2.5,
      ) ?? '',
      /Insufficient order-book coverage/,
    )
  })
})
