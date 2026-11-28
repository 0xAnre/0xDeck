/**
 * Geometry for the liquidation ladder.
 *
 * Both sides are drawn on one shared leftward scale: every bar — red (short) or
 * green (long) — is right-aligned on the price axis and extends left with the
 * same pixels-per-unit, so equal sizes look equal on either side and a longer
 * bar always means more size at that price.
 *
 * Kept free of canvas and DOM access so the directional contract can be tested
 * directly (see `geometry.test.ts`).
 */

export interface Layout {
  width: number
  height: number
  plotTop: number
  plotBottom: number
  /** Centre of the price-label gutter. */
  spine: number
  /** Width of the price-label gutter. */
  gutter: number
  /** Right edge of every bar: both sides grow left from here. */
  anchor: number
  /** Widest possible bar (from the anchor to the left padding). */
  maxBarWidth: number
}

const PAD_X = 14
const PAD_TOP = 26
const PAD_BOTTOM = 12
const GUTTER = 86

export function computeLayout(width: number, height: number): Layout {
  const plotTop = PAD_TOP
  const plotBottom = Math.max(plotTop + 40, height - PAD_BOTTOM)
  const spine = width / 2
  const anchor = spine - GUTTER / 2
  const maxBarWidth = Math.max(16, anchor - PAD_X)
  return {
    width,
    height,
    plotTop,
    plotBottom,
    spine,
    gutter: GUTTER,
    anchor,
    maxBarWidth,
  }
}

export interface RowMagnitudes {
  /** Absolute long size at this row. */
  long: number
  /** Absolute short size at this row. */
  short: number
}

export interface BarSegment {
  side: 'long' | 'short'
  value: number
  /** Drawn width in CSS px. */
  width: number
  /** Left edge in CSS px. The right edge is always `layout.anchor`. */
  x: number
}

/** Shared scale: the largest finite single-side row magnitude in view. */
export function scaleDomain(maxLong: number, maxShort: number): number {
  const safeLong = Number.isFinite(maxLong) && maxLong > 0 ? maxLong : 0
  const safeShort = Number.isFinite(maxShort) && maxShort > 0 ? maxShort : 0
  return Math.max(safeLong, safeShort)
}

export function barWidth(
  value: number,
  domain: number,
  maxBarWidth: number,
): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  if (!Number.isFinite(domain) || domain <= 0) return 0
  return Math.max(1, (value / domain) * maxBarWidth)
}

/**
 * Segments to paint for one row, longest first, so the shorter side paints on
 * top of the longer one and both extents stay readable from the anchor.
 *
 * A row only holds both sides when the visible price window is wide enough for
 * one pixel row to span both the long and short clusters; at the default framing
 * every row is single-sided.
 */
export function barSegments(
  row: RowMagnitudes,
  domain: number,
  layout: Layout,
): BarSegment[] {
  const segments: BarSegment[] = []
  if (row.long > 0) {
    segments.push({ side: 'long', value: row.long, width: 0, x: 0 })
  }
  if (row.short > 0) {
    segments.push({ side: 'short', value: row.short, width: 0, x: 0 })
  }
  for (const segment of segments) {
    segment.width = barWidth(segment.value, domain, layout.maxBarWidth)
    segment.x = layout.anchor - segment.width
  }
  segments.sort((a, b) => b.width - a.width)
  return segments
}

/**
 * Hover hit area: the bar region and its price gutter. The space right of the
 * gutter carries no bars, so pointing there must not pretend to read a level.
 */
export function isInBarArea(layout: Layout, x: number): boolean {
  return (
    x <= layout.spine + layout.gutter / 2 &&
    x >= layout.anchor - layout.maxBarWidth - 8
  )
}

export interface TooltipInput {
  cursorX: number
  cursorY: number
  tooltipWidth: number
  tooltipHeight: number
  plotWidth: number
  plotHeight: number
  layout: Layout
}

/**
 * Place the tooltip right of the price gutter so it never covers the bars it is
 * describing, and keep it inside the plot. On a plot too narrow for that it
 * falls back to the rightmost position that still fits.
 */
export function placeTooltip(input: TooltipInput): {
  left: number
  top: number
} {
  const {
    cursorY,
    tooltipWidth,
    tooltipHeight,
    plotWidth,
    plotHeight,
    layout,
  } = input
  const margin = 8
  const gutterRight = layout.spine + layout.gutter / 2
  const maxLeft = Math.max(margin, plotWidth - tooltipWidth - margin)
  const left = Math.min(Math.max(gutterRight + 12, margin), maxLeft)
  const maxTop = Math.max(margin, plotHeight - tooltipHeight - margin)
  const top = Math.min(Math.max(cursorY - tooltipHeight / 2, margin), maxTop)
  return { left, top }
}
