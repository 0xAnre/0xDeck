import type { IChartApi } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  loadOlderBtcPerpHistory,
  type FetchBtcPerpHistory,
  type InfiniteHistoryState,
} from './btcPerpetualInfiniteHistory.ts'
import { olderHistoryPageMadeProgress } from './btcPerpetualHistoryPageProgress.ts'
import { visibleTimeRangeNeedsHistoryLoad } from './marketChartViewport.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { CandleInterval, MarketCandle } from './types.ts'

const MAX_OLDER_HISTORY_PAGES_FOR_VIEWPORT = 40

export async function loadOlderHistoryUntilVisibleFrom(
  params: {
    state: InfiniteHistoryState
    generation: number
    interval: CandleInterval
    visibleTimeRange: { from: number; to: number }
    candlesRef: { current: MarketCandle[] }
    bundle: ChartSeriesBundle
    chart: IChartApi
    signal?: AbortSignal
    fetchHistory?: FetchBtcPerpHistory
    getRollingVwapInstances?: () => readonly RollingVwapInstance[]
    getAnchoredVwapInstances?: () => readonly AnchoredVwapInstance[]
  },
): Promise<void> {
  const {
    state,
    generation,
    interval,
    visibleTimeRange,
    candlesRef,
    bundle,
    chart,
    signal,
    fetchHistory,
    getRollingVwapInstances,
    getAnchoredVwapInstances,
  } = params

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
      interval,
      before: candles[0].time,
      candlesRef,
      bundle,
      chart,
      signal,
      fetchHistory,
      getRollingVwapInstances,
      getAnchoredVwapInstances,
    })

    if (state.generation !== generation) return
    if (state.exhausted) return

    if (
      !olderHistoryPageMadeProgress(candleCountBefore, oldestTimeBefore, candlesRef.current)
    ) {
      break
    }
  }
}
