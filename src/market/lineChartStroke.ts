export const LINE_CHART_STROKE_WIDTHS = [1, 2, 3, 4] as const

export type LineChartStrokeWidth = (typeof LINE_CHART_STROKE_WIDTHS)[number]

export const DEFAULT_LINE_CHART_STROKE_WIDTH: LineChartStrokeWidth = 1

export const LINE_CHART_STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const

export type LineChartStrokeStyle = (typeof LINE_CHART_STROKE_STYLES)[number]

export const DEFAULT_LINE_CHART_STROKE_STYLE: LineChartStrokeStyle = 'dashed'

const LINE_WIDTH_SET = new Set<number>(LINE_CHART_STROKE_WIDTHS)
const LINE_STYLE_SET = new Set<string>(LINE_CHART_STROKE_STYLES)

const LINE_HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export function isLineChartHexColor(value: unknown): value is string {
  return typeof value === 'string' && LINE_HEX_COLOR_PATTERN.test(value)
}

export function isLineChartStrokeWidth(value: unknown): value is LineChartStrokeWidth {
  return typeof value === 'number' && Number.isInteger(value) && LINE_WIDTH_SET.has(value)
}

export function isLineChartStrokeStyle(value: unknown): value is LineChartStrokeStyle {
  return typeof value === 'string' && LINE_STYLE_SET.has(value)
}

export function lineChartStrokeDashPattern(style: LineChartStrokeStyle): readonly number[] {
  switch (style) {
    case 'solid':
      return []
    case 'dashed':
      return [6, 4]
    case 'dotted':
      return [2, 3]
    default: {
      const unreachable: never = style
      return unreachable
    }
  }
}
