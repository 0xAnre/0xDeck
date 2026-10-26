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
  options: { hasMore?: boolean; nextBefore?: number | null } = {},
) {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    events,
    has_more: options.hasMore ?? false,
    next_before: options.nextBefore ?? null,
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
})

describe('parseAggregatedLiquidationsHistoryPage', () => {
  it('accepts a valid page with normalized events', () => {
    const body = page(
      [historyEvent('b', BASE_TIME_MS + MINUTE), historyEvent('a', BASE_TIME_MS)],
      { hasMore: true, nextBefore: BASE_TIME_MS },
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
        nextBefore: oldestTimeMs,
      }),
    ])

    const result = await fetchAggregatedLiquidationsHistory({
      oldestTimeMs,
      fetchImpl,
    })

    assert.equal(calls.length, 1)
    assert.deepEqual(result.events.map((event) => event.id), ['recent'])
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
