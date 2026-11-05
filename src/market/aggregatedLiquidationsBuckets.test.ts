import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bucketAggregatedLiquidationEvents,
  parseAggregatedLiquidationEvent,
  type AggregatedLiquidationEvent,
} from './aggregatedLiquidations.ts'
import {
  aggregatedLiquidationsBucketsPath,
  AggregatedLiquidationsBucketsClientError,
  buildAggregatedLiquidationsBucketRequest,
  describeAggregatedLiquidationsBucketNotice,
  describeAggregatedLiquidationsEventNotice,
  fetchAggregatedLiquidationsBuckets,
  formatAggregatedLiquidationsCoverageTime,
  describeAggregatedLiquidationsBucketError,
  nextAggregatedLiquidationsBucketsAfterError,
  parseAggregatedLiquidationsBuckets,
  shouldUseAggregatedLiquidationBuckets,
  type AggregatedLiquidationsBucketsState,
} from './aggregatedLiquidationsBuckets.ts'
import type { CandleInterval } from './types.ts'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const BASE_SECONDS = 1_800_000_000 // divisible by 1m…1d
const BASE_TIME_MS = BASE_SECONDS * 1000
// 2026-11-23T00:00:00Z, a Monday, the weekly bucket origin used by the chart.
const MONDAY_SECONDS = 1_795_392_000

function event(id: string, tradeTime: number, notional = 40_000): AggregatedLiquidationEvent {
  const parsed = parseAggregatedLiquidationEvent({
    exchange: 'binance',
    symbol: 'BTCUSDT',
    side: 'long',
    price: 80_000,
    quantity: notional / 80_000,
    notional,
    time: tradeTime,
    trade_time: tradeTime,
    id,
  })
  assert.ok(parsed)
  return parsed
}

function bucketPayload(overrides: Record<string, unknown> = {}) {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    interval: '1h',
    buckets: [{ time: BASE_SECONDS, long: 40_000, short: 12_500 }],
    truncated: false,
    ...overrides,
  }
}

describe('aggregatedLiquidationsBucketsPath', () => {
  it('builds the documented path and query', () => {
    assert.equal(
      aggregatedLiquidationsBucketsPath({
        interval: '1h',
        from: BASE_TIME_MS,
        to: BASE_TIME_MS + HOUR,
      }),
      '/market/binance/usdm/btcusdt/liquidations/buckets?interval=1h&from=1800000000000&to=1800003600000',
    )
  })
})

describe('shouldUseAggregatedLiquidationBuckets', () => {
  it('uses backend buckets for 30m and above', () => {
    for (const interval of ['30m', '1h', '2h', '4h', '1d', '1w'] as CandleInterval[]) {
      assert.equal(shouldUseAggregatedLiquidationBuckets(interval), true, interval)
    }
  })

  it('keeps the events path for 15m and below', () => {
    for (const interval of ['1m', '5m', '15m'] as CandleInterval[]) {
      assert.equal(shouldUseAggregatedLiquidationBuckets(interval), false, interval)
    }
  })
})

describe('parseAggregatedLiquidationsBuckets', () => {
  it('accepts a valid payload and keeps the bucket shape', () => {
    const parsed = parseAggregatedLiquidationsBuckets(bucketPayload(), '1h')
    assert.equal(parsed.exchange, 'binance')
    assert.equal(parsed.symbol, 'BTCUSDT')
    assert.equal(parsed.interval, '1h')
    assert.equal(parsed.truncated, false)
    assert.deepEqual(parsed.buckets, [
      { time: BASE_SECONDS, long: 40_000, short: 12_500 },
    ])
  })

  it('rejects a response bucketed for another interval', () => {
    assert.throws(
      () => parseAggregatedLiquidationsBuckets(bucketPayload(), '4h'),
      AggregatedLiquidationsBucketsClientError,
    )
  })

  it('rejects malformed payloads instead of dropping buckets silently', () => {
    const invalid: unknown[] = [
      null,
      [],
      bucketPayload({ exchange: 'hyperliquid' }),
      bucketPayload({ symbol: 'BTC' }),
      bucketPayload({ truncated: 'no' }),
      bucketPayload({ buckets: {} }),
      bucketPayload({ buckets: [{ time: 0, long: 1, short: 0 }] }),
      bucketPayload({ buckets: [{ time: BASE_SECONDS, long: -1, short: 0 }] }),
      bucketPayload({ buckets: [{ time: BASE_SECONDS, long: 1, short: Number.NaN }] }),
      bucketPayload({ buckets: [{ time: BASE_SECONDS, long: 0, short: 0 }] }),
      // Not strictly ascending: the chart series requires ordered data.
      bucketPayload({
        buckets: [
          { time: BASE_SECONDS + 3600, long: 1, short: 0 },
          { time: BASE_SECONDS, long: 1, short: 0 },
        ],
      }),
    ]
    for (const payload of invalid) {
      assert.throws(
        () => parseAggregatedLiquidationsBuckets(payload, '1h'),
        AggregatedLiquidationsBucketsClientError,
        JSON.stringify(payload),
      )
    }
  })
})

