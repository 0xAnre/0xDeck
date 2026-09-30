import type { IChartApi, ISeriesApi, LogicalRange } from 'lightweight-charts'
import { fetchBinanceBtcusdtKlinesHistory } from '@/api/client'
import { applyChartHistorySeries } from '@/market/applyChartHistorySeries'
import type { ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import {
  INFINITE_HISTORY_BARS_BEFORE_THRESHOLD,
  loadOlderBtcPerpHistoryCore,
  type FetchBtcPerpHistory,
  type InfiniteHistoryState,
} from '@/market/btcPerpetualInfiniteHistoryCore'
import { mergeOlderMarketCandles } from '@/market/mergeMarketCandles'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval, MarketCandle } from '@/market/types'

export {
  INFINITE_HISTORY_BARS_BEFORE_THRESHOLD,
  createInfiniteHistoryState,
  resetInfiniteHistoryState,
  releaseHistoryBeforeRequest,
} from '@/market/btcPerpetualInfiniteHistoryCore'
export type { InfiniteHistoryState, FetchBtcPerpHistory }

type LoadOlderHistoryParams = {
  state: InfiniteHistoryState
  generation: number
  interval: CandleInterval
  before: number
  candlesRef: { current: MarketCandle[] }
  bundle: ChartSeriesBundle
  chart: IChartApi
  signal?: AbortSignal
  fetchHistory?: FetchBtcPerpHistory
  rollingVwapInstances?: readonly RollingVwapInstance[]
}

export async function loadOlderBtcPerpHistory(params: LoadOlderHistoryParams): Promise<void> {
  const { fetchHistory = fetchBinanceBtcusdtKlinesHistory, rollingVwapInstances, ...rest } = params
  return loadOlderBtcPerpHistoryCore({
    ...rest,
    fetchHistory,
    applyMergedHistory: (bundle, candles) =>
      applyChartHistorySeries(bundle as ChartSeriesBundle, candles, rollingVwapInstances ?? []),
    mergeOlderCandles: mergeOlderMarketCandles,
  })
}

export function maybeRequestOlderBtcPerpHistory(params: {
  state: InfiniteHistoryState
  historyReady: boolean
  range: LogicalRange | null
  candleSeries: ISeriesApi<'Candlestick'>
  candlesRef: { current: MarketCandle[] }
  generation: number
  interval: CandleInterval
  bundle: ChartSeriesBundle
  chart: IChartApi
  signal?: AbortSignal
  fetchHistory?: FetchBtcPerpHistory
  rollingVwapInstances?: readonly RollingVwapInstance[]
}): void {
  const {
    state,
    historyReady,
    range,
    candleSeries,
    candlesRef,
    generation,
    interval,
    bundle,
    chart,
    signal,
    fetchHistory,
    rollingVwapInstances,
  } = params

  if (!historyReady || !range || state.exhausted || state.loading) return
  if (state.generation !== generation) return

  const barsInfo = candleSeries.barsInLogicalRange(range)
  if (barsInfo === null) return
  if (barsInfo.barsBefore >= INFINITE_HISTORY_BARS_BEFORE_THRESHOLD) return

  const candles = candlesRef.current
  if (candles.length === 0) return

  const before = candles[0].time
  void loadOlderBtcPerpHistory({
    state,
    generation,
    interval,
    before,
    candlesRef,
    bundle,
    chart,
    signal,
    fetchHistory,
    rollingVwapInstances,
  })
}
