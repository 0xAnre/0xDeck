import { resolveThemeCssColor, rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'

export const RECTANGLE_FILL_SEMANTIC_CSS_VAR = '--muted-foreground'
export const RECTANGLE_FILL_OPACITY = 0.35
export const RECTANGLE_HANDLE_FILL_OPACITY = 0.85

const RECTANGLE_FILL_FALLBACK_RGB = 'rgb(115, 115, 115)'

export function readRectangleFillStyle(): string {
  if (typeof document === 'undefined') {
    return rgbaFromResolvedCssColor(RECTANGLE_FILL_FALLBACK_RGB, RECTANGLE_FILL_OPACITY)
  }

  const token = getComputedStyle(document.documentElement).getPropertyValue(RECTANGLE_FILL_SEMANTIC_CSS_VAR)
  const resolved = resolveThemeCssColor(token, RECTANGLE_FILL_FALLBACK_RGB)
  return rgbaFromResolvedCssColor(resolved, RECTANGLE_FILL_OPACITY)
}

export function readRectangleHandleFillStyle(): string {
  if (typeof document === 'undefined') {
    return rgbaFromResolvedCssColor(RECTANGLE_FILL_FALLBACK_RGB, RECTANGLE_HANDLE_FILL_OPACITY)
  }

  const token = getComputedStyle(document.documentElement).getPropertyValue(RECTANGLE_FILL_SEMANTIC_CSS_VAR)
  const resolved = resolveThemeCssColor(token, RECTANGLE_FILL_FALLBACK_RGB)
  return rgbaFromResolvedCssColor(resolved, RECTANGLE_HANDLE_FILL_OPACITY)
}
