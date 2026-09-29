import type { UTCTimestamp } from 'lightweight-charts'
import type { ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import { computeDailyVwap } from '@/market/dailyVwap'
import { setDailyVwapLineSeriesData } from '@/market/dailyVwapChartSeries'
import { computeWeeklyVwap } from '@/market/weeklyVwap'
import { setWeeklyVwapLineSeriesData } from '@/market/weeklyVwapChartSeries'
import { computeEmaLine, EMA_PERIODS } from '@/market/ema'
import type { MarketCandle } from '@/market/types'

function toCandlestickPoint(candle: MarketCandle) {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

/** Replace candle, EMA, Daily VWAP, and Weekly VWAP series from merged history (no fitContent). */
export function applyChartHistorySeries(bundle: ChartSeriesBundle, candles: readonly MarketCandle[]): void {
  bundle.candle.setData(candles.map(toCandlestickPoint))
  EMA_PERIODS.forEach((period, index) => {
    const line = computeEmaLine([...candles], period)
    bundle.emas[index].setData(
      line.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    )
  })
  setDailyVwapLineSeriesData(bundle.dailyVwap, computeDailyVwap(candles))
  setWeeklyVwapLineSeriesData(bundle.weeklyVwap, computeWeeklyVwap(candles))
}
