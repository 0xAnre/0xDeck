import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  bucketAggregatedLiquidationEvents,
  filterAggregatedLiquidationBucketsToCandles,
  parseAggregatedLiquidationEvent,
  type AggregatedLiquidationEvent,
} from './aggregatedLiquidations.ts'
import {
  aggregatedLiquidationsHistoryPath,
  AggregatedLiquidationsHistoryClientError,
  fetchAggregatedLiquidationsHistory,
  liquidationHistoryCursorAdvances,
  mergeAggregatedLiquidationEvents,
  parseAggregatedLiquidationsHistoryPage,
} from './aggregatedLiquidationsHistory.ts'

const BASE_TIME_MS = 1_792_000_020_000
const BASE_SECONDS = BASE_TIME_MS / 1000
const MINUTE = 60_000

function historyEvent(
  id: string,
  tradeTime: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    side: 'long',
    price: 80_000,
    quantity: 0.5,
    notional: 40_000,
    time: tradeTime + 25,
    trade_time: tradeTime,
    id,
    ...overrides,
  }
}

function parsed(id: string, tradeTime = BASE_TIME_MS): AggregatedLiquidationEvent {
  const event = parseAggregatedLiquidationEvent(historyEvent(id, tradeTime))
  assert.ok(event)
  return event
}

function page(
  events: unknown[],
  options: {
    hasMore?: boolean
    nextBefore?: number | null
    nextBeforeId?: string | null
  } = {},
) {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    events,
    has_more: options.hasMore ?? false,
    next_before: options.nextBefore ?? null,
    next_before_id: options.nextBeforeId ?? null,
  }
}

describe('aggregatedLiquidationsHistoryPath', () => {
  it('builds the documented path and query', () => {
    assert.equal(
      aggregatedLiquidationsHistoryPath(),
      '/market/binance/usdm/btcusdt/liquidations/history',
    )
    assert.equal(
      aggregatedLiquidationsHistoryPath({ before: 1_792_000_000_000, limit: 250 }),
      '/market/binance/usdm/btcusdt/liquidations/history?before=1792000000000&limit=250',
    )
  })

  it('sends the keyset half of the cursor when present', () => {
    assert.equal(
      aggregatedLiquidationsHistoryPath({
        before: 1_792_000_000_000,
        beforeId: 'binance|BTCUSDT|SELL|1|2|0.5|80000',
        limit: 10,
      }),
      '/market/binance/usdm/btcusdt/liquidations/history?before=1792000000000&before_id=binance%7CBTCUSDT%7CSELL%7C1%7C2%7C0.5%7C80000&limit=10',
    )
    // A legacy before-only call is byte-identical to the pre-keyset path.
    assert.equal(
      aggregatedLiquidationsHistoryPath({ before: 5, beforeId: null, limit: 10 }),
      '/market/binance/usdm/btcusdt/liquidations/history?before=5&limit=10',
    )
  })
})

