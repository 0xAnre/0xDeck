import { resolveThemeCssColor } from '../lib/resolveCssColor.ts'

/** Semantic token for the SMA 100 overlay (muted foreground). */
export const SMA_100_COLOR_VAR = '--muted-foreground'

/** Used only when the theme token cannot be parsed. */
export const SMA_100_COLOR_FALLBACK = '#71717a'

export function resolveSma100LineColor(tokenValue: string): string {
  return resolveThemeCssColor(tokenValue, SMA_100_COLOR_FALLBACK)
}
