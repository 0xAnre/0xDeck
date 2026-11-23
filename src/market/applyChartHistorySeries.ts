import type { UTCTimestamp } from 'lightweight-charts'
import type { ChartSeriesBundle } from './applyChartLiveCandle.ts'
import { applyAnchoredVwapDrawingInstancesHistory } from './anchoredVwapDrawingChartInstances.ts'
import type { AnchoredVwapInstance } from './anchoredVwapInstances.ts'
import { applyRollingVwapInstancesHistory } from './rollingVwapChartInstances.ts'
import type { RollingVwapInstance } from './rollingVwapInstances.ts'
import { computeDailyVwap } from './dailyVwap.ts'
import { setDailyVwapLineSeriesData } from './dailyVwapChartSeries.ts'
import { computeMonthlyVwap } from './monthlyVwap.ts'
import { setMonthlyVwapLineSeriesData } from './monthlyVwapChartSeries.ts'
import { computeQuarterlyVwap } from './quarterlyVwap.ts'
import { setQuarterlyVwapLineSeriesData } from './quarterlyVwapChartSeries.ts'
import { computeWeeklyVwap } from './weeklyVwap.ts'
import { setWeeklyVwapLineSeriesData } from './weeklyVwapChartSeries.ts'
import { computeYearlyVwap } from './yearlyVwap.ts'
import { setYearlyVwapLineSeriesData } from './yearlyVwapChartSeries.ts'
import {
  CHART_INDICATOR_SERIES_KEYS,
  FULL_CHART_INDICATOR_SERIES_PLAN,
  plannedChartIndicatorSeries,
  type ChartIndicatorSeriesKey,
  type ChartIndicatorSeriesPlan,
} from './chartIndicatorSeriesPlan.ts'
import { setDualEmaHistoryData } from './chartDualEmaSeries.ts'
import { computeEmaLine, EMA_PERIODS } from './ema.ts'
import { setRsiPaneHistoryData } from './rsiChartPane.ts'
import type { MarketCandle } from './types.ts'

function toCandlestickPoint(candle: MarketCandle) {
  return {
    time: candle.time as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
  }
}

function setTripleEmaHistoryData(bundle: ChartSeriesBundle, candles: readonly MarketCandle[]): void {
  EMA_PERIODS.forEach((period, index) => {
    const line = computeEmaLine([...candles], period)
    bundle.emas[index].setData(
      line.map((point) => ({
        time: point.time as UTCTimestamp,
        value: point.value,
      })),
    )
  })
}

/** Derive and push exactly one indicator's series from the merged history. */
function applyChartIndicatorSeriesKey(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  key: ChartIndicatorSeriesKey,
): void {
  switch (key) {
    case 'triple-ema':
      setTripleEmaHistoryData(bundle, candles)
      return
    case 'dual-ema':
      setDualEmaHistoryData(bundle.ema100, bundle.ema200, candles)
      return
    case 'daily-vwap':
      setDailyVwapLineSeriesData(bundle.dailyVwap, computeDailyVwap(candles))
      return
    case 'weekly-vwap':
      setWeeklyVwapLineSeriesData(bundle.weeklyVwap, computeWeeklyVwap(candles))
      return
    case 'monthly-vwap':
      setMonthlyVwapLineSeriesData(bundle.monthlyVwap, computeMonthlyVwap(candles))
      return
    case 'quarterly-vwap':
      setQuarterlyVwapLineSeriesData(bundle.quarterlyVwap, computeQuarterlyVwap(candles))
      return
    case 'yearly-vwap':
      setYearlyVwapLineSeriesData(bundle.yearlyVwap, computeYearlyVwap(candles))
      return
    default: {
      const unreachable: never = key
      return unreachable
    }
  }
}

/**
 * Which indicator series of this bundle currently hold data derived from the
 * exact candles last handed to {@link applyChartHistorySeries} (plus the live
 * last-point updates that followed it).
 *
 * The set lets activation hydrate only the series that are actually missing, so
 * enabling an indicator after history loaded immediately paints the same line a
 * full re-apply would, without recomputing the indicators that stayed on.
 */
const appliedIndicatorSeriesByBundle = new WeakMap<
  ChartSeriesBundle,
  Set<ChartIndicatorSeriesKey>