describe('parseAggregatedLiquidationsHistoryPage', () => {
  it('accepts a valid page with normalized events', () => {
    const body = page(
      [historyEvent('b', BASE_TIME_MS + MINUTE), historyEvent('a', BASE_TIME_MS)],
      { hasMore: true, nextBefore: BASE_TIME_MS, nextBeforeId: 'a' },
    )
    const parsedPage = parseAggregatedLiquidationsHistoryPage(body)

    assert.equal(parsedPage.exchange, 'binance')
    assert.equal(parsedPage.symbol, 'BTCUSDT')
    assert.deepEqual(
      parsedPage.events.map((event) => event.id),
      ['b', 'a'],
    )
    assert.equal(parsedPage.hasMore, true)
    assert.equal(parsedPage.nextBefore, BASE_TIME_MS)
    assert.equal(parsedPage.nextBeforeId, 'a')
  })

  it('treats a missing next_before_id as null (legacy backend)', () => {
    const parsedPage = parseAggregatedLiquidationsHistoryPage({
      exchange: 'binance',
      symbol: 'BTCUSDT',
      events: [historyEvent('a', BASE_TIME_MS)],
      has_more: false,
      next_before: null,
    })

    assert.equal(parsedPage.nextBeforeId, null)
  })

  it('rejects an invalid next_before_id', () => {
    for (const value of ['', 7, {}]) {
      assert.throws(
        () =>
          parseAggregatedLiquidationsHistoryPage(
            page([], { hasMore: true, nextBefore: BASE_TIME_MS, nextBeforeId: value as string }),
          ),
        AggregatedLiquidationsHistoryClientError,
      )
    }
  })

  it('rejects malformed event objects without rendering NaN', () => {
    const body = page([
      historyEvent('valid', BASE_TIME_MS),
      historyEvent('bad-price', BASE_TIME_MS + 1, { price: 'NaN' }),
      historyEvent('bad-side', BASE_TIME_MS + 2, { side: 'both' }),
      null,
    ])
    const parsedPage = parseAggregatedLiquidationsHistoryPage(body)

    assert.deepEqual(parsedPage.events.map((event) => event.id), ['valid'])
    assert.ok(parsedPage.events.every((event) => Number.isFinite(event.notional)))
  })

  it('rejects invalid page-level payloads', () => {
    assert.throws(
      () => parseAggregatedLiquidationsHistoryPage(null),
      AggregatedLiquidationsHistoryClientError,
    )
    assert.throws(
      () => parseAggregatedLiquidationsHistoryPage({ ...page([]), exchange: 'hyperliquid' }),
      AggregatedLiquidationsHistoryClientError,
    )
    assert.throws(
      () => parseAggregatedLiquidationsHistoryPage({ ...page([]), symbol: 'ETHUSDT' }),
      AggregatedLiquidationsHistoryClientError,
    )
    assert.throws(
      () => parseAggregatedLiquidationsHistoryPage({ ...page([]), events: null }),
      AggregatedLiquidationsHistoryClientError,
    )
    assert.throws(
      () => parseAggregatedLiquidationsHistoryPage({ ...page([]), has_more: 'yes' }),
      AggregatedLiquidationsHistoryClientError,
    )
    assert.throws(
      () => parseAggregatedLiquidationsHistoryPage({ ...page([]), next_before: 0 }),
      AggregatedLiquidationsHistoryClientError,
    )
    assert.throws(
      () =>
        parseAggregatedLiquidationsHistoryPage(
          page([], { hasMore: true, nextBefore: null }),
        ),
      AggregatedLiquidationsHistoryClientError,
    )
  })
})

describe('mergeAggregatedLiquidationEvents', () => {
  it('counts history/live overlap once and keeps trade-time order', () => {
    const liveFirst = parsed('shared', BASE_TIME_MS + 10)
    const historyFirst = parsed('shared', BASE_TIME_MS + 10)
    const earlier = parsed('earlier', BASE_TIME_MS)
    const later = parsed('later', BASE_TIME_MS + 20)

    const merged = mergeAggregatedLiquidationEvents(
      [liveFirst, later],
      [historyFirst, earlier],
    )

    assert.deepEqual(
      merged.map((event) => event.id),
      ['earlier', 'shared', 'later'],
    )
  })

  it('keeps events covering the loaded candle range and drops the rest', () => {
    const candleTimes = [BASE_SECONDS, BASE_SECONDS + 60]
    const inFirstCandle = parsed('first', BASE_TIME_MS + 10)
    const inLastCandle = parsed('last', BASE_TIME_MS + 70_000)
    const beforeRange = parsed('old', (BASE_SECONDS - 60) * 1000)
    const afterRange = parsed('future', (BASE_SECONDS + 180) * 1000)

    const merged = mergeAggregatedLiquidationEvents(
      [beforeRange, inFirstCandle, afterRange],
      [inLastCandle],
      { candleTimes, interval: '1m' },
    )

    assert.deepEqual(
      merged.map((event) => event.id),
      ['first', 'last'],
    )
    assert.deepEqual(
      filterAggregatedLiquidationBucketsToCandles(
        bucketAggregatedLiquidationEvents(merged, '1m'),
        candleTimes,
      ),
      filterAggregatedLiquidationBucketsToCandles(
        bucketAggregatedLiquidationEvents(
          [inFirstCandle, inLastCandle],
          '1m',
        ),
        candleTimes,
      ),
    )
  })

  it('trims to the newest events when the range exceeds the retention cap', () => {
    const candleTimes = [BASE_SECONDS]
    const events = Array.from({ length: 5 }, (_, index) =>
      parsed(`e${index}`, BASE_TIME_MS + index * 1_000),
    )

    const merged = mergeAggregatedLiquidationEvents(events, [], {
      candleTimes,
      interval: '1m',
      maxEvents: 3,
    })

    assert.deepEqual(
      merged.map((event) => event.id),
      ['e2', 'e3', 'e4'],
    )
  })
})

