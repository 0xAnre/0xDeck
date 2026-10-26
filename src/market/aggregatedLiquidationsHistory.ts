/**
 * Browser → 0xDeck backend client for persisted Binance liquidation history.
 *
 * The backend stores normalized `forceOrder` events in SQLite while it runs.
 * This module validates that history payload with the same strict event parser
 * used for live WebSocket messages, then merges history + live events into one
 * id-deduplicated, time-ordered buffer.
 *
 * There is no upstream backfill: history starts when the backend starts
 * collecting. A long-running database is read through a bounded number of
 * pages so the chart panel can never hang on it.
 */
import { API_BASE } from '../api/apiBase.ts'
import {
  AGGREGATED_LIQUIDATIONS_EXCHANGE,
  AGGREGATED_LIQUIDATIONS_SYMBOL,
  parseAggregatedLiquidationEvent,
  type AggregatedLiquidationEvent,
} from './aggregatedLiquidations.ts'
import { candleIntervalDurationSeconds } from './candleIntervalDuration.ts'
import type { CandleInterval } from './types.ts'

export const AGGREGATED_LIQUIDATIONS_HISTORY_PATH =
  '/market/binance/usdm/btcusdt/liquidations/history'

export const AGGREGATED_LIQUIDATIONS_HISTORY_DEFAULT_LIMIT = 500
export const AGGREGATED_LIQUIDATIONS_HISTORY_MAX_LIMIT = 1000
/** Hard cap for history pagination; a long-running DB must not hang the panel. */
export const AGGREGATED_LIQUIDATIONS_HISTORY_MAX_PAGES = 12
/**
 * Bounded retention for the merged buffer. Events are first scoped to the
 * loaded candle range, so interval changes can rebucket everything the chart
 * can currently draw without keeping an unbounded process-lifetime buffer.
 */
export const AGGREGATED_LIQUIDATIONS_RETENTION_MAX_EVENTS = 20_000

export type AggregatedLiquidationsHistoryPage = {
  exchange: typeof AGGREGATED_LIQUIDATIONS_EXCHANGE
  symbol: typeof AGGREGATED_LIQUIDATIONS_SYMBOL
  /** Newest-first, exactly as the backend paginates them. */
  events: AggregatedLiquidationEvent[]
  hasMore: boolean
  nextBefore: number | null
}

export type AggregatedLiquidationsHistory = {
  events: AggregatedLiquidationEvent[]
  pages: number
  /** True when the page cap (not the database) stopped the walk. */
  truncated: boolean
}

export class AggregatedLiquidationsHistoryClientError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AggregatedLiquidationsHistoryClientError'
    this.status = status
  }
}

function readPositiveInteger(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    return null
  }
  return value
}

export function aggregatedLiquidationsHistoryPath(params?: {
  before?: number | null
  limit?: number
}): string {
  const search = new URLSearchParams()
  if (params?.before !== undefined && params.before !== null) {
    search.set('before', String(Math.trunc(params.before)))
  }
  if (params?.limit !== undefined) {
    search.set('limit', String(Math.trunc(params.limit)))
  }
  const suffix = search.toString()
  return suffix
    ? `${AGGREGATED_LIQUIDATIONS_HISTORY_PATH}?${suffix}`
    : AGGREGATED_LIQUIDATIONS_HISTORY_PATH
}

/**
 * Parse one history response. Malformed event objects are rejected (omitted)
 * instead of reaching the chart as `NaN`; the page-level shape must still be
 * valid so clients never silently render an empty chart on a broken payload.
 */
export function parseAggregatedLiquidationsHistoryPage(
  payload: unknown,
): AggregatedLiquidationsHistoryPage {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AggregatedLiquidationsHistoryClientError(
      'Liquidation history response must be an object',
    )
  }
  const record = payload as Record<string, unknown>

  if (record.exchange !== AGGREGATED_LIQUIDATIONS_EXCHANGE) {
    throw new AggregatedLiquidationsHistoryClientError(
      `Liquidation history response exchange must be ${AGGREGATED_LIQUIDATIONS_EXCHANGE}`,
    )
  }
  if (record.symbol !== AGGREGATED_LIQUIDATIONS_SYMBOL) {
    throw new AggregatedLiquidationsHistoryClientError(
      `Liquidation history response symbol must be ${AGGREGATED_LIQUIDATIONS_SYMBOL}`,
    )
  }
  if (!Array.isArray(record.events)) {
    throw new AggregatedLiquidationsHistoryClientError(
      'Liquidation history response events must be an array',
    )
  }
  if (typeof record.has_more !== 'boolean') {
    throw new AggregatedLiquidationsHistoryClientError(
      'Liquidation history response has_more must be boolean',
    )
  }

  let nextBefore: number | null = null
  if (record.next_before !== undefined && record.next_before !== null) {
    nextBefore = readPositiveInteger(record.next_before)
    if (nextBefore === null) {
      throw new AggregatedLiquidationsHistoryClientError(
        'Liquidation history response next_before is invalid',
      )
    }
  }
  if (record.has_more && nextBefore === null) {
    throw new AggregatedLiquidationsHistoryClientError(
      'Liquidation history response has_more requires next_before',
    )
  }

  const events: AggregatedLiquidationEvent[] = []
  for (const raw of record.events) {
    const event = parseAggregatedLiquidationEvent(raw)
    if (event !== null) events.push(event)
  }

  return {
    exchange: AGGREGATED_LIQUIDATIONS_EXCHANGE,
    symbol: AGGREGATED_LIQUIDATIONS_SYMBOL,
    events,
    hasMore: record.has_more,
    nextBefore,
  }
}

