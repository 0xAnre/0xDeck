import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ORDER_BOOK_DEPTH_HISTORY_PATH,
  OrderBookDepthHistoryClientError,
  fetchOrderBookDepthHistory,
  fetchOrderBookDepthHistoryPage,
  orderBookDepthHistoryPath,
  parseOrderBookDepthHistoryPage,
} from './orderBookDepthHistory.ts'

const BASE_TIME_MS = Date.UTC(2026, 9, 14, 17, 45)
const MINUTE = 60_000

function rawSample(
  id: string,
  time = BASE_TIME_MS,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    source: 'binance',
    exchange: 'binance',
    symbol: 'BTCUSDT',
    distance: 2.5,
    time,
    mid: 80_000,
    bid_notional: 1_000_000,
    ask_notional: 900_000,
    imbalance: 5,
    bid_coverage_pct: 0.153,
    ask_coverage_pct: 0.18,
    complete: false,
    ...overrides,
  }
}

function page(
  samples: unknown[],
  options: { hasMore?: boolean; nextBefore?: number | null } = {},
) {
  return {
    exchange: 'binance',
    symbol: 'BTCUSDT',
    source: 'binance',
    distance: 2.5,
    samples,
    has_more: options.hasMore ?? false,
    next_before: options.nextBefore ?? null,
  }
}

describe('orderBookDepthHistoryPath', () => {
  it('builds the documented path and always selects a distance', () => {
    assert.equal(
      orderBookDepthHistoryPath(),
      `${ORDER_BOOK_DEPTH_HISTORY_PATH}?distance=2.5`,
    )
    assert.equal(
      orderBookDepthHistoryPath({
        distance: 0.5,
        before: 1_792_000_000_000,
        limit: 250,
      }),
      `${ORDER_BOOK_DEPTH_HISTORY_PATH}?distance=0.5&before=1792000000000&limit=250`,
    )
  })
})

describe('parseOrderBookDepthHistoryPage', () => {
  it('accepts a valid page with parsed samples', () => {
    const parsedPage = parseOrderBookDepthHistoryPage(
      page(
        [rawSample('b', BASE_TIME_MS + MINUTE), rawSample('a')],
        { hasMore: true, nextBefore: BASE_TIME_MS },
      ),
    )
    assert.equal(parsedPage.distance, 2.5)
    assert.deepEqual(
      parsedPage.samples.map((sample) => sample.id),
      ['b', 'a'],
    )
    assert.equal(parsedPage.hasMore, true)
    assert.equal(parsedPage.nextBefore, BASE_TIME_MS)
  })

  it('rejects malformed samples but keeps valid ones', () => {
    const parsedPage = parseOrderBookDepthHistoryPage(
      page([
        rawSample('valid'),
        rawSample('bad', BASE_TIME_MS, { imbalance: 500 }),
        rawSample('other-distance', BASE_TIME_MS, { distance: 0.25 }),
        null,
      ]),
    )
    assert.deepEqual(parsedPage.samples.map((sample) => sample.id), ['valid'])
  })

  it('rejects invalid page-level payloads', () => {
    for (const payload of [
      null,
      { ...page([]), exchange: 'hyperliquid' },
      { ...page([]), symbol: 'ETHUSDT' },
      { ...page([]), source: 'hyperliquid' },
      { ...page([]), distance: 3 },
      { ...page([]), samples: null },
      { ...page([]), has_more: 'yes' },
      { ...page([]), next_before: 0 },
      page([], { hasMore: true, nextBefore: null }),
    ]) {
      assert.throws(
        () => parseOrderBookDepthHistoryPage(payload),
        OrderBookDepthHistoryClientError,
      )
    }
  })
})

describe('fetchOrderBookDepthHistoryPage', () => {
  it('requests the selected distance and parses the response', async () => {
    const requested: string[] = []
    const result = await fetchOrderBookDepthHistoryPage({
      distance: 1,
      before: BASE_TIME_MS,
      limit: 50,
      fetchImpl: (async (url: string) => {
        requested.push(url)
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => page([], { nextBefore: null }),
        }
      }) as unknown as typeof fetch,
    })
    assert.equal(result.distance, 2.5)
    assert.equal(
      requested[0],
      `/api${ORDER_BOOK_DEPTH_HISTORY_PATH}?distance=1&before=${BASE_TIME_MS}&limit=50`,
    )
  })

  it('surfaces backend error details', async () => {
    await assert.rejects(
      fetchOrderBookDepthHistoryPage({
        fetchImpl: (async () => ({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ detail: 'distance invalid' }),
        })) as unknown as typeof fetch,
      }),
      (error: unknown) => {
        assert.ok(error instanceof OrderBookDepthHistoryClientError)
        assert.equal(error.status, 400)
        assert.equal(error.message, 'distance invalid')
        return true
      },
    )
  })
})

describe('fetchOrderBookDepthHistory', () => {
  it('walks newest-first pages until the loaded candle range is covered', async () => {
    const pages = [
      page(
        [
          rawSample('newest', BASE_TIME_MS + 2 * MINUTE),
          rawSample('middle', BASE_TIME_MS + MINUTE),
        ],
        { hasMore: true, nextBefore: BASE_TIME_MS + MINUTE },
      ),
      page(
        [rawSample('oldest', BASE_TIME_MS)],
        { hasMore: true, nextBefore: BASE_TIME_MS - MINUTE },
      ),
      page([], { hasMore: false, nextBefore: null }),
    ]
    const requests: string[] = []

    const history = await fetchOrderBookDepthHistory({
      distance: 2.5,
      oldestTimeMs: BASE_TIME_MS,
      fetchImpl: (async (url: string) => {
        requests.push(url)
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => pages.shift(),
        }
      }) as unknown as typeof fetch,
    })

    assert.deepEqual(
      history.samples.map((sample) => sample.id),
      ['oldest', 'middle', 'newest'],
    )
    assert.equal(history.pages, 2)
    assert.equal(history.truncated, false)
    assert.match(requests[0], /distance=2\.5/)
    assert.match(requests[1], /before=/)
  })

  it('deduplicates samples repeated across pages', async () => {
    const pages = [
      page([rawSample('shared'), rawSample('new')], {
        hasMore: true,
        nextBefore: BASE_TIME_MS,
      }),
      page([rawSample('shared'), rawSample('old', BASE_TIME_MS - MINUTE)], {
        hasMore: false,
        nextBefore: null,
      }),
    ]
    const history = await fetchOrderBookDepthHistory({
      fetchImpl: (async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => pages.shift(),
      })) as unknown as typeof fetch,
    })
    assert.deepEqual(
      history.samples.map((sample) => sample.id),
      ['old', 'new', 'shared'],
    )
  })

  it('marks a history walk truncated at the page cap', async () => {
    let pageIndex = 0
    const history = await fetchOrderBookDepthHistory({
      maxPages: 1,
      fetchImpl: (async () => {
        pageIndex += 1
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () =>
            page([rawSample(`sample-${pageIndex}`)], {
              hasMore: true,
              nextBefore: BASE_TIME_MS - pageIndex,
            }),
        }
      }) as unknown as typeof fetch,
    })
    assert.equal(history.pages, 1)
    assert.equal(history.truncated, true)
    assert.equal(history.samples.length, 1)
  })
})
