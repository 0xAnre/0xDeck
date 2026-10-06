import type { UTCTimestamp } from 'lightweight-charts'
import type { ChartSeriesBundle } from '@/market/applyChartLiveCandle'
import { applyRollingVwapInstancesHistory } from '@/market/rollingVwapChartInstances'
import type { RollingVwapInstance } from '@/market/rollingVwapInstances'
import { computeDailyVwap } from '@/market/dailyVwap'
import { setDailyVwapLineSeriesData } from '@/market/dailyVwapChartSeries'
import { computeMonthlyVwap } from '@/market/monthlyVwap'
import { setMonthlyVwapLineSeriesData } from '@/market/monthlyVwapChartSeries'
import { computeQuarterlyVwap } from '@/market/quarterlyVwap'
import { setQuarterlyVwapLineSeriesData } from '@/market/quarterlyVwapChartSeries'
import { computeWeeklyVwap } from '@/market/weeklyVwap'
import { setWeeklyVwapLineSeriesData } from '@/market/weeklyVwapChartSeries'
import { computeYearlyVwap } from '@/market/yearlyVwap'
import { setYearlyVwapLineSeriesData } from '@/market/yearlyVwapChartSeries'
import { computeEmaLine, EMA_PERIODS } from '@/market/ema'
import { computeSmaLine, SMA_20_PERIOD, SMA_50_PERIOD } from '@/market/sma'
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

/** Replace candle, EMA, and VWAP series from merged history (no fitContent). */
export function applyChartHistorySeries(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  rollingVwapInstances: readonly RollingVwapInstance[] = [],
): void {
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
  const sma20Line = computeSmaLine([...candles], SMA_20_PERIOD)
  bundle.sma20.setData(
    sma20Line.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    })),
  )
  const sma50Line = computeSmaLine([...candles], SMA_50_PERIOD)
  bundle.sma50.setData(
    sma50Line.map((point) => ({
      time: point.time as UTCTimestamp,
      value: point.value,
    })),
  )
  setDailyVwapLineSeriesData(bundle.dailyVwap, computeDailyVwap(candles))
  setWeeklyVwapLineSeriesData(bundle.weeklyVwap, computeWeeklyVwap(candles))
  setMonthlyVwapLineSeriesData(bundle.monthlyVwap, computeMonthlyVwap(candles))
  setQuarterlyVwapLineSeriesData(bundle.quarterlyVwap, computeQuarterlyVwap(candles))
  setYearlyVwapLineSeriesData(bundle.yearlyVwap, computeYearlyVwap(candles))
  applyRollingVwapInstancesHistory(bundle, candles, rollingVwapInstances)
}
