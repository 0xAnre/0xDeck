import type { IChartApi, ISeriesApi, LogicalRange } from 'lightweight-charts'
import { fetchMarketKlinesHistory } from '@/api/client'
import { applyChartHistorySeries } from '@/market/applyChartHistorySeries'
import type { ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import {
  INFINITE_HISTORY_BARS_BEFORE_THRESHOLD,
  loadOlderBtcPerpHistoryCore,
  type FetchBtcPerpHistory,
  type InfiniteHistoryState,
} from '@/market/btcPerpetualInfiniteHistoryCore'
import { mergeOlderMarketCandles } from '@/market/mergeMarketCandles'
import type { AnchoredVwapInstance } from '@/market/anchoredVwapInstances'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import type { CandleInterval, MarketCandle, MarketExchange } from '@/market/types'

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
  exchange: MarketExchange
  interval: CandleInterval
  before: number
  candlesRef: { current: MarketCandle[] }
  bundle: ChartSeriesBundle
  chart: IChartApi
  signal?: AbortSignal
  fetchHistory?: FetchBtcPerpHistory
  getRollingVwapInstances?: () => readonly RollingVwapInstance[]
  getAnchoredVwapInstances?: () => readonly AnchoredVwapInstance[]
  /** Called after older candles were prepended, so derived state (e.g. notices) can refresh. */
  onHistoryMerged?: () => void
}

export async function loadOlderBtcPerpHistory(params: LoadOlderHistoryParams): Promise<void> {
  const {
    exchange,
    fetchHistory = (interval, before, signal) =>
      fetchMarketKlinesHistory(exchange, interval, before, signal),
    getRollingVwapInstances,
    getAnchoredVwapInstances,
    ...rest
  } = params
  return loadOlderBtcPerpHistoryCore({
    ...rest,
    fetchHistory,
    applyMergedHistory: (bundle, candles) =>
      applyChartHistorySeries(
        bundle as ChartSeriesBundle,
        candles,
        getRollingVwapInstances?.() ?? [],
        getAnchoredVwapInstances?.() ?? [],
      ),
    mergeOlderCandles: mergeOlderMarketCandles,
  })
}

export function maybeRequestOlderBtcPerpHistory(params: {
  state: InfiniteHistoryState
  historyReady: boolean
  exchange: MarketExchange
  range: LogicalRange | null
  candleSeries: ISeriesApi<'Candlestick'>
  candlesRef: { current: MarketCandle[] }
  generation: number
  interval: CandleInterval
  bundle: ChartSeriesBundle
  chart: IChartApi
  signal?: AbortSignal
  fetchHistory?: FetchBtcPerpHistory
  getRollingVwapInstances?: () => readonly RollingVwapInstance[]
  getAnchoredVwapInstances?: () => readonly AnchoredVwapInstance[]
  /** Called after older candles were prepended, so derived state (e.g. notices) can refresh. */
  onHistoryMerged?: () => void
}): void {
  const {
    state,
    historyReady,
    exchange,
    range,
    candleSeries,
    candlesRef,
    generation,
    interval,
    bundle,
    chart,
    signal,
    fetchHistory,
    getRollingVwapInstances,
    getAnchoredVwapInstances,
    onHistoryMerged,
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
    exchange,
    interval,
    before,
    candlesRef,
    bundle,
    chart,
    signal,
    fetchHistory,
    getRollingVwapInstances,
    getAnchoredVwapInstances,
    onHistoryMerged,
  })
}
