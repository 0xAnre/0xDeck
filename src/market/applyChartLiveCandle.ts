import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import {
  applyDailyVwapLiveFromCandles,
  type DailyVwapLineSeriesBundle,
} from '@/market/dailyVwapChartSeries'
import {
  applyWeeklyVwapLiveFromCandles,
  type WeeklyVwapLineSeriesBundle,
} from '@/market/weeklyVwapChartSeries'
import { computeEmaLine, EMA_PERIODS } from '@/market/ema'
import { applyLiveCandle } from '@/market/parseMarketCandle'
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

export type ChartSeriesBundle = {
  candle: ISeriesApi<'Candlestick'>
  emas: ISeriesApi<'Line'>[]
  dailyVwap: DailyVwapLineSeriesBundle
  weeklyVwap: WeeklyVwapLineSeriesBundle
}

/** Update in-memory candles and chart series (no full setData). */
export function applyChartLiveCandle(
  candles: MarketCandle[],
  candle: MarketCandle,
  bundle: ChartSeriesBundle,
): void {
  const applyResult = applyLiveCandle(candles, candle)
  if (applyResult === 'ignore') return

  bundle.candle.update(toCandlestickPoint(candle))

  EMA_PERIODS.forEach((period, index) => {
    const line = computeEmaLine(candles, period)
    if (line.length === 0) return
    const last = line[line.length - 1]
    bundle.emas[index].update({
      time: last.time as UTCTimestamp,
      value: last.value,
    })
  })

  applyDailyVwapLiveFromCandles(candles, bundle.dailyVwap)
  applyWeeklyVwapLiveFromCandles(candles, bundle.weeklyVwap)
}
