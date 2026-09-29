import type { IChartApi } from 'lightweight-charts'
import type { BinanceKlinesResponse, CandleInterval, MarketCandle } from '@/market/types'

export const INFINITE_HISTORY_BARS_BEFORE_THRESHOLD = 50

export type InfiniteHistoryState = {
  exhausted: boolean
  loading: boolean
  requestedBefore: Set<number>
  generation: number
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
  }
}

export function resetInfiniteHistoryState(state: InfiniteHistoryState, generation: number): void {
  state.exhausted = false
  state.loading = false
  state.requestedBefore.clear()
  state.generation = generation
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
  } = params

  if (state.loading || state.exhausted || state.generation !== generation) return
  if (state.requestedBefore.has(before)) return

  state.loading = true
  state.requestedBefore.add(before)

  try {
    const response = await fetchHistory(interval, before, signal)
    if (state.generation !== generation) {
      return
    }
    if (response.interval !== interval) {
      releaseHistoryBeforeRequest(state, generation, before)
      return
    }

    const older = response.candles.filter((candle) => candle.interval === interval)
    if (older.length === 0) {
      state.exhausted = true
      return
    }

    const previousLength = candlesRef.current.length
    const merged = mergeOlderCandles(candlesRef.current, older)
    const addedCount = merged.length - previousLength
    if (addedCount <= 0) {
      state.exhausted = true
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
  } catch (error) {
    if (isHistoryAbortError(error)) return
    releaseHistoryBeforeRequest(state, generation, before)
  } finally {
    if (state.generation === generation) {
      state.loading = false
    }
  }
}
