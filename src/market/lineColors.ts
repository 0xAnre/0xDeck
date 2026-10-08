import { resolveThemeCssColor } from '../lib/resolveCssColor.ts'

export const LINE_STROKE_SEMANTIC_CSS_VAR = '--muted-foreground'

const LINE_STROKE_FALLBACK_RGB = 'rgb(113, 113, 122)'

export const LINE_DASH_PATTERN_CSS_PX: readonly number[] = [4, 4]

export const LINE_WIDTH_CSS_PX = 1

export const LINE_HANDLE_FILL_OPACITY = 0.85

export function readLineStrokeStyle(): string {
  if (typeof document === 'undefined') {
    return LINE_STROKE_FALLBACK_RGB
  }
  const token = getComputedStyle(document.documentElement).getPropertyValue(LINE_STROKE_SEMANTIC_CSS_VAR)
  return resolveThemeCssColor(token, LINE_STROKE_FALLBACK_RGB)
}

export function readLineHandleFillStyle(): string {
  return readLineStrokeStyle()
}