describe('liquidationHistoryCursorAdvances', () => {
  it('advances on an older time, on a smaller id, and only on those', () => {
    const start = { before: 1_000, beforeId: 'm' }

    assert.equal(liquidationHistoryCursorAdvances(null, start), true)
    assert.equal(
      liquidationHistoryCursorAdvances(start, { before: 999, beforeId: 'z' }),
      true,
    )
    // Same timestamp is still progress when the id moves down.
    assert.equal(
      liquidationHistoryCursorAdvances(start, { before: 1_000, beforeId: 'a' }),
      true,
    )
    // Same cursor, a newer time, or an id that does not move down: stop.
    assert.equal(
      liquidationHistoryCursorAdvances(start, { before: 1_000, beforeId: 'm' }),
      false,
    )
    assert.equal(
      liquidationHistoryCursorAdvances(start, { before: 1_001, beforeId: 'a' }),
      false,
    )
    // Without both ids the keyset cannot advance inside a tie group.
    assert.equal(
      liquidationHistoryCursorAdvances(start, { before: 1_000, beforeId: null }),
      false,
    )
    assert.equal(
      liquidationHistoryCursorAdvances(
        { before: 1_000, beforeId: null },
        { before: 1_000, beforeId: 'a' },
      ),
      false,
    )
  })
})

function fakeFetch(pages: unknown[]) {
  const calls: string[] = []
  const fetchImpl = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    const body = pages.shift()
    if (body === undefined) {
      throw new Error('fake fetch ran out of pages')
    }
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  return { fetchImpl, calls }
}

describe('fetchAggregatedLiquidationsHistory with a tie group', () => {
  /**
   * Stand-in for the backend page query: rows ordered by
   * `(trade_time DESC, id DESC)`, filtered by the exclusive
   * `(before, before_id)` keyset, limited to `limit`.
   */
  function fakeKeysetFetch(
    rows: { id: string; tradeTime: number }[],
    options: { emitIdCursor?: boolean } = {},
  ) {
    const emitIdCursor = options.emitIdCursor ?? true
    const sorted = [...rows].sort(
      (a, b) => b.tradeTime - a.tradeTime || b.id.localeCompare(a.id),
    )
    const calls: URLSearchParams[] = []
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      const params = url.searchParams
      calls.push(params)
      const beforeRaw = params.get('before')
      const beforeId = params.get('before_id')
      const limit = Number(params.get('limit') ?? '500')

      let filtered = sorted
      if (beforeRaw !== null) {
        const before = Number(beforeRaw)
        filtered = sorted.filter((row) => {
          if (row.tradeTime !== before) return row.tradeTime < before
          // A legacy backend cannot page inside a same-timestamp group.
          if (beforeId === null) return false
          return row.id < beforeId
        })
      }

      const pageRows = filtered.slice(0, limit)
      const hasMore = filtered.length > limit
      const last = pageRows[pageRows.length - 1]
      const body: Record<string, unknown> = {
        exchange: 'binance',
        symbol: 'BTCUSDT',
        events: pageRows.map((row) => historyEvent(row.id, row.tradeTime)),
        has_more: hasMore,
        next_before: hasMore ? last.tradeTime : null,
      }
      if (emitIdCursor) {
        body.next_before_id = hasMore ? last.id : null
      }

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }) as typeof fetch
    return { fetchImpl, calls }
  }

  const tieRows = ['t-e', 't-d', 't-c', 't-b', 't-a'].map((id) => ({
    id,
    tradeTime: BASE_TIME_MS,
  }))

  for (const limit of [1, 2]) {
    it(`pages a 5-row tie group at limit ${limit} with zero loss and zero repeats`, async () => {
      const { fetchImpl, calls } = fakeKeysetFetch(tieRows)

      const result = await fetchAggregatedLiquidationsHistory({
        limit,
        maxPages: 20,
        fetchImpl,
      })

      assert.deepEqual(
        result.events.map((event) => event.id),
        ['t-a', 't-b', 't-c', 't-d', 't-e'],
      )
      assert.equal(result.events.length, 5)
      assert.equal(new Set(result.events.map((event) => event.id)).size, 5)
      assert.equal(result.truncated, false)
      assert.equal(calls.length, Math.ceil(5 / limit))
      assert.equal(calls[0].get('before_id'), null)
      // Every follow-up request carries the keyset, not just the timestamp.
      for (const call of calls.slice(1)) {
        assert.ok(call.get('before_id'))
      }
    })
  }

  it('loses the tie tail against a legacy before-only server', async () => {
    // Documents why the id half of the cursor is required: without it the
    // client cannot ask for "the same timestamp, older id".
    const { fetchImpl } = fakeKeysetFetch(tieRows, { emitIdCursor: false })

    const result = await fetchAggregatedLiquidationsHistory({
      limit: 2,
      maxPages: 20,
      fetchImpl,
    })

    assert.equal(result.events.length, 2)
  })

  it('still pages a legacy before-only server when timestamps differ', async () => {
    const rows = [3, 2, 1, 0].map((index) => ({
      id: `e${index}`,
      tradeTime: BASE_TIME_MS + index * MINUTE,
    }))
    const { fetchImpl, calls } = fakeKeysetFetch(rows, { emitIdCursor: false })

    const result = await fetchAggregatedLiquidationsHistory({
      limit: 1,
      maxPages: 20,
      fetchImpl,
    })

    assert.deepEqual(
      result.events.map((event) => event.id),
      ['e0', 'e1', 'e2', 'e3'],
    )
    assert.equal(calls.length, 4)
    for (const call of calls) assert.equal(call.get('before_id'), null)
  })

  it('stops instead of looping when the server repeats its cursor', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      return new Response(
        JSON.stringify(
          page([historyEvent('stuck', BASE_TIME_MS)], {
            hasMore: true,
            nextBefore: BASE_TIME_MS,
            nextBeforeId: 'stuck',
          }),
        ),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }) as typeof fetch

    const result = await fetchAggregatedLiquidationsHistory({
      limit: 1,
      maxPages: 20,
      fetchImpl,
    })

    assert.equal(calls, 2)
    assert.equal(result.events.length, 1)
  })
})

