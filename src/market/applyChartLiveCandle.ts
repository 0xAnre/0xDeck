import type { ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import {
  applyDailyVwapLiveFromCandles,
  type DailyVwapLineSeriesBundle,
} from './dailyVwapChartSeries.ts'
import { applyMonthlyVwapLiveFromCandles } from './monthlyVwapChartSeries.ts'
import { applyQuarterlyVwapLiveFromCandles } from './quarterlyVwapChartSeries.ts'
import {
  applyWeeklyVwapLiveFromCandles,
  type WeeklyVwapLineSeriesBundle,
} from './weeklyVwapChartSeries.ts'
import { applyYearlyVwapLiveFromCandles } from './yearlyVwapChartSeries.ts'
import { applyAnchoredVwapDrawingInstancesLive } from './anchoredVwapDrawingChartInstances.ts'
import type { AnchoredVwapDrawingChartInstanceMap } from './anchoredVwapDrawingChartInstances.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import { applyRollingVwapInstancesLive } from './rollingVwapChartInstances.ts'
import type { RollingVwapChartInstanceMap } from './rollingVwapChartInstances.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import type { RsiChartPaneBundle } from './rsiChartPane.ts'
import { updateRsiPaneLiveData } from './rsiChartPane.ts'
import type { MarketIndicatorId, VwapContextLevel } from './indicators.ts'
import { shouldShowVwapIndicatorSeries } from './indicators.ts'
import {
  FULL_CHART_INDICATOR_SERIES_PLAN,
  resolveChartIndicatorSeriesPlan,
  type ChartIndicatorSeriesPlan,
} from './chartIndicatorSeriesPlan.ts'
import { updateDualEmaLive } from './chartDualEmaSeries.ts'
import { computeEmaLine, EMA_PERIODS } from './ema.ts'
import { applyLiveCandle } from './parseMarketCandle.ts'
import type { MonthlyVwapLineSeriesBundle } from './monthlyVwapChartSeries.ts'
import type { QuarterlyVwapLineSeriesBundle } from './quarterlyVwapChartSeries.ts'
import type { YearlyVwapLineSeriesBundle } from './yearlyVwapChartSeries.ts'
import type { CandleInterval, MarketCandle } from './types.ts'

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
  ema100: ISeriesApi<'Line'>
  ema200: ISeriesApi<'Line'>
  dailyVwap: DailyVwapLineSeriesBundle
  weeklyVwap: WeeklyVwapLineSeriesBundle
  monthlyVwap: MonthlyVwapLineSeriesBundle
  quarterlyVwap: QuarterlyVwapLineSeriesBundle
  yearlyVwap: YearlyVwapLineSeriesBundle
  rollingVwaps: RollingVwapChartInstanceMap
  anchoredVwaps: AnchoredVwapDrawingChartInstanceMap
  /** RSI pane, present only while the RSI indicator is enabled on this panel. */
  rsi: RsiChartPaneBundle | null
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

/**
 * Derive the same plan history used, so a tick can never push a latest-only
 * point onto a series whose history was skipped.
 */
function liveIndicatorSeriesPlan(context: LiveVwapUpdateContext | undefined): ChartIndicatorSeriesPlan {
  if (!context) return FULL_CHART_INDICATOR_SERIES_PLAN
  return resolveChartIndicatorSeriesPlan({
    activeIndicators: context.activeIndicators,
    interval: context.interval,
  })
}

/** Update in-memory candles and chart series (no full setData). */
export function applyChartLiveCandle(
  candles: MarketCandle[],
  candle: MarketCandle,
  bundle: ChartSeriesBundle,
  vwapContext?: LiveVwapUpdateContext,
  rollingVwapInstances: readonly RollingVwapInstance[] = [],
  anchoredVwapInstances: readonly AnchoredVwapInstance[] = [],
): void {
  const applyResult = applyLiveCandle(candles, candle)
  if (applyResult === 'ignore') return

  const rollingInterval = candle.interval
  const plan = liveIndicatorSeriesPlan(vwapContext)

  bundle.candle.update(toCandlestickPoint(candle))

  if (plan['triple-ema']) {
    EMA_PERIODS.forEach((period, index) => {
      const line = computeEmaLine(candles, period)
      if (line.length === 0) return
      const last = line[line.length - 1]
      bundle.emas[index].update({
        time: last.time as UTCTimestamp,
        value: last.value,
      })
    })
  }

  if (plan['dual-ema']) {
    updateDualEmaLive(bundle.ema100, bundle.ema200, candles)
  }

  if (bundle.rsi) {
    updateRsiPaneLiveData(bundle.rsi, candles)
  }

  if (!vwapContext) {
    applyDailyVwapLiveFromCandles(candles, bundle.dailyVwap)
    applyWeeklyVwapLiveFromCandles(candles, bundle.weeklyVwap)
    applyMonthlyVwapLiveFromCandles(candles, bundle.monthlyVwap)
    applyQuarterlyVwapLiveFromCandles(candles, bundle.quarterlyVwap)
    applyYearlyVwapLiveFromCandles(candles, bundle.yearlyVwap)
    applyRollingVwapInstancesLive(candles, bundle, rollingVwapInstances, rollingInterval)
    applyAnchoredVwapDrawingInstancesLive(candles, bundle, anchoredVwapInstances)
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

  applyRollingVwapInstancesLive(candles, bundle, rollingVwapInstances, rollingInterval)
  applyAnchoredVwapDrawingInstancesLive(candles, bundle, anchoredVwapInstances)
}
