import type { IChartApi } from 'lightweight-charts'
import type { BinanceKlinesResponse, CandleInterval, MarketCandle } from '@/market/types'

export const INFINITE_HISTORY_BARS_BEFORE_THRESHOLD = 50

export type InfiniteHistoryState = {
  exhausted: boolean
  loading: boolean
  requestedBefore: Set<number>
  generation: number
  /** True once the provider reported that history older than its horizon is unavailable. */
  historyUnavailable: boolean
  /** Earliest candle open time (unix seconds) the provider can serve, when limited. */
  availableFrom: number | null
}

export type FetchBtcPerpHistory = (
  interval: CandleInterval,
  beforeEpochSeconds: number,
  signal?: AbortSignal,
) => Promise<BinanceKlinesResponse>

export type ApplyMergedHistory = (bundle: unknown, candles: readonly MarketCandle[]) => void

export type MergeOlderCandles = (
  existing: readonly MarketCandle[],
  older: readonly MarketCandle[],
) => MarketCandle[]

export function createInfiniteHistoryState(): InfiniteHistoryState {
  return {
    exhausted: false,
    loading: false,
    requestedBefore: new Set<number>(),
    generation: 0,
    historyUnavailable: false,
    availableFrom: null,
  }
}

export function resetInfiniteHistoryState(state: InfiniteHistoryState, generation: number): void {
  state.exhausted = false
  state.loading = false
  state.requestedBefore.clear()
  state.generation = generation
  state.historyUnavailable = false
  state.availableFrom = null
}

/** Record provider availability metadata from a history page. */
export function recordHistoryAvailability(
  state: InfiniteHistoryState,
  response: {
    history_unavailable?: boolean
    available_from?: number | null
  },
): void {
  if (response.history_unavailable === true) {
    state.historyUnavailable = true
  }
  const availableFrom = response.available_from
  if (
    typeof availableFrom === 'number' &&
    Number.isFinite(availableFrom) &&
    availableFrom > 0
  ) {
    state.availableFrom =
      state.availableFrom === null ? availableFrom : Math.max(state.availableFrom, availableFrom)
  }
}

/**
 * True when the provider horizon is known and `before` is at or beyond it: such
 * a page cannot contain any candle, so it must never be requested.
 */
export function isHistoryBeforeProviderHorizon(
  state: InfiniteHistoryState,
  beforeEpochSeconds: number,
): boolean {
  const { availableFrom } = state
  return availableFrom !== null && beforeEpochSeconds <= availableFrom
}

export function releaseHistoryBeforeRequest(
  state: InfiniteHistoryState,
  generation: number,
  before: number,
): void {
  if (state.generation !== generation) return
  state.requestedBefore.delete(before)
}

export function isHistoryAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === 'AbortError') return true
  return error instanceof Error && error.name === 'AbortError'
}

type LoadOlderHistoryParams = {
  state: InfiniteHistoryState
  generation: number
  interval: CandleInterval
  before: number
  candlesRef: { current: MarketCandle[] }
  bundle: unknown
  chart: IChartApi
  signal?: AbortSignal
  fetchHistory: FetchBtcPerpHistory
  applyMergedHistory: ApplyMergedHistory
  mergeOlderCandles: MergeOlderCandles
  /**
   * Called whenever the history state changed (candles prepended, provider
   * horizon reached, or history exhausted) so derived state such as notices refreshes.
   */
  onHistoryStateChange?: () => void
}

export async function loadOlderBtcPerpHistoryCore(params: LoadOlderHistoryParams): Promise<void> {
  const {
    state,
    generation,
    interval,
    before,
    candlesRef,
    bundle,
    chart,
    signal,
    fetchHistory,
    applyMergedHistory,
    mergeOlderCandles,
    onHistoryStateChange,
  } = params

  if (state.loading || state.exhausted || state.generation !== generation) return
  if (state.requestedBefore.has(before)) return

  // The provider horizon is already known: never request (or emit) candles
  // beyond it, and surface the explicit unavailable state instead.
  if (isHistoryBeforeProviderHorizon(state, before)) {
    state.exhausted = true
    state.historyUnavailable = true
    onHistoryStateChange?.()
    return
  }

  state.loading = true
  state.requestedBefore.add(before)

  try {
    const response = await fetchHistory(interval, before, signal)
    if (state.generation !== generation) {
      releaseHistoryBeforeRequest(state, generation, before)
      return
    }
    if (response.interval !== interval) {
      releaseHistoryBeforeRequest(state, generation, before)
      return
    }

    recordHistoryAvailability(state, response)
    // A page flagged unavailable is clamped at the provider horizon, so no
    // older candle can exist: retire the cursor after merging what arrived.
    const reachedProviderHorizon = response.history_unavailable === true

    const older = response.candles.filter((candle) => candle.interval === interval)
    if (older.length === 0) {
      state.exhausted = true
      onHistoryStateChange?.()
      return
    }

    const previousLength = candlesRef.current.length
    const merged = mergeOlderCandles(candlesRef.current, older)
    const addedCount = merged.length - previousLength
    if (addedCount <= 0) {
      state.exhausted = true
      onHistoryStateChange?.()
      return
    }

    const logicalRange = chart.timeScale().getVisibleLogicalRange()
    applyMergedHistory(bundle, merged)
    candlesRef.current = merged

    if (logicalRange) {
      chart.timeScale().setVisibleLogicalRange({
        from: logicalRange.from + addedCount,
        to: logicalRange.to + addedCount,
      })
    }

    if (reachedProviderHorizon) {
      state.exhausted = true
    }

    onHistoryStateChange?.()
  } catch (error) {
    // Never retain a cursor whose request did not deliver candles: aborted and
    // failed pages must stay retryable by both the preload and viewport backfill.
    releaseHistoryBeforeRequest(state, generation, before)
    if (isHistoryAbortError(error)) return
  } finally {
    if (state.generation === generation) {
      state.loading = false
    }
  }
}
