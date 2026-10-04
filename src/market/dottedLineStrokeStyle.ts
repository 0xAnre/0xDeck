import { resolveThemeCssColor } from '../lib/resolveCssColor.ts'

/** Theme semantic token for gray dotted drawing lines. */
export const DOTTED_LINE_STROKE_SEMANTIC_CSS_VAR = '--muted-foreground'

const DOTTED_LINE_STROKE_FALLBACK_RGB = 'rgb(113, 113, 122)'

/** Lightweight Charts dotted line dash pattern in CSS pixels. */
export const DOTTED_LINE_DASH_PATTERN_CSS_PX: readonly number[] = [4, 4]

export const DOTTED_LINE_WIDTH_CSS_PX = 1

export function readDottedLineStrokeStyle(): string {
  if (typeof document === 'undefined') {
    return DOTTED_LINE_STROKE_FALLBACK_RGB
  }
  const token = getComputedStyle(document.documentElement).getPropertyValue(
    DOTTED_LINE_STROKE_SEMANTIC_CSS_VAR,
  )
  return resolveThemeCssColor(token, DOTTED_LINE_STROKE_FALLBACK_RGB)
}