>()

function appliedIndicatorSeries(bundle: ChartSeriesBundle): Set<ChartIndicatorSeriesKey> {
  let applied = appliedIndicatorSeriesByBundle.get(bundle)
  if (!applied) {
    applied = new Set<ChartIndicatorSeriesKey>()
    appliedIndicatorSeriesByBundle.set(bundle, applied)
  }
  return applied
}

function markChartIndicatorSeriesApplied(
  bundle: ChartSeriesBundle,
  keys: readonly ChartIndicatorSeriesKey[],
): void {
  appliedIndicatorSeriesByBundle.set(bundle, new Set(keys))
}

/**
 * Forget what this bundle's series hold, e.g. after the chart cleared every
 * series for a new interval/exchange. Never needed for a fresh bundle.
 */
export function resetChartIndicatorSeriesApplication(bundle: ChartSeriesBundle): void {
  appliedIndicatorSeriesByBundle.delete(bundle)
}

/** The indicator series currently holding data derived from the loaded candles. */
export function appliedChartIndicatorSeries(
  bundle: ChartSeriesBundle,
): readonly ChartIndicatorSeriesKey[] {
  const applied = appliedIndicatorSeriesByBundle.get(bundle)
  return applied ? CHART_INDICATOR_SERIES_KEYS.filter((key) => applied.has(key)) : []
}

/**
 * Derive and push only the planned indicator series, then record them as
 * applied. Series whose indicator is off keep their previous (hidden) data.
 */
export function applyPlannedChartIndicatorSeries(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  plan: ChartIndicatorSeriesPlan,
): readonly ChartIndicatorSeriesKey[] {
  const planned = plannedChartIndicatorSeries(plan)
  for (const key of planned) {
    applyChartIndicatorSeriesKey(bundle, candles, key)
  }
  markChartIndicatorSeriesApplied(bundle, planned)
  return planned
}

/** Drop series that are no longer planned, so re-enabling them hydrates them. */
export function retainPlannedChartIndicatorSeries(
  bundle: ChartSeriesBundle,
  plan: ChartIndicatorSeriesPlan,
): void {
  const applied = appliedIndicatorSeriesByBundle.get(bundle)
  if (!applied) return
  for (const key of [...applied]) {
    if (!plan[key]) applied.delete(key)
  }
}

/**
 * Hydrate the planned series that are missing data, e.g. an indicator that was
 * just switched on after history loaded. Returns the hydrated keys (empty when
 * nothing was missing). Series that are already applied are not recomputed.
 */
export function hydratePlannedChartIndicatorSeries(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  plan: ChartIndicatorSeriesPlan,
): readonly ChartIndicatorSeriesKey[] {
  const applied = appliedIndicatorSeries(bundle)
  const missing = plannedChartIndicatorSeries(plan).filter((key) => !applied.has(key))
  if (missing.length === 0) return []
  for (const key of missing) {
    applyChartIndicatorSeriesKey(bundle, candles, key)
    applied.add(key)
  }
  return missing
}

/**
 * Replace candle, indicator, and VWAP series from merged history (no fitContent).
 *
 * `plan` limits indicator derivation to the series this panel shows; without it
 * every indicator series is rebuilt, which is what isolated callers/tests and
 * the pre-plan behavior expect.
 */
export function applyChartHistorySeries(
  bundle: ChartSeriesBundle,
  candles: readonly MarketCandle[],
  rollingVwapInstances: readonly RollingVwapInstance[] = [],
  anchoredVwapInstances: readonly AnchoredVwapInstance[] = [],
  plan: ChartIndicatorSeriesPlan = FULL_CHART_INDICATOR_SERIES_PLAN,
): void {
  bundle.candle.setData(candles.map(toCandlestickPoint))
  applyPlannedChartIndicatorSeries(bundle, candles, plan)
  applyRollingVwapInstancesHistory(bundle, candles, rollingVwapInstances)
  applyAnchoredVwapDrawingInstancesHistory(bundle, candles, anchoredVwapInstances)
  if (bundle.rsi) {
    setRsiPaneHistoryData(bundle.rsi, candles)
  }
}
