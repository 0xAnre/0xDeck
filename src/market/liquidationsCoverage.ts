/**
 * When a liquidation-history walk has to run again.
 *
 * The chart keeps every liquidation event the walk already merged, so a walk is
 * only needed when the pane has *less* coverage than the chart needs: the first
 * load, an exchange/interval change, or a viewport that reached further back.
 * A freshly opened live socket is not a walk trigger: it gap-fills the range
 * between the newest stored event and the newest buffered one instead
 * (`fillAggregatedLiquidationsGap`, bounded by
 * `AGGREGATED_LIQUIDATIONS_HISTORY_MAX_PAGES` so a long disconnect is filled
 * rather than cut at one page).
 *
 * Without this, every candle-window change restarted the newest-to-oldest walk
 * (Issue #238: 38 `liquidations/history` requests for one page load, the same
 * cursor URLs re-requested 12 pages deep). Pure, so it is unit tested by
 * `npm run test:market`.
 */
import type { AggregatedLiquidationEvent } from './aggregatedLiquidations.ts'
import { describeAggregatedLiquidationsEventNotice } from './aggregatedLiquidationsBuckets.ts'
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

/** A socket-open gap fill: the events it read and whether it hit the page cap. */
export type LiquidationsGapFill = {
  events: readonly AggregatedLiquidationEvent[]
  /** The fill stopped at `AGGREGATED_LIQUIDATIONS_HISTORY_MAX_PAGES`. */
  truncated: boolean
}

export type LiquidationsGapFillOutcome = {
  coverage: LiquidationsWalkCoverage | null
  notice: { interval: CandleInterval; message: string } | null
}

/**
 * What a gap fill leaves behind, so the panel holds no branch of its own.
 *
 * A truncated fill stopped at the page cap before reaching the newest buffered
 * event, so the middle of the pane stays empty: the coverage record is dropped
 * (the next window change walks again) *and* the gap is reported, because
 * dropping the record alone left the hole silent until the user happened to pan
 * or zoom (#239 third review, NIT-1). A complete fill changes neither.
 */
export function applyLiquidationsGapFill(params: {
  interval: CandleInterval
  coverage: LiquidationsWalkCoverage | null
  fill: LiquidationsGapFill
}): LiquidationsGapFillOutcome {
  if (!params.fill.truncated) {
    return { coverage: params.coverage, notice: null }
  }
  const message = describeAggregatedLiquidationsEventNotice(
    params.fill.events,
    true,
  )
  return {
    coverage: null,
    notice: message === null ? null : { interval: params.interval, message },
  }
}
