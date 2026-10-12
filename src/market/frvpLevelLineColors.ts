import { resolveThemeCssColor, rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'
import { cssColorToHexForColorInput } from './marketIndicatorSeriesColors.ts'

/** Market semantic token for the POC level line (theme red / down color). */
export const FRVP_POC_LINE_SEMANTIC_CSS_VAR = '--down'

export const FRVP_POC_LINE_STROKE_OPACITY = 0.85

const FRVP_POC_LINE_FALLBACK_RGB = 'rgb(220, 38, 38)'

function readFrvpPocLineResolvedRgb(): string {
  if (typeof document === 'undefined') {
    return FRVP_POC_LINE_FALLBACK_RGB
  }

  const token = getComputedStyle(document.documentElement).getPropertyValue(
    FRVP_POC_LINE_SEMANTIC_CSS_VAR,
  )
  return resolveThemeCssColor(token, FRVP_POC_LINE_FALLBACK_RGB)
}

export function readFrvpPocLineStrokeStyle(): string {
  return rgbaFromResolvedCssColor(readFrvpPocLineResolvedRgb(), FRVP_POC_LINE_STROKE_OPACITY)
}

/** Hex value for `<input type="color">` when the instance uses the theme POC color. */
export function readFrvpPocLineColorInputHex(): string {
  return cssColorToHexForColorInput(readFrvpPocLineResolvedRgb())
}
