/**
 * Browser → 0xDeck backend client for persisted order-book imbalance samples.
 *
 * The backend stores one sample per price distance every few seconds while it
 * runs. This module validates that history payload with the same strict sample
 * parser used for live WebSocket messages, then merges history + live samples
 * into one id-deduplicated, time-ordered buffer.
 *
 * History is always requested for the selected distance: the backend persists
 * per-distance samples, so another distance's total is never used as a proxy.
 */
import { API_BASE } from '../api/apiBase.ts'
import {
  DEFAULT_ORDER_BOOK_DEPTH_DISTANCE,
  ORDER_BOOK_DEPTH_EXCHANGE,
  ORDER_BOOK_DEPTH_SOURCE,
  ORDER_BOOK_DEPTH_SYMBOL,
  isOrderBookDepthDistance,
  mergeOrderBookDepthSamples,
  parseOrderBookDepthSample,
  type OrderBookDepthDistance,
  type OrderBookDepthSample,
} from './orderBookDepth.ts'

export const ORDER_BOOK_DEPTH_HISTORY_PATH =
  '/market/binance/usdm/btcusdt/orderbook/imbalance/history'

export const ORDER_BOOK_DEPTH_HISTORY_DEFAULT_LIMIT = 500
export const ORDER_BOOK_DEPTH_HISTORY_MAX_LIMIT = 1000
/** Hard cap for history pagination; a long-running DB must not hang the panel. */
export const ORDER_BOOK_DEPTH_HISTORY_MAX_PAGES = 12

export type OrderBookDepthHistoryPage = {
  exchange: typeof ORDER_BOOK_DEPTH_EXCHANGE
  symbol: typeof ORDER_BOOK_DEPTH_SYMBOL
  source: typeof ORDER_BOOK_DEPTH_SOURCE
  distance: OrderBookDepthDistance
  /** Newest-first, exactly as the backend paginates them. */
  samples: OrderBookDepthSample[]
  hasMore: boolean
  nextBefore: number | null
}

export type OrderBookDepthHistory = {
  samples: OrderBookDepthSample[]
  pages: number
  /** True when the page cap (not the database) stopped the walk. */
  truncated: boolean
}

export class OrderBookDepthHistoryClientError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'OrderBookDepthHistoryClientError'
    this.status = status
  }
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null
  }
  return value
}

export function orderBookDepthHistoryPath(params?: {
  distance?: OrderBookDepthDistance
  before?: number | null
  limit?: number
}): string {
  const search = new URLSearchParams()
  search.set(
    'distance',
    String(params?.distance ?? DEFAULT_ORDER_BOOK_DEPTH_DISTANCE),
  )
  if (params?.before !== undefined && params.before !== null) {
    search.set('before', String(Math.trunc(params.before)))
  }
  if (params?.limit !== undefined) {
    search.set('limit', String(Math.trunc(params.limit)))
  }
  return `${ORDER_BOOK_DEPTH_HISTORY_PATH}?${search.toString()}`
}

/**
 * Parse one history response. Malformed sample objects are rejected (omitted)
 * instead of reaching the chart as `NaN`; the page-level shape must still be
 * valid so clients never silently render an empty chart on a broken payload.
 */
