import type { IChartApi, ISeriesApi, LogicalRange } from 'lightweight-charts'
import { fetchMarketKlinesHistory } from '../api/client.ts'
import { applyChartHistorySeries } from './applyChartHistorySeries.ts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import {
  INFINITE_HISTORY_BARS_BEFORE_THRESHOLD,
  loadOlderBtcPerpHistoryCore,
  type FetchBtcPerpHistory,
  type InfiniteHistoryState,
} from './btcPerpetualInfiniteHistoryCore.ts'
import type { ChartIndicatorSeriesPlan } from './chartIndicatorSeriesPlan.ts'
import { mergeOlderMarketCandles } from './mergeMarketCandles.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { CandleInterval, MarketCandle, MarketExchange } from './types.ts'

export {
  INFINITE_HISTORY_BARS_BEFORE_THRESHOLD,
  createInfiniteHistoryState,
  resetInfiniteHistoryState,
  releaseHistoryBeforeRequest,
} from './btcPerpetualInfiniteHistoryCore.ts'
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
  /**
   * Plan of indicator series this panel shows. Read at apply time so a toggle
   * made while a page is in flight is honored instead of the stale plan.
   */
  getIndicatorSeriesPlan?: () => ChartIndicatorSeriesPlan
  /**
   * When true the page only merges into `candlesRef`; the caller applies the
   * merged history itself (a restore burst applies it once at the end).
   */
  deferSeriesApplication?: boolean
  /**
   * Called whenever the history state changed (candles prepended, provider
   * horizon reached, or history exhausted) so derived state such as notices refreshes.
   */
  onHistoryStateChange?: () => void
}

/** Apply one merged history window to the chart series (single native rebuild). */
export function applyBtcPerpHistorySeries(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  rollingVwapInstances: readonly RollingVwapInstance[] = [],
  anchoredVwapInstances: readonly AnchoredVwapInstance[] = [],
  plan?: ChartIndicatorSeriesPlan,
): void {
  applyChartHistorySeries(
    bundle,
    candles,
    rollingVwapInstances,
    anchoredVwapInstances,
    plan,
  )
}

export async function loadOlderBtcPerpHistory(params: LoadOlderHistoryParams): Promise<void> {
  const {
    exchange,
    fetchHistory = (interval, before, signal) =>
      fetchMarketKlinesHistory(exchange, interval, before, signal),
    getRollingVwapInstances,
    getAnchoredVwapInstances,
    getIndicatorSeriesPlan,
    ...rest
  } = params
  return loadOlderBtcPerpHistoryCore({
    ...rest,
    fetchHistory,
    applyMergedHistory: (bundle, candles) =>
      applyBtcPerpHistorySeries(
        bundle as ChartSeriesBundle,
        candles,
        getRollingVwapInstances?.() ?? [],
        getAnchoredVwapInstances?.() ?? [],
        getIndicatorSeriesPlan?.(),
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
  getIndicatorSeriesPlan?: () => ChartIndicatorSeriesPlan
  /**
   * Called whenever the history state changed (candles prepended, provider
   * horizon reached, or history exhausted) so derived state such as notices refreshes.
   */
  onHistoryStateChange?: () => void
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
    getIndicatorSeriesPlan,
    onHistoryStateChange,
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
    getIndicatorSeriesPlan,
    onHistoryStateChange,
  })
}
