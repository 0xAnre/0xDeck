import type { LogicalRange } from 'lightweight-charts'

/** Minimum bars requested from daily/weekly context endpoints (backend mirrors this). */
export const MARKET_CHART_MIN_INITIAL_HISTORY_BARS = 500

/** Bars shown on first load and after timeframe change. */
export const MARKET_CHART_INITIAL_VISIBLE_BARS = 120

/**
 * Logical range for the last `visibleBars` candles when history exceeds that count;
 * otherwise show the full series. Returns null when there is no data.
 */
export function computeInitialVisibleLogicalRange(
  barCount: number,
  visibleBars: number = MARKET_CHART_INITIAL_VISIBLE_BARS,
): LogicalRange | null {
  if (barCount <= 0) return null
  if (barCount <= visibleBars) {
    return { from: 0, to: barCount - 1 } as LogicalRange
  }
  const from = barCount - visibleBars
  const to = barCount - 1
  return { from, to } as LogicalRange
}
