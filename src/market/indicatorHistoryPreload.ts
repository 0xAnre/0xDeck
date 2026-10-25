/**
 * Indicator-aware backward history preload.
 *
 * Uses the existing infinite-history state (`requestedBefore` de-dup,
 * `generation`, `exhausted`) and paginates backwards until the merged
 * indicator target is satisfied. It never reads the visible logical range:
 * viewport backfill keeps its own path.
 */

import type { InfiniteHistoryState } from './btcPerpetualInfiniteHistoryCore.ts'
import type { IndicatorHistoryPlan } from './indicatorHistoryRequirements.ts'
import type { MarketCandle } from './types.ts'

/** Matches the existing viewport backfill cap (40 pages x 500 bars). */
export const MAX_INDICATOR_HISTORY_PAGES = 40

export const INDICATOR_HISTORY_IDLE_POLL_MS = 25

export const MAX_INDICATOR_HISTORY_BUSY_POLLS = 200

export type IndicatorHistoryPreloadResult =
  | 'satisfied'
  | 'exhausted'
  | 'stale'
  | 'aborted'
  | 'empty'
  | 'no-progress'
  | 'page-limit'
  | 'busy'

export type IndicatorHistoryTarget = Pick<IndicatorHistoryPlan, 'warmupBars' | 'earliestTime'>

export function historySatisfiesIndicatorTarget(
  candles: readonly MarketCandle[],
  target: IndicatorHistoryTarget,
): boolean {
  if (candles.length < target.warmupBars) return false
  if (target.earliestTime === null) return true
  if (candles.length === 0) return false
  return candles[0].time <= target.earliestTime
}

export type PreloadIndicatorHistoryParams = {
  state: InfiniteHistoryState
  generation: number
  target: IndicatorHistoryTarget
  candlesRef: { current: MarketCandle[] }
  signal?: AbortSignal
  maxPages?: number
  waitForIdle?: () => Promise<void>
  /** Loads one older page ending before `before`; must update `candlesRef`. */
  loadOlderPage: (before: number) => Promise<void>
}

function defaultWaitForIdle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, INDICATOR_HISTORY_IDLE_POLL_MS)
  })
}

/**
 * Page backwards until the target is met, history is exhausted, the generation
 * changes, the signal aborts, or no page made progress.
 */
export async function preloadIndicatorHistory(
  params: PreloadIndicatorHistoryParams,
): Promise<IndicatorHistoryPreloadResult> {
  const {
    state,
    generation,
    target,
    candlesRef,
    signal,
    maxPages = MAX_INDICATOR_HISTORY_PAGES,
    waitForIdle = defaultWaitForIdle,
    loadOlderPage,
  } = params

  let pages = 0
  let busyPolls = 0

  while (true) {
    if (state.generation !== generation) return 'stale'
    if (signal?.aborted) return 'aborted'
    if (historySatisfiesIndicatorTarget(candlesRef.current, target)) return 'satisfied'
    if (state.exhausted) return 'exhausted'

    if (state.loading) {
      if (busyPolls >= MAX_INDICATOR_HISTORY_BUSY_POLLS) return 'busy'
      busyPolls += 1
      await waitForIdle()
      continue
    }

    if (pages >= maxPages) return 'page-limit'

    const candles = candlesRef.current
    if (candles.length === 0) return 'empty'

    const before = candles[0].time
    const countBefore = candles.length
    pages += 1

    await loadOlderPage(before)

    if (state.generation !== generation) return 'stale'
    if (signal?.aborted) return 'aborted'
    if (state.exhausted) {
      return historySatisfiesIndicatorTarget(candlesRef.current, target)
        ? 'satisfied'
        : 'exhausted'
    }

    const next = candlesRef.current
    if (next.length <= countBefore && next[0]?.time === before) {
      return 'no-progress'
    }
  }
}
