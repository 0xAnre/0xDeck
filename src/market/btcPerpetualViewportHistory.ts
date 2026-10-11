import type { IChartApi } from 'lightweight-charts'
import {
  loadOlderBtcPerpHistory,
  type FetchBtcPerpHistory,
  type InfiniteHistoryState,
} from '@/market/btcPerpetualInfiniteHistory'
import type { ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval, MarketCandle } from '@/market/types'

const MAX_OLDER_HISTORY_PAGES_FOR_VIEWPORT = 40

export async function loadOlderHistoryUntilVisibleFrom(
  params: {
    state: InfiniteHistoryState
    generation: number
    interval: CandleInterval
    targetFrom: number
    candlesRef: { current: MarketCandle[] }
    bundle: ChartSeriesBundle
    chart: IChartApi
    signal?: AbortSignal
    fetchHistory?: FetchBtcPerpHistory
    rollingVwapInstances?: readonly RollingVwapInstance[]
  },
): Promise<void> {
  const {
    state,
    generation,
    interval,
    targetFrom,
    candlesRef,
    bundle,
    chart,
    signal,
    fetchHistory,
    rollingVwapInstances,
  } = params

  for (let page = 0; page < MAX_OLDER_HISTORY_PAGES_FOR_VIEWPORT; page += 1) {
    if (state.generation !== generation) return
    if (state.exhausted) return

    const candles = candlesRef.current
    if (candles.length === 0) return
    if (targetFrom >= candles[0].time) return

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
      rollingVwapInstances,
    })

    if (state.generation !== generation) return
    if (state.exhausted) return
  }
}
