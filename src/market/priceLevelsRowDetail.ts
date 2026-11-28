/**
 * Honest hover summary for one trigger-order price row.
 *
 * A TPSL row can mix two very different order kinds, and the plain sum of
 * `|size|` is **not** a "requested" total:
 *
 *  - a **fixed-size** order (`size !== 0`) requests at most `|size|`;
 *  - a **whole-position** order (`size === 0`) requests nothing of its own — it
 *    closes the position it is attached to, so its amount is `|position_size|`;
 *  - a priced order with `position_size` 0 (or missing) covers nothing and
 *    paints no bar.
 *
 * This module keeps the three apart so the readout can say exactly what the
 * numbers are. It never prints a bare "requested" total that silently counts a
 * whole-position order as zero.
 */
import type { TpslOrder } from './liquidationLevelsProtocol.ts'

export interface TpslRowDetail {
  /** Sum of `|size|` over fixed-size orders — their requested closing size. */
  fixedRequested: number
  fixedCount: number
  /** Orders with `size === 0` (they close the whole position). */
  wholeCount: number
  /** Sum of `|position_size|` over whole-position orders. */
  wholeCovered: number
  /** Sum of the position-covered size of every painted order (bar magnitudes). */
  covered: number
  /** Orders that contribute to the painted bars. */
  coveredCount: number
  /** Priced orders with no covered position (they paint nothing). */
  uncoveredCount: number
}

export const EMPTY_TPSL_ROW_DETAIL: TpslRowDetail = {
  fixedRequested: 0,
  fixedCount: 0,
  wholeCount: 0,
  wholeCovered: 0,
  covered: 0,
  coveredCount: 0,
  uncoveredCount: 0,
}

export function summarizeTpslRowOrders(orders: Iterable<TpslOrder>): TpslRowDetail {
  let fixedRequested = 0
  let fixedCount = 0
  let wholeCount = 0
  let wholeCovered = 0
  let covered = 0
  let coveredCount = 0
  let uncoveredCount = 0
  for (const order of orders) {
    if (!(order.effectiveSize > 0)) {
      // No covered position: it paints nothing and contributes no request; it
      // is reported on its own line instead of distorting the painted totals.
      uncoveredCount += 1
      continue
    }
    covered += order.effectiveSize
    coveredCount += 1
    if (order.size === 0) {
      wholeCount += 1
      wholeCovered += Math.abs(order.positionSize ?? 0)
    } else {
      fixedCount += 1
      fixedRequested += Math.abs(order.size)
    }
  }
  return {
    fixedRequested,
    fixedCount,
    wholeCount,
    wholeCovered,
    covered,
    coveredCount,
    uncoveredCount,
  }
}

function formatBtc(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}

/**
 * Readout lines for one trigger-order row, in fixed-size / whole-position /
 * uncovered order. Empty when the row has nothing to explain.
 */
export function tpslRowDetailLines(detail: TpslRowDetail): string[] {
  const lines: string[] = []
  if (detail.fixedCount > 0) {
    lines.push(
      `Fixed-size orders request ${formatBtc(detail.fixedRequested)} BTC (${detail.fixedCount})`,
    )
  }
  if (detail.wholeCount > 0) {
    lines.push(
      `Whole-position orders close ${formatBtc(detail.wholeCovered)} BTC (${detail.wholeCount})`,
    )
  }
  if (detail.uncoveredCount > 0) {
    lines.push(
      `${detail.uncoveredCount} order${detail.uncoveredCount === 1 ? '' : 's'} with no covered position`,
    )
  }
  return lines
}
