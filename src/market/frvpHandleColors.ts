import { rgbaFromResolvedCssColor, resolveThemeCssColor } from '../lib/resolveCssColor.ts'

export const FRVP_HANDLE_FILL_SEMANTIC_CSS_VAR = '--muted-foreground'
export const FRVP_HANDLE_STROKE_SEMANTIC_CSS_VAR = '--border'
export const FRVP_HANDLE_FILL_OPACITY = 0.85
export const FRVP_HANDLE_STROKE_OPACITY = 0.95

const FRVP_HANDLE_FILL_FALLBACK_RGB = 'rgb(115, 115, 115)'
const FRVP_HANDLE_STROKE_FALLBACK_RGB = 'rgb(229, 229, 229)'

export function readFrvpHandleThemeBaseRgb(): string {
  if (typeof document === 'undefined') {
    return FRVP_HANDLE_FILL_FALLBACK_RGB
  }
  const token = getComputedStyle(document.documentElement).getPropertyValue(
    FRVP_HANDLE_FILL_SEMANTIC_CSS_VAR,
  )
  return resolveThemeCssColor(token, FRVP_HANDLE_FILL_FALLBACK_RGB)
}

export function readFrvpHandleFillStyle(): string {
  return rgbaFromResolvedCssColor(readFrvpHandleThemeBaseRgb(), FRVP_HANDLE_FILL_OPACITY)
}

export function readFrvpHandleStrokeStyle(): string {
  if (typeof document === 'undefined') {
    return rgbaFromResolvedCssColor(FRVP_HANDLE_STROKE_FALLBACK_RGB, FRVP_HANDLE_STROKE_OPACITY)
  }
  const token = getComputedStyle(document.documentElement).getPropertyValue(
    FRVP_HANDLE_STROKE_SEMANTIC_CSS_VAR,
  )
  const rgb = resolveThemeCssColor(token, FRVP_HANDLE_STROKE_FALLBACK_RGB)
  return rgbaFromResolvedCssColor(rgb, FRVP_HANDLE_STROKE_OPACITY)
}
