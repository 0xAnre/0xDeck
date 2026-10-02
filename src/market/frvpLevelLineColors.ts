import { resolveThemeCssColor, rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'

/** Market semantic token for the POC level line (theme red / down color). */
export const FRVP_POC_LINE_SEMANTIC_CSS_VAR = '--down'

export const FRVP_POC_LINE_STROKE_OPACITY = 0.85

const FRVP_POC_LINE_FALLBACK_RGB = 'rgb(220, 38, 38)'

export function readFrvpPocLineStrokeStyle(): string {
  if (typeof document === 'undefined') {
    return rgbaFromResolvedCssColor(FRVP_POC_LINE_FALLBACK_RGB, FRVP_POC_LINE_STROKE_OPACITY)
  }

  const token = getComputedStyle(document.documentElement).getPropertyValue(
    FRVP_POC_LINE_SEMANTIC_CSS_VAR,
  )
  const resolved = resolveThemeCssColor(token, FRVP_POC_LINE_FALLBACK_RGB)
  return rgbaFromResolvedCssColor(resolved, FRVP_POC_LINE_STROKE_OPACITY)
}
