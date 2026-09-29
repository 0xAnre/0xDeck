import type { IChartApi, ISeriesApi, LogicalRange } from 'lightweight-charts'
import { fetchBinanceBtcusdtKlinesHistory } from '@/api/client'
import { applyChartHistorySeries } from '@/market/applyChartHistorySeries'
import type { ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import { mergeOlderMarketCandles } from '@/market/mergeMarketCandles'
import type { CandleInterval, MarketCandle } from '@/market/types'

export const INFINITE_HISTORY_BARS_BEFORE_THRESHOLD = 50

export type InfiniteHistoryState = {
  exhausted: boolean
  loading: boolean
  requestedBefore: Set<number>
  generation: number
}

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

type LoadOlderHistoryParams = {
  state: InfiniteHistoryState
  generation: number
  interval: CandleInterval
  before: number
  candlesRef: { current: MarketCandle[] }
  bundle: ChartSeriesBundle
  chart: IChartApi
}

export async function loadOlderBtcPerpHistory(params: LoadOlderHistoryParams): Promise<void> {
  const { state, generation, interval, before, candlesRef, bundle, chart } = params
  if (state.loading || state.exhausted || state.generation !== generation) return
  if (state.requestedBefore.has(before)) return

  state.loading = true
  state.requestedBefore.add(before)

  try {
    const response = await fetchBinanceBtcusdtKlinesHistory(interval, before)
    if (state.generation !== generation) return
    if (response.interval !== interval) return

    const older = response.candles.filter((candle) => candle.interval === interval)
    if (older.length === 0) {
      state.exhausted = true
      return
    }

    const previousLength = candlesRef.current.length
    const merged = mergeOlderMarketCandles(candlesRef.current, older)
    const addedCount = merged.length - previousLength
    if (addedCount <= 0) {
      state.exhausted = true
      return
    }

    const logicalRange = chart.timeScale().getVisibleLogicalRange()
    applyChartHistorySeries(bundle, merged)
    candlesRef.current = merged

    if (logicalRange) {
      chart.timeScale().setVisibleLogicalRange({
        from: logicalRange.from + addedCount,
        to: logicalRange.to + addedCount,
      })
    }
  } finally {
    if (state.generation === generation) {
      state.loading = false
    }
  }
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
  })
}
