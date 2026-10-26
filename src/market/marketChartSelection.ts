import type { CandleInterval, MarketExchange } from './types.ts'

export type MarketChartSelection = {
  exchange: MarketExchange
  interval: CandleInterval
}

/**
 * Whether picking `next` really changes the chart selection.
 *
 * The candle load effect is keyed on `[exchange, interval]`. Selecting the value
 * that is already active is a no-op for that effect, so reload handlers must not
 * mark the chart as not-ready for it: `chartReady` would never become true again
 * because the effect that sets it back does not re-run. That wedged state tears
 * down the aggregated-liquidations pane and leaves every `chartReady`-gated
 * feature (tools, pointer bindings, indicator presentation) dead until a real
 * interval/exchange change or a reload.
 */
export function isMarketChartSelectionChange(
  current: MarketChartSelection,
  next: Partial<MarketChartSelection>,
): boolean {
  if (next.exchange !== undefined && next.exchange !== current.exchange) return true
  if (next.interval !== undefined && next.interval !== current.interval) return true
  return false
}
