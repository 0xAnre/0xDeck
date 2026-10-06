import { resolveThemeCssColor } from '../lib/resolveCssColor.ts'

/** Semantic token for the SMA 200 overlay (focus ring). */
export const SMA_200_COLOR_VAR = '--ring'

/** Used only when the theme token cannot be parsed. */
export const SMA_200_COLOR_FALLBACK = '#71717a'

export function resolveSma200LineColor(tokenValue: string): string {
  return resolveThemeCssColor(tokenValue, SMA_200_COLOR_FALLBACK)
}
