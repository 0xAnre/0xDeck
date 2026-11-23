import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  applyBtcPerpHistorySeries,
  loadOlderBtcPerpHistory,
  type FetchBtcPerpHistory,
  type InfiniteHistoryState,
} from './btcPerpetualInfiniteHistory.ts'
import { olderHistoryPageMadeProgress } from './btcPerpetualHistoryPageProgress.ts'
import { visibleTimeRangeNeedsHistoryLoad } from './marketChartViewport.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { ChartIndicatorSeriesPlan } from './chartIndicatorSeriesPlan.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { CandleInterval, MarketCandle, MarketExchange } from './types.ts'

const MAX_OLDER_HISTORY_PAGES_FOR_VIEWPORT = 40

/**
 * Load older pages until a saved (offscreen) viewport is covered.
 *
 * The pages only merge into `candlesRef`; every intermediate apply used to
 * rebuild each series (candles + ~10 hidden indicator series) on a growing
 * window, so a 37-page restore blocked the main thread for the whole burst and
 * the user never saw the intermediate images anyway (each page shifted the
 * logical range to keep the same bars on screen). Applying once after the last
 * page trims that to a single rebuild while the loop keeps yielding between
 * fetches, and the caller still restores the exact saved viewport afterwards.
 */
export async function loadOlderHistoryUntilVisibleFrom(
  params: {
    state: InfiniteHistoryState
    generation: number
    exchange: MarketExchange
    interval: CandleInterval
    visibleTimeRange: { from: number; to: number }
    candlesRef: { current: MarketCandle[] }
    bundle: ChartSeriesBundle
    chart: IChartApi
    signal?: AbortSignal
    fetchHistory?: FetchBtcPerpHistory
    getRollingVwapInstances?: () => readonly RollingVwapInstance[]
    getAnchoredVwapInstances?: () => readonly AnchoredVwapInstance[]
    getIndicatorSeriesPlan?: () => ChartIndicatorSeriesPlan
  },
): Promise<void> {
  const {
    state,
    generation,
    exchange,
    interval,
    visibleTimeRange,
    candlesRef,
    bundle,
    chart,
    signal,
    fetchHistory,
    getRollingVwapInstances,
    getAnchoredVwapInstances,
    getIndicatorSeriesPlan,
  } = params

  let mergedPages = 0

  const applyMergedHistory = () => {
    if (mergedPages === 0) return
    if (state.generation !== generation) return
    if (signal?.aborted) return
    applyBtcPerpHistorySeries(
      bundle,
      candlesRef.current,
      getRollingVwapInstances?.() ?? [],
      getAnchoredVwapInstances?.() ?? [],
      getIndicatorSeriesPlan?.(),
    )
  }

  try {
    for (let page = 0; page < MAX_OLDER_HISTORY_PAGES_FOR_VIEWPORT; page += 1) {
      if (state.generation !== generation) return
      if (state.exhausted) return

      const candles = candlesRef.current
      if (candles.length === 0) return
      if (!visibleTimeRangeNeedsHistoryLoad(visibleTimeRange, candles)) return

      const candleCountBefore = candles.length
      const oldestTimeBefore = candles[0].time

      await loadOlderBtcPerpHistory({
        state,
        generation,
        exchange,
        interval,
        before: candles[0].time,
        candlesRef,
        bundle,
        chart,
        signal,
        fetchHistory,
        getRollingVwapInstances,
        getAnchoredVwapInstances,
        getIndicatorSeriesPlan,
        deferSeriesApplication: true,
      })

      if (state.generation !== generation) return
      if (state.exhausted) return

      if (
        !olderHistoryPageMadeProgress(candleCountBefore, oldestTimeBefore, candlesRef.current)
      ) {
        break
      }
      mergedPages += 1
    }
  } finally {
    applyMergedHistory()
  }
}
