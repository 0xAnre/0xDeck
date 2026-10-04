import { resolveThemeCssColor } from '../lib/resolveCssColor.ts'

export const HORIZONTAL_LINE_SEMANTIC_CSS_VAR = '--muted-foreground'

const HORIZONTAL_LINE_FALLBACK_RGB = 'rgb(163, 163, 163)'

export function readHorizontalLineStrokeStyle(): string {
  if (typeof document === 'undefined') {
    return HORIZONTAL_LINE_FALLBACK_RGB
  }

  const token = getComputedStyle(document.documentElement).getPropertyValue(
    HORIZONTAL_LINE_SEMANTIC_CSS_VAR,
  )
  return resolveThemeCssColor(token, HORIZONTAL_LINE_FALLBACK_RGB)
}