export type MergeAggregatedLiquidationEventsOptions = {
  /** Maximum retained events after scoping to the candle range. */
  maxEvents?: number
  /** Loaded candle open times (unix seconds). Empty keeps every event. */
  candleTimes?: readonly number[]
  /** Chart interval, used to include the whole last loaded candle. */
  interval?: CandleInterval
}

/**
 * Merge history and live events without double counting.
 *
 * Identity is the relay event `id`, so an event that arrives in both the
 * history page and the live socket contributes once. The result is ascending by
 * trade time (the bucket functions do not require input order, but stable order
 * makes the buffer deterministic), scoped to the loaded candle range, then
 * capped to the newest `maxEvents` entries.
 */
export function mergeAggregatedLiquidationEvents(
  current: readonly AggregatedLiquidationEvent[],
  incoming: readonly AggregatedLiquidationEvent[],
  options: MergeAggregatedLiquidationEventsOptions = {},
): AggregatedLiquidationEvent[] {
  const seen = new Set<string>()
  const merged: AggregatedLiquidationEvent[] = []
  for (const event of [...current, ...incoming]) {
    if (seen.has(event.id)) continue
    seen.add(event.id)
    merged.push(event)
  }
  merged.sort(
    (a, b) => a.tradeTime - b.tradeTime || a.id.localeCompare(b.id),
  )

  let retained = merged
  const candleTimes = options.candleTimes
  if (candleTimes && candleTimes.length > 0 && options.interval) {
    const startMs = Math.min(...candleTimes) * 1000
    const endMs =
      (Math.max(...candleTimes) +
        candleIntervalDurationSeconds(options.interval)) *
      1000
    retained = merged.filter(
      (event) => event.tradeTime >= startMs && event.tradeTime < endMs,
    )
  }

  const maxEvents = Math.max(
    1,
    Math.trunc(options.maxEvents ?? AGGREGATED_LIQUIDATIONS_RETENTION_MAX_EVENTS),
  )
  if (retained.length > maxEvents) {
    retained = retained.slice(retained.length - maxEvents)
  }
  return retained
}

export type FetchAggregatedLiquidationsHistoryPageParams = {
  before?: number | null
  limit?: number
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}

export async function fetchAggregatedLiquidationsHistoryPage(
  params: FetchAggregatedLiquidationsHistoryPageParams = {},
): Promise<AggregatedLiquidationsHistoryPage> {
  const {
    before = null,
    limit = AGGREGATED_LIQUIDATIONS_HISTORY_DEFAULT_LIMIT,
    signal,
    fetchImpl = fetch,
  } = params

  const safeLimit = Math.max(
    1,
    Math.min(
      Math.trunc(limit),
      AGGREGATED_LIQUIDATIONS_HISTORY_MAX_LIMIT,
    ),
  )
  const response = await fetchImpl(
    `${API_BASE}${aggregatedLiquidationsHistoryPath({ before, limit: safeLimit })}`,
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
    throw new AggregatedLiquidationsHistoryClientError(detail, response.status)
  }

  const json = (await response.json()) as unknown
  return parseAggregatedLiquidationsHistoryPage(json)
}

export type FetchAggregatedLiquidationsHistoryParams = {
  /** Stop paging once the next cursor is at/before this event time. */
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
export async function fetchAggregatedLiquidationsHistory(
  params: FetchAggregatedLiquidationsHistoryParams = {},
): Promise<AggregatedLiquidationsHistory> {
  const {
    oldestTimeMs = null,
    limit = AGGREGATED_LIQUIDATIONS_HISTORY_DEFAULT_LIMIT,
    maxPages = AGGREGATED_LIQUIDATIONS_HISTORY_MAX_PAGES,
    signal,
    fetchImpl,
  } = params
  const pageCap = Math.max(1, Math.trunc(maxPages))

  let before: number | null = null
  let pages = 0
  let truncated = false
  const collected: AggregatedLiquidationEvent[] = []

  while (pages < pageCap) {
    const page = await fetchAggregatedLiquidationsHistoryPage({
      before,
      limit,
      signal,
      fetchImpl,
    })
    pages += 1
    collected.push(...page.events)

    if (!page.hasMore || page.nextBefore === null) break
    if (oldestTimeMs !== null && page.nextBefore <= oldestTimeMs) break
    if (before !== null && page.nextBefore >= before) break

    before = page.nextBefore
    if (pages >= pageCap) {
      truncated = true
    }
  }

  return {
    events: mergeAggregatedLiquidationEvents([], collected),
    pages,
    truncated,
  }
}
