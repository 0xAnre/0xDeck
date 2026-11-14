/**
 * Anchored two-axis scaling math for the candle-pane right-drag gesture.
 *
 * Pure module: no DOM, no chart API, no storage. The pointer lifecycle lives in
 * `rightDragChartScalingPointer.ts`; this half only turns a pointer delta into
 * finite, bounded time/price ranges that keep the pressed chart point at the
 * same screen position.
 *
 * Direction contract (mirrors Issue #236):
 * - horizontal: drag right → fewer/wider bars (span factor < 1),
 *   drag left → more/narrower bars (span factor > 1);
 * - vertical: drag up → smaller/taller price span (factor < 1),
 *   drag down → larger/shorter price span (factor > 1).
 *
 * One axis never leaks into the other: a zero delta produces exactly `1`.
 */

export type RightDragChartRange = { from: number; to: number }

/**
 * Pointer travel that doubles or halves a visible span. Exponential scaling
 * makes the gesture symmetric (drag back returns to the initial range) and
 * keeps the factor finite for any delta before clamping.
 */
export const RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE = 160

/** Bounds for one gesture's cumulative span factor, relative to its start range. */
export const RIGHT_DRAG_MIN_SPAN_FACTOR = 1 / 64
export const RIGHT_DRAG_MAX_SPAN_FACTOR = 64

/** Absolute floors so a range can never collapse to zero width. */
export const RIGHT_DRAG_MIN_TIME_SPAN_BARS = 2
export const RIGHT_DRAG_MIN_PRICE_SPAN = 1e-8

export type RightDragSpanFactors = {
  time: number
  price: number
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** A range that can be scaled: finite endpoints and a positive, non-inverted span. */
export function isValidRightDragRange(
  range: { from: number; to: number } | null | undefined,
): range is RightDragChartRange {
  if (!range) return false
  return (
    isFiniteNumber(range.from) &&
    isFiniteNumber(range.to) &&
    range.from < range.to
  )
}

/**
 * Clamp a raw span factor into the documented gesture bounds. `0` is the
 * underflow of an extreme zoom-in and maps to the minimum factor; `Infinity`
 * is an extreme zoom-out and maps to the maximum. `NaN`, negative and other
 * unusable factors fall back to `1` (no change), so a caller can never apply
 * an inverted, zero or unbounded range.
 */
export function clampRightDragSpanFactor(factor: number): number {
  if (Number.isNaN(factor)) return 1
  // `2 ** -N` underflows to 0 and `2 ** N` overflows to Infinity for extreme
  // deltas; map those to the documented gesture bounds instead of "no change".
  if (factor === 0) return RIGHT_DRAG_MIN_SPAN_FACTOR
  if (!Number.isFinite(factor)) return RIGHT_DRAG_MAX_SPAN_FACTOR
  if (factor < 0) return 1
  return Math.min(
    RIGHT_DRAG_MAX_SPAN_FACTOR,
    Math.max(RIGHT_DRAG_MIN_SPAN_FACTOR, factor),
  )
}

/**
 * Map a pointer delta from the press point to independent time/price span
 * factors. `deltaX > 0` (drag right) shrinks the logical span; `deltaY < 0`
 * (drag up) shrinks the price span. Non-finite deltas are treated as `0`.
 */
export function resolveRightDragSpanFactors(
  deltaX: number,
  deltaY: number,
): RightDragSpanFactors {
  const dx = isFiniteNumber(deltaX) ? deltaX : 0
  const dy = isFiniteNumber(deltaY) ? deltaY : 0
  return {
    time: clampRightDragSpanFactor(
      2 ** (-dx / RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE),
    ),
    price: clampRightDragSpanFactor(
      2 ** (dy / RIGHT_DRAG_SCALE_PIXELS_PER_OCTAVE),
    ),
  }
}

/**
 * Scale `range` by `factor` around `anchor`, preserving the anchor's fractional
 * position inside the range — which is what keeps the pressed chart point at
 * the same screen coordinate. Returns `null` when the input is unusable, so a
 * caller never applies a `NaN`, infinite, zero-width or inverted range.
 */
export function scaleRangeAroundAnchor(
  range: { from: number; to: number },
  anchor: number,
  factor: number,
  minimumSpan = 0,
): RightDragChartRange | null {
  if (!isValidRightDragRange(range)) return null
  if (!isFiniteNumber(anchor)) return null
  if (!isFiniteNumber(factor) || factor <= 0) return null

  const span = range.to - range.from
  const anchorFraction = (anchor - range.from) / span
  if (!isFiniteNumber(anchorFraction)) return null

  const minSpan = isFiniteNumber(minimumSpan) && minimumSpan > 0 ? minimumSpan : 0
  const nextSpan = Math.max(
    span * clampRightDragSpanFactor(factor),
    minSpan,
    Number.EPSILON,
  )
  if (!isFiniteNumber(nextSpan) || nextSpan <= 0) return null

  const from = anchor - anchorFraction * nextSpan
  const to = from + nextSpan
  if (!isFiniteNumber(from) || !isFiniteNumber(to) || from >= to) return null
  return { from, to }
}

/** Logical-time half of the gesture (logical bar indices). */
export function scaleLogicalRangeAroundAnchor(
  range: { from: number; to: number },
  anchorLogical: number,
  factor: number,
  minimumSpanBars = RIGHT_DRAG_MIN_TIME_SPAN_BARS,
): RightDragChartRange | null {
  return scaleRangeAroundAnchor(range, anchorLogical, factor, minimumSpanBars)
}

/** Candle-price half of the gesture (price units on the pane's right scale). */
export function scalePriceRangeAroundAnchor(
  range: { from: number; to: number },
  anchorPrice: number,
  factor: number,
  minimumSpan = RIGHT_DRAG_MIN_PRICE_SPAN,
): RightDragChartRange | null {
  return scaleRangeAroundAnchor(range, anchorPrice, factor, minimumSpan)
}

/** Fractional position of `anchor` inside `range`; used by tests and callers. */
export function anchorFractionOfRange(
  range: { from: number; to: number },
  anchor: number,
): number | null {
  if (!isValidRightDragRange(range) || !isFiniteNumber(anchor)) return null
  const span = range.to - range.from
  const fraction = (anchor - range.from) / span
  return isFiniteNumber(fraction) ? fraction : null
}
