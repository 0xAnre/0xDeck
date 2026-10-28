import { LineStyle } from 'lightweight-charts'

export const LINE_CHART_STROKE_WIDTHS = [1, 2, 3, 4] as const

export type LineChartStrokeWidth = (typeof LINE_CHART_STROKE_WIDTHS)[number]

export const DEFAULT_LINE_CHART_STROKE_WIDTH: LineChartStrokeWidth = 1

/** Only `Line` (solid) and `Dot` (dotted) are selectable. */
export const LINE_CHART_STROKE_STYLES = ['solid', 'dotted'] as const

export type LineChartStrokeStyle = (typeof LINE_CHART_STROKE_STYLES)[number]

export const DEFAULT_LINE_CHART_STROKE_STYLE: LineChartStrokeStyle = 'solid'

export const LINE_CHART_STROKE_STYLE_LABELS: Record<LineChartStrokeStyle, string> = {
  solid: 'Line',
  dotted: 'Dot',
}

/** The only `solid | dotted` → Lightweight Charts `LineStyle` mapping in `src/`. */
export function lineChartStrokeStyleToChartLineStyle(style: LineChartStrokeStyle): LineStyle {
  switch (style) {
    case 'solid':
      return LineStyle.Solid
    case 'dotted':
      return LineStyle.Dotted
    default: {
      const unreachable: never = style
      return unreachable
    }
  }
}

/** Legacy persisted style value that is no longer selectable. */
export const LEGACY_LINE_CHART_STROKE_STYLE_DASHED = 'dashed'

const LINE_WIDTH_SET = new Set<number>(LINE_CHART_STROKE_WIDTHS)
const LINE_STYLE_SET = new Set<string>(LINE_CHART_STROKE_STYLES)

const LINE_HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export function isLineChartHexColor(value: unknown): value is string {
  return typeof value === 'string' && LINE_HEX_COLOR_PATTERN.test(value)
}

export function isLineChartStrokeWidth(value: unknown): value is LineChartStrokeWidth {
  return typeof value === 'number' && Number.isInteger(value) && LINE_WIDTH_SET.has(value)
}

/** True only for currently selectable styles (`solid`, `dotted`). */
export function isLineChartStrokeStyle(value: unknown): value is LineChartStrokeStyle {
  return typeof value === 'string' && LINE_STYLE_SET.has(value)
}

/**
 * Sanitize a persisted style, migrating the retired `dashed` value to
 * `solid`. Returns `undefined` for anything that is not a style.
 */
export function sanitizeLineChartStrokeStyle(value: unknown): LineChartStrokeStyle | undefined {
  if (value === LEGACY_LINE_CHART_STROKE_STYLE_DASHED) return 'solid'
  return isLineChartStrokeStyle(value) ? value : undefined
}

export function lineChartStrokeDashPattern(style: LineChartStrokeStyle): readonly number[] {
  switch (style) {
    case 'dotted':
      return [2, 3]
    default:
      // `dashed` is migrated to `solid` by sanitizeLineChartStrokeStyle; any
      // unsanitized legacy value must still render as a solid line.
      return []
  }
}
