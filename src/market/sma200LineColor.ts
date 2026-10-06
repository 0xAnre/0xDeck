import { resolveThemeCssColor } from '../lib/resolveCssColor.ts'

/**
 * Semantic token for the SMA 200 overlay.
 * `--sidebar-primary` is saturated in every bundled theme and does not match
 * EMA 13 (`--chart-2`, which equals `--ring`) or the SMA 20/50/100 strokes.
 */
export const SMA_200_COLOR_VAR = '--sidebar-primary'

/** Used only when the theme token cannot be parsed. */
export const SMA_200_COLOR_FALLBACK = '#1447e6'

export function resolveSma200LineColor(tokenValue: string): string {
  return resolveThemeCssColor(tokenValue, SMA_200_COLOR_FALLBACK)
}