describe('fetchAggregatedLiquidationsBuckets', () => {
  it('requests the range and returns parsed buckets', async () => {
    let requested = ''
    const result = await fetchAggregatedLiquidationsBuckets({
      interval: '1h',
      from: BASE_TIME_MS,
      to: BASE_TIME_MS + HOUR,
      fetchImpl: async (input) => {
        requested = String(input)
        return new Response(JSON.stringify(bucketPayload()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    })
    assert.equal(
      requested,
      '/api/market/binance/usdm/btcusdt/liquidations/buckets?interval=1h&from=1800000000000&to=1800003600000',
    )
    assert.deepEqual(result.buckets, [
      { time: BASE_SECONDS, long: 40_000, short: 12_500 },
    ])
  })

  it('surfaces the backend detail for a rejected range', async () => {
    await assert.rejects(
      fetchAggregatedLiquidationsBuckets({
        interval: '1h',
        from: BASE_TIME_MS,
        to: BASE_TIME_MS + HOUR,
        fetchImpl: async () =>
          new Response(JSON.stringify({ detail: 'Query parameter \'to\' must be greater than \'from\'' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof AggregatedLiquidationsBucketsClientError)
        assert.equal(error.status, 400)
        assert.match(error.message, /greater than/)
        return true
      },
    )
  })
})

describe('buildAggregatedLiquidationsBucketRequest', () => {
  it('covers the loaded candle range with a half-open end', () => {
    const request = buildAggregatedLiquidationsBucketRequest(
      [BASE_SECONDS, BASE_SECONDS + 3600],
      '1h',
    )
    assert.deepEqual(request, {
      from: BASE_TIME_MS,
      to: (BASE_SECONDS + 7200) * 1000,
      truncated: false,
    })
  })

  it('returns null for an empty candle range', () => {
    assert.equal(buildAggregatedLiquidationsBucketRequest([], '1h'), null)
  })

  it('narrows an oversized range to its newest buckets and flags it', () => {
    const request = buildAggregatedLiquidationsBucketRequest(
      [BASE_SECONDS, BASE_SECONDS + 1800 * 5],
      '30m',
      3,
    )
    assert.ok(request)
    assert.equal(request.truncated, true)
    // Newest three 30m slots: the 4th, 5th and 6th loaded candle.
    assert.equal(request.from, (BASE_SECONDS + 3 * 1800) * 1000)
    assert.equal(request.to, (BASE_SECONDS + 6 * 1800) * 1000)
  })

  it('aligns weekly requests to the Monday bucket origin', () => {
    const request = buildAggregatedLiquidationsBucketRequest(
      [MONDAY_SECONDS, MONDAY_SECONDS + 604_800],
      '1w',
    )
    assert.deepEqual(request, {
      from: MONDAY_SECONDS * 1000,
      to: (MONDAY_SECONDS + 2 * 604_800) * 1000,
      truncated: false,
    })
  })
})

describe('aggregated liquidation coverage notices', () => {
  it('stays silent when the bucket response covers the whole range', () => {
    const request = buildAggregatedLiquidationsBucketRequest([BASE_SECONDS], '1h')
    assert.ok(request)
    assert.equal(
      describeAggregatedLiquidationsBucketNotice(request, { truncated: false }),
      null,
    )
  })

  it('states the covered bucket range when the request was narrowed', () => {
    const request = buildAggregatedLiquidationsBucketRequest(
      [BASE_SECONDS, BASE_SECONDS + 3600 * 5],
      '1h',
      2,
    )
    assert.ok(request)
    const notice = describeAggregatedLiquidationsBucketNotice(request, {
      truncated: false,
    })
    assert.ok(notice)
    assert.match(notice, /bucket limit/)
    assert.match(
      notice,
      new RegExp(formatAggregatedLiquidationsCoverageTime(request.from)),
    )
    assert.match(
      notice,
      new RegExp(formatAggregatedLiquidationsCoverageTime(request.to)),
    )
  })

  it('states the covered event range when the event walk hit the page cap', () => {
    const events = [
      event('a', BASE_TIME_MS),
      event('b', BASE_TIME_MS + 2 * MINUTE),
    ]
    assert.equal(describeAggregatedLiquidationsEventNotice(events, false), null)
    const notice = describeAggregatedLiquidationsEventNotice(events, true)
    assert.ok(notice)
    assert.match(notice, /page limit/)
    assert.match(
      notice,
      new RegExp(formatAggregatedLiquidationsCoverageTime(BASE_TIME_MS)),
    )
    assert.match(
      notice,
      new RegExp(
        formatAggregatedLiquidationsCoverageTime(BASE_TIME_MS + 2 * MINUTE),
      ),
    )
  })

  it('states the truncation even when no event could be loaded', () => {
    const notice = describeAggregatedLiquidationsEventNotice([], true)
    assert.ok(notice)
    assert.match(notice, /truncated/)
  })
})

describe('nextAggregatedLiquidationsBucketsAfterError', () => {
  const query = {
    exchange: 'binance' as const,
    interval: '1h' as const,
    from: BASE_TIME_MS,
    to: BASE_TIME_MS + 6 * HOUR,
  }
  const loaded: AggregatedLiquidationsBucketsState = {
    ...query,
    buckets: [{ time: BASE_SECONDS, long: 40_000, short: 0 }],
  }

  it('keeps the last buckets when the same request fails again', () => {
    // The 15 s live refresh re-issues the same request; a transient failure
    // must not blank the pane.
    const next = nextAggregatedLiquidationsBucketsAfterError(loaded, {
      ...query,
    })

    assert.equal(next, loaded)
    assert.deepEqual(next.buckets, loaded.buckets)
  })

  it('clears when the interval changed', () => {
    const next = nextAggregatedLiquidationsBucketsAfterError(loaded, {
      ...query,
      interval: '4h',
    })

    assert.deepEqual(next.buckets, [])
    assert.equal(next.interval, '4h')
  })

  it('clears when the exchange changed', () => {
    const next = nextAggregatedLiquidationsBucketsAfterError(loaded, {
      ...query,
      exchange: 'hyperliquid',
    })

    assert.deepEqual(next.buckets, [])
    assert.equal(next.exchange, 'hyperliquid')
  })

  it('clears when the loaded range changed', () => {
    for (const changed of [
      { ...query, from: query.from + HOUR },
      { ...query, to: query.to + HOUR },
    ]) {
      const next = nextAggregatedLiquidationsBucketsAfterError(loaded, changed)
      assert.deepEqual(next.buckets, [], JSON.stringify(changed))
      assert.equal(next.from, changed.from)
      assert.equal(next.to, changed.to)
    }
  })

  it('starts empty when nothing was loaded yet', () => {
    const next = nextAggregatedLiquidationsBucketsAfterError(null, query)

    assert.deepEqual(next, { ...query, buckets: [] })
  })

  it('keeps the buckets and still explains a transient failure', () => {
    // Both halves of the behaviour: the previously rendered array survives and
    // the pane still gets a notice saying the refresh failed.
    const next = nextAggregatedLiquidationsBucketsAfterError(loaded, {
      ...query,
    })
    const notice = describeAggregatedLiquidationsBucketError(
      new AggregatedLiquidationsBucketsClientError('HTTP 503', 503),
    )

    assert.equal(next.buckets.length, 1)
    assert.match(notice, /Could not load Aggregated Liquidations history/)
    assert.match(notice, /HTTP 503/)
  })

  it('describes a non-Error failure without leaking undefined', () => {
    const notice = describeAggregatedLiquidationsBucketError('boom')

    assert.equal(
      notice,
      'Could not load Aggregated Liquidations history for the loaded chart range',
    )
  })
})

describe('<= 15m path regression', () => {
  it('keeps the existing event bucketing output byte-for-byte', () => {
    // Two 15m buckets, mixed sides and one event per bucket boundary. This is
    // the exact contract the events path must keep while >= 30m switches to
    // backend buckets.
    const events = [
      event('a', BASE_TIME_MS, 40_000),
      event('b', BASE_TIME_MS + 30_000, 10_000),
      event('c', BASE_TIME_MS + 15 * MINUTE, 5_000),
    ]
    assert.deepEqual(bucketAggregatedLiquidationEvents(events, '15m'), [
      { time: BASE_SECONDS, long: 50_000, short: 0 },
      { time: BASE_SECONDS + 900, long: 5_000, short: 0 },
    ])
  })

  it('never routes 15m to the bucket request path', () => {
    assert.equal(shouldUseAggregatedLiquidationBuckets('15m'), false)
  })
})
