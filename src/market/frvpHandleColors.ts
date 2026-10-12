import { rgbaFromResolvedCssColor, resolveThemeCssColor } from '../lib/resolveCssColor.ts'

export const FRVP_HANDLE_FILL_SEMANTIC_CSS_VAR = '--muted-foreground'
export const FRVP_HANDLE_FILL_OPACITY = 0.85

const FRVP_HANDLE_FILL_FALLBACK_RGB = 'rgb(115, 115, 115)'

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
