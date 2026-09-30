import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { setDailyVwapLineSeriesVisible } from './dailyVwapChartSeries.ts'
import { setMonthlyVwapLineSeriesVisible } from './monthlyVwapChartSeries.ts'
import { setQuarterlyVwapLineSeriesVisible } from './quarterlyVwapChartSeries.ts'
import { setWeeklyVwapLineSeriesVisible } from './weeklyVwapChartSeries.ts'
import { setYearlyVwapLineSeriesVisible } from './yearlyVwapChartSeries.ts'
import {
  setRollingVwapLineSeriesVisible,
  shouldShowRollingVwapLineSeries,
} from './rollingVwapChartSeries.ts'
import {
  shouldShowVwapIndicatorSeries,
  type MarketIndicatorId,
  type VwapContextLevel,
} from './indicators.ts'
import type { CandleInterval } from './types.ts'

export function syncVwapSeriesVisibility(
  bundle: ChartSeriesBundle,
  params: {
    activeIndicators: readonly MarketIndicatorId[]
    interval: CandleInterval
    loadedLevel: VwapContextLevel | null
    loadedInterval: CandleInterval | null
  },
): void {
  const { activeIndicators, interval, loadedLevel, loadedInterval } = params
  const base = {
    interval,
    loadedLevel,
    loadedInterval,
  }

  setDailyVwapLineSeriesVisible(
    bundle.dailyVwap,
    shouldShowVwapIndicatorSeries({
      indicatorId: 'daily-vwap',
      indicatorSelected: activeIndicators.includes('daily-vwap'),
      ...base,
    }),
  )
  setWeeklyVwapLineSeriesVisible(
    bundle.weeklyVwap,
    shouldShowVwapIndicatorSeries({
      indicatorId: 'weekly-vwap',
      indicatorSelected: activeIndicators.includes('weekly-vwap'),
      ...base,
    }),
  )
  setMonthlyVwapLineSeriesVisible(
    bundle.monthlyVwap,
    shouldShowVwapIndicatorSeries({
      indicatorId: 'monthly-vwap',
      indicatorSelected: activeIndicators.includes('monthly-vwap'),
      ...base,
    }),
  )
  setQuarterlyVwapLineSeriesVisible(
    bundle.quarterlyVwap,
    shouldShowVwapIndicatorSeries({
      indicatorId: 'quarterly-vwap',
      indicatorSelected: activeIndicators.includes('quarterly-vwap'),
      ...base,
    }),
  )
  setYearlyVwapLineSeriesVisible(
    bundle.yearlyVwap,
    shouldShowVwapIndicatorSeries({
      indicatorId: 'yearly-vwap',
      indicatorSelected: activeIndicators.includes('yearly-vwap'),
      ...base,
    }),
  )
  setRollingVwapLineSeriesVisible(
    bundle.rollingVwap,
    shouldShowRollingVwapLineSeries(activeIndicators, interval),
  )
}

export function hideAllVwapSeries(bundle: ChartSeriesBundle): void {
  setDailyVwapLineSeriesVisible(bundle.dailyVwap, false)
  setWeeklyVwapLineSeriesVisible(bundle.weeklyVwap, false)
  setMonthlyVwapLineSeriesVisible(bundle.monthlyVwap, false)
  setQuarterlyVwapLineSeriesVisible(bundle.quarterlyVwap, false)
  setYearlyVwapLineSeriesVisible(bundle.yearlyVwap, false)
  setRollingVwapLineSeriesVisible(bundle.rollingVwap, false)
}
