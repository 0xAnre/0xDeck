/**
 * When a liquidation-history walk has to run again.
 *
 * The chart keeps every liquidation event the walk already merged, so a walk is
 * only needed when the pane has *less* coverage than the chart needs: the first
 * load, an exchange/interval change, or a viewport that reached further back.
 * A freshly opened live socket is not a walk trigger: it gap-fills one newest
 * page instead (`fetchAggregatedLiquidationsHistory`, `maxPages: 1`).
 *
 * Without this, every candle-window change restarted the newest-to-oldest walk
 * (Issue #238: 38 `liquidations/history` requests for one page load, the same
 * cursor URLs re-requested 12 pages deep). Pure, so it is unit tested by
 * `npm run test:market`.
 */
import type { CandleInterval } from './types.ts'

export type LiquidationsWalkCoverage = {
  interval: CandleInterval
  /** Oldest event time the completed walk asked for, in epoch milliseconds. */
  oldestTimeMs: number
}

export function shouldStartLiquidationsWalk(params: {
  coverage: LiquidationsWalkCoverage | null
  interval: CandleInterval
  /** Oldest loaded candle time the pane needs covered, in epoch milliseconds. */
  requestedOldestTimeMs: number
}): boolean {
  const { coverage, interval, requestedOldestTimeMs } = params
  if (!coverage) return true
  if (coverage.interval !== interval) return true
  // Equal coverage is enough: the walk already reached this candle's time.
  return requestedOldestTimeMs < coverage.oldestTimeMs
}