export function parseOrderBookDepthHistoryPage(
  payload: unknown,
): OrderBookDepthHistoryPage {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new OrderBookDepthHistoryClientError(
      'Order-book history response must be an object',
    )
  }
  const record = payload as Record<string, unknown>

  if (record.exchange !== ORDER_BOOK_DEPTH_EXCHANGE) {
    throw new OrderBookDepthHistoryClientError(
      `Order-book history response exchange must be ${ORDER_BOOK_DEPTH_EXCHANGE}`,
    )
  }
  if (record.symbol !== ORDER_BOOK_DEPTH_SYMBOL) {
    throw new OrderBookDepthHistoryClientError(
      `Order-book history response symbol must be ${ORDER_BOOK_DEPTH_SYMBOL}`,
    )
  }
  if (record.source !== ORDER_BOOK_DEPTH_SOURCE) {
    throw new OrderBookDepthHistoryClientError(
      `Order-book history response source must be ${ORDER_BOOK_DEPTH_SOURCE}`,
    )
  }
  if (!isOrderBookDepthDistance(record.distance)) {
    throw new OrderBookDepthHistoryClientError(
      'Order-book history response distance is invalid',
    )
  }
  if (!Array.isArray(record.samples)) {
    throw new OrderBookDepthHistoryClientError(
      'Order-book history response samples must be an array',
    )
  }
  if (typeof record.has_more !== 'boolean') {
    throw new OrderBookDepthHistoryClientError(
      'Order-book history response has_more must be boolean',
    )
  }

  let nextBefore: number | null = null
  if (record.next_before !== undefined && record.next_before !== null) {
    nextBefore = readPositiveInteger(record.next_before)
    if (nextBefore === null) {
      throw new OrderBookDepthHistoryClientError(
        'Order-book history response next_before is invalid',
      )
    }
  }
  if (record.has_more && nextBefore === null) {
    throw new OrderBookDepthHistoryClientError(
      'Order-book history response has_more requires next_before',
    )
  }

  const distance = record.distance
  const samples: OrderBookDepthSample[] = []
  for (const raw of record.samples) {
    const sample = parseOrderBookDepthSample(raw)
    if (sample !== null && sample.distance === distance) {
      samples.push(sample)
    }
  }

  return {
    exchange: ORDER_BOOK_DEPTH_EXCHANGE,
    symbol: ORDER_BOOK_DEPTH_SYMBOL,
    source: ORDER_BOOK_DEPTH_SOURCE,
    distance,
    samples,
    hasMore: record.has_more,
    nextBefore,
  }
}

export type FetchOrderBookDepthHistoryPageParams = {
  distance?: OrderBookDepthDistance
  before?: number | null
  limit?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function fetchOrderBookDepthHistoryPage(
  params: FetchOrderBookDepthHistoryPageParams = {},
): Promise<OrderBookDepthHistoryPage> {
  const {
    distance = DEFAULT_ORDER_BOOK_DEPTH_DISTANCE,
    before = null,
    limit = ORDER_BOOK_DEPTH_HISTORY_DEFAULT_LIMIT,
    signal,
    fetchImpl = fetch,
  } = params

  const safeLimit = Math.max(
    1,
    Math.min(Math.trunc(limit), ORDER_BOOK_DEPTH_HISTORY_MAX_LIMIT),
  )
  const response = await fetchImpl(
    `${API_BASE}${orderBookDepthHistoryPath({ distance, before, limit: safeLimit })}`,
    {
      headers: { Accept: 'application/json' },
      signal,
    },
  )

  if (!response.ok) {
    let detail = response.statusText
    try {
      const errorBody = (await response.json()) as { detail?: string }
      if (errorBody.detail) detail = errorBody.detail
    } catch {
      // ignore parse errors
    }
    throw new OrderBookDepthHistoryClientError(detail, response.status)
  }

  const json = (await response.json()) as unknown
  return parseOrderBookDepthHistoryPage(json)
}

export type FetchOrderBookDepthHistoryParams = {
  distance?: OrderBookDepthDistance
  /** Stop paging once the next cursor is at/before this sample time. */
  oldestTimeMs?: number | null
  limit?: number
  maxPages?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

/**
 * Walk newest-first pages until the loaded candle range is covered, the
 * database is exhausted, or the hard page cap is reached.
 */
export async function fetchOrderBookDepthHistory(
  params: FetchOrderBookDepthHistoryParams = {},
): Promise<OrderBookDepthHistory> {
  const {
    distance = DEFAULT_ORDER_BOOK_DEPTH_DISTANCE,
    oldestTimeMs = null,
    limit = ORDER_BOOK_DEPTH_HISTORY_DEFAULT_LIMIT,
    maxPages = ORDER_BOOK_DEPTH_HISTORY_MAX_PAGES,
    signal,
    fetchImpl,
  } = params
  const pageCap = Math.max(1, Math.trunc(maxPages))

  let before: number | null = null
  let pages = 0
  let truncated = false
  const collected: OrderBookDepthSample[] = []

  while (pages < pageCap) {
    const page = await fetchOrderBookDepthHistoryPage({
      distance,
      before,
      limit,
      signal,
      fetchImpl,
    })
    pages += 1
    collected.push(...page.samples)

    if (!page.hasMore || page.nextBefore === null) break
    if (oldestTimeMs !== null && page.nextBefore <= oldestTimeMs) break
    if (before !== null && page.nextBefore >= before) break

    before = page.nextBefore
    if (pages >= pageCap) {
      truncated = true
    }
  }

  return {
    samples: mergeOrderBookDepthSamples([], collected),
    pages,
    truncated,
  }
}