describe('fetchAggregatedLiquidationsHistory', () => {
  it('accumulates pages, dedupes, and stops when the database is exhausted', async () => {
    const { fetchImpl, calls } = fakeFetch([
      page(
        [
          historyEvent('e3', BASE_TIME_MS + 3 * MINUTE),
          historyEvent('e2', BASE_TIME_MS + 2 * MINUTE),
        ],
        { hasMore: true, nextBefore: BASE_TIME_MS + 2 * MINUTE },
      ),
      page([historyEvent('e1', BASE_TIME_MS + MINUTE)], {
        hasMore: true,
        nextBefore: BASE_TIME_MS + MINUTE,
      }),
      page([historyEvent('e0', BASE_TIME_MS)]),
    ])

    const result = await fetchAggregatedLiquidationsHistory({
      limit: 2,
      fetchImpl,
    })

    assert.deepEqual(
      result.events.map((event) => event.id),
      ['e0', 'e1', 'e2', 'e3'],
    )
    assert.equal(result.pages, 3)
    assert.equal(result.truncated, false)
    assert.equal(calls.length, 3)
    assert.ok(calls[1].includes('before='))
  })

  it('stops once the next cursor is older than the loaded candle range', async () => {
    const oldestTimeMs = BASE_TIME_MS - MINUTE
    const { fetchImpl, calls } = fakeFetch([
      page([historyEvent('recent', BASE_TIME_MS)], {
        hasMore: true,
        nextBefore: oldestTimeMs - MINUTE,
      }),
    ])

    const result = await fetchAggregatedLiquidationsHistory({
      oldestTimeMs,
      fetchImpl,
    })

    assert.equal(calls.length, 1)
    assert.deepEqual(result.events.map((event) => event.id), ['recent'])
  })

  it('keeps paging when the cursor lands exactly on the oldest needed time', async () => {
    // A tie group sitting on the range boundary must not be truncated, so the
    // stop condition is `<`, not `<=`.
    const oldestTimeMs = BASE_TIME_MS - MINUTE
    const { fetchImpl, calls } = fakeFetch([
      page([historyEvent('newer', BASE_TIME_MS)], {
        hasMore: true,
        nextBefore: oldestTimeMs,
        nextBeforeId: 'newer',
      }),
      page([historyEvent('boundary', oldestTimeMs)]),
    ])

    const result = await fetchAggregatedLiquidationsHistory({
      oldestTimeMs,
      fetchImpl,
    })

    assert.equal(calls.length, 2)
    assert.deepEqual(result.events.map((event) => event.id), [
      'boundary',
      'newer',
    ])
  })

  it('honours the hard page cap for a long-running database', async () => {
    let next = BASE_TIME_MS
    const pages = Array.from({ length: 5 }, (_, index) => {
      const before = next
      next -= MINUTE
      return page([historyEvent(`e${index}`, before)], {
        hasMore: true,
        nextBefore: next,
      })
    })
    const { fetchImpl, calls } = fakeFetch(pages)

    const result = await fetchAggregatedLiquidationsHistory({
      limit: 1,
      maxPages: 2,
      fetchImpl,
    })

    assert.equal(calls.length, 2)
    assert.equal(result.pages, 2)
    assert.equal(result.truncated, true)
  })

  it('surfaces non-OK responses', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ detail: 'bad params' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })) as typeof fetch

    await assert.rejects(
      fetchAggregatedLiquidationsHistory({ fetchImpl }),
      (error: unknown) =>
        error instanceof AggregatedLiquidationsHistoryClientError &&
        error.status === 400 &&
        error.message === 'bad params',
    )
  })
})
