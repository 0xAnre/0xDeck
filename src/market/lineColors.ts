import { MARKET_STYLE_DEFAULTS, marketStyleColorWithOpacity } from './marketStylePalette.ts'
import { isLineChartHexColor } from './lineChartStroke.ts'
import { lineInstanceStrokeOpacityPercent } from './lineInstances.ts'

/** Line tool defaults: palette primary line (`light`) at 100%. */
export const LINE_DEFAULT_STROKE_COLOR = MARKET_STYLE_DEFAULTS.primaryLine.color
export const LINE_DEFAULT_STROKE_OPACITY_PERCENT = MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent

export const LINE_DASH_PATTERN_CSS_PX: readonly number[] = [4, 4]

export const LINE_WIDTH_CSS_PX = 1

export const LINE_HANDLE_FILL_OPACITY = 0.85

/** Palette primary line color at its default opacity. */
export function readLineStrokeStyle(): string {
  return marketStyleColorWithOpacity(
    LINE_DEFAULT_STROKE_COLOR,
    LINE_DEFAULT_STROKE_OPACITY_PERCENT,
  )
}

export function readLineHandleFillStyle(): string {
  return readLineStrokeStyle()
}

/** Hex value for the shared color picker. */
export function readLineStrokeColorHexForInstance(instance: { strokeColor?: string }): string {
  return isLineChartHexColor(instance.strokeColor) ? instance.strokeColor : LINE_DEFAULT_STROKE_COLOR
}

/** Instance stroke with its own opacity folded in (canvas + LWC safe). */
export function readLineStrokeStyleForInstance(
  instance: { strokeColor?: string; strokeOpacity?: number },
  fallback: string = readLineStrokeStyle(),
): string {
  const color = isLineChartHexColor(instance.strokeColor) ? instance.strokeColor : fallback
  return marketStyleColorWithOpacity(color, lineInstanceStrokeOpacityPercent(instance))
}
