/**
 * Which indicator series are allowed to be derived from the loaded candle
 * window.
 *
 * Every history page, VWAP-context merge, and live tick used to recompute *all*
 * EMA and session-VWAP series even when their indicator was off, so a 500-bar
 * page paid for ~10 hidden full-history passes plus ~11 native `setData`
 * calls. The plan keeps that work to the series the panel can actually paint.
 *
 * Rules mirror the visibility rules:
 * - `triple-ema` / `dual-ema` are shown purely from the indicator selection
 *   (`chartEmaIndicatorSeriesVisibility`).
 * - the five session VWAPs are shown only when selected *and* supported on the
 *   current interval (`shouldShowVwapIndicatorSeries`). The loaded VWAP context
 *   level is deliberately **not** part of the plan: a plan that depended on it
 *   would leave a just-activated VWAP series empty between the activation and
 *   the context response, and every context change already re-applies history.
 *
 * RSI is not part of the plan: its pane only exists while the indicator is
 * enabled (`bundle.rsi === null` otherwise), which already gates both its
 * history and live derivation.
 */

import { isIndicatorSupportedOnInterval, type MarketIndicatorId } from './indicators.ts'
import type { CandleInterval } from './types.ts'

export const CHART_INDICATOR_SERIES_KEYS = [
  'triple-ema',
  'dual-ema',
  'daily-vwap',
  'weekly-vwap',
  'monthly-vwap',
  'quarterly-vwap',
  'yearly-vwap',
] as const

export type ChartIndicatorSeriesKey = (typeof CHART_INDICATOR_SERIES_KEYS)[number]

/** Per-indicator switch: `true` means "derive and push this series' data". */
export type ChartIndicatorSeriesPlan = Readonly<Record<ChartIndicatorSeriesKey, boolean>>

/**
 * Derive every series. Used as the default by the history/live appliers and by
 * callers that have no indicator selection to consult (tests, isolated charts),
 * so their behavior is unchanged.
 */
export const FULL_CHART_INDICATOR_SERIES_PLAN: ChartIndicatorSeriesPlan = {
  'triple-ema': true,
  'dual-ema': true,
  'daily-vwap': true,
  'weekly-vwap': true,
  'monthly-vwap': true,
  'quarterly-vwap': true,
  'yearly-vwap': true,
}

export const EMPTY_CHART_INDICATOR_SERIES_PLAN: ChartIndicatorSeriesPlan = {
  'triple-ema': false,
  'dual-ema': false,
  'daily-vwap': false,
  'weekly-vwap': false,
  'monthly-vwap': false,
  'quarterly-vwap': false,
  'yearly-vwap': false,
}

function seriesPlannedForIndicator(
  indicatorId: ChartIndicatorSeriesKey,
  active: ReadonlySet<MarketIndicatorId>,
  interval: CandleInterval,
): boolean {
  if (!active.has(indicatorId)) return false
  if (indicatorId === 'triple-ema' || indicatorId === 'dual-ema') return true
  return isIndicatorSupportedOnInterval(indicatorId, interval)
}

/** Plan for one panel state: its active indicators on its current interval. */
export function resolveChartIndicatorSeriesPlan(params: {
  activeIndicators: readonly MarketIndicatorId[]
  interval: CandleInterval
}): ChartIndicatorSeriesPlan {
  const active = new Set(params.activeIndicators)
  const plan = {} as Record<ChartIndicatorSeriesKey, boolean>
  for (const key of CHART_INDICATOR_SERIES_KEYS) {
    plan[key] = seriesPlannedForIndicator(key, active, params.interval)
  }
  return plan
}

/** Planned keys in a stable order (independent of the object's key order). */
export function plannedChartIndicatorSeries(
  plan: ChartIndicatorSeriesPlan,
): ChartIndicatorSeriesKey[] {
  return CHART_INDICATOR_SERIES_KEYS.filter((key) => plan[key])
}
