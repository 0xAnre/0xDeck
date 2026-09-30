import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import {
  applyDailyVwapLiveFromCandles,
  type DailyVwapLineSeriesBundle,
} from '@/market/dailyVwapChartSeries'
import { applyMonthlyVwapLiveFromCandles } from '@/market/monthlyVwapChartSeries'
import { applyQuarterlyVwapLiveFromCandles } from '@/market/quarterlyVwapChartSeries'
import {
  applyWeeklyVwapLiveFromCandles,
  type WeeklyVwapLineSeriesBundle,
} from '@/market/weeklyVwapChartSeries'
import { applyYearlyVwapLiveFromCandles } from '@/market/yearlyVwapChartSeries'
import { applyRollingVwapLiveFromCandles, type RollingVwapChartSeriesBundle } from '@/market/rollingVwapChartSeries'
import { createDefaultRollingVwapSettings, type RollingVwapSettings } from '@/market/rollingVwapSettings'
import type { MarketIndicatorId, VwapContextLevel } from '@/market/indicators'
import { shouldShowVwapIndicatorSeries } from '@/market/indicators'
import { computeEmaLine, EMA_PERIODS } from '@/market/ema'
import { applyLiveCandle } from '@/market/parseMarketCandle'
import type { MonthlyVwapLineSeriesBundle } from '@/market/monthlyVwapChartSeries'
import type { QuarterlyVwapLineSeriesBundle } from '@/market/quarterlyVwapChartSeries'
import type { YearlyVwapLineSeriesBundle } from '@/market/yearlyVwapChartSeries'
import type { CandleInterval, MarketCandle } from '@/market/types'

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
  monthlyVwap: MonthlyVwapLineSeriesBundle
  quarterlyVwap: QuarterlyVwapLineSeriesBundle
  yearlyVwap: YearlyVwapLineSeriesBundle
  rollingVwap: RollingVwapChartSeriesBundle
}

export type LiveVwapUpdateContext = {
  interval: CandleInterval
  activeIndicators: readonly MarketIndicatorId[]
  loadedLevel: VwapContextLevel | null
  loadedInterval: CandleInterval | null
}

function shouldUpdateVwap(
  indicatorId: MarketIndicatorId,
  ctx: LiveVwapUpdateContext,
): boolean {
  return shouldShowVwapIndicatorSeries({
    indicatorId,
    indicatorSelected: ctx.activeIndicators.includes(indicatorId),
    interval: ctx.interval,
    loadedLevel: ctx.loadedLevel,
    loadedInterval: ctx.loadedInterval,
  })
}

/** Update in-memory candles and chart series (no full setData). */
export function applyChartLiveCandle(
  candles: MarketCandle[],
  candle: MarketCandle,
  bundle: ChartSeriesBundle,
  vwapContext?: LiveVwapUpdateContext,
  rollingVwapSettings?: RollingVwapSettings,
): void {
  const applyResult = applyLiveCandle(candles, candle)
  if (applyResult === 'ignore') return

  const rollingSettings = rollingVwapSettings ?? createDefaultRollingVwapSettings()
  const rollingInterval = candle.interval

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

  if (!vwapContext) {
    applyDailyVwapLiveFromCandles(candles, bundle.dailyVwap)
    applyWeeklyVwapLiveFromCandles(candles, bundle.weeklyVwap)
    applyMonthlyVwapLiveFromCandles(candles, bundle.monthlyVwap)
    applyQuarterlyVwapLiveFromCandles(candles, bundle.quarterlyVwap)
    applyYearlyVwapLiveFromCandles(candles, bundle.yearlyVwap)
    applyRollingVwapLiveFromCandles(candles, bundle.rollingVwap, rollingInterval, rollingSettings)
    return
  }

  if (shouldUpdateVwap('daily-vwap', vwapContext)) {
    applyDailyVwapLiveFromCandles(candles, bundle.dailyVwap)
  }
  if (shouldUpdateVwap('weekly-vwap', vwapContext)) {
    applyWeeklyVwapLiveFromCandles(candles, bundle.weeklyVwap)
  }
  if (shouldUpdateVwap('monthly-vwap', vwapContext)) {
    applyMonthlyVwapLiveFromCandles(candles, bundle.monthlyVwap)
  }
  if (shouldUpdateVwap('quarterly-vwap', vwapContext)) {
    applyQuarterlyVwapLiveFromCandles(candles, bundle.quarterlyVwap)
  }
  if (shouldUpdateVwap('yearly-vwap', vwapContext)) {
    applyYearlyVwapLiveFromCandles(candles, bundle.yearlyVwap)
  }

  applyRollingVwapLiveFromCandles(candles, bundle.rollingVwap, rollingInterval, rollingSettings)
}
