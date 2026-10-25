import { rgbaFromResolvedCssColor } from '../lib/resolveCssColor.ts'

/**
 * Single source of truth for BTC Perp tool/indicator styling.
 *
 * The palette is intentionally neutral grayscale — with the single
 * `pocRed` accent — so the same defaults stay legible on every theme; theme
 * tokens keep driving chart text/background and candle colors. Never
 * re-declare these hex literals anywhere else — import from here instead.
 */
export const MARKET_STYLE_PALETTE = {
  light: '#D4D4D4',
  medium: '#A3A3A3',
  dark: '#737373',
  subtle: '#525252',
  /** FRVP point-of-control accent; the only non-neutral palette color. */
  pocRed: '#D15F5B',
} as const

export type MarketStylePaletteColor = keyof typeof MARKET_STYLE_PALETTE

/** Default opacity percentages per style role (0–100). */
export const MARKET_STYLE_OPACITY_PERCENT = {
  /** Primary lines (line tool, indicator/VWAP center lines). */
  full: 100,
  /** Secondary lines, bands and levels. */
  secondary: 70,
  /** Fills and backgrounds. */
  fill: 25,
} as const

export type MarketStyleRole = 'primaryLine' | 'secondaryLine' | 'fill'

export type MarketStyleDefault = {
  color: string
  opacityPercent: number
}

/** Default style descriptor per role. Fresh object per call site read. */
export const MARKET_STYLE_DEFAULTS: Record<MarketStyleRole, MarketStyleDefault> = {
  primaryLine: {
    color: MARKET_STYLE_PALETTE.light,
    opacityPercent: MARKET_STYLE_OPACITY_PERCENT.full,
  },
  secondaryLine: {
    color: MARKET_STYLE_PALETTE.medium,
    opacityPercent: MARKET_STYLE_OPACITY_PERCENT.secondary,
  },
  fill: {
    color: MARKET_STYLE_PALETTE.medium,
    opacityPercent: MARKET_STYLE_OPACITY_PERCENT.fill,
  },
}

export function marketStyleRoleDefault(role: MarketStyleRole): MarketStyleDefault {
  return { ...MARKET_STYLE_DEFAULTS[role] }
}

/** Distinct grayscale shades for multi-line indicator defaults (3-EMA: light → dark). */
export const MARKET_STYLE_MULTI_LINE_SHADES: readonly string[] = [
  MARKET_STYLE_PALETTE.light,
  MARKET_STYLE_PALETTE.medium,
  MARKET_STYLE_PALETTE.dark,
]

/** Distinct grayscale shades for two-line indicator defaults (2-EMA: medium, dark). */
export const MARKET_STYLE_DUAL_LINE_SHADES: readonly string[] = [
  MARKET_STYLE_PALETTE.medium,
  MARKET_STYLE_PALETTE.dark,
]

/** Distinct grayscale shades for rolling VWAP deviation bands 1–3. */
export const MARKET_STYLE_ROLLING_BAND_SHADES: readonly string[] = [
  MARKET_STYLE_PALETTE.subtle,
  MARKET_STYLE_PALETTE.medium,
  MARKET_STYLE_PALETTE.dark,
]

export function marketStyleShade(
  shades: readonly string[],
  index: number,
  fallback: string = MARKET_STYLE_PALETTE.medium,
): string {
  return shades[index] ?? fallback
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

export function isMarketStyleHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
}

/**
 * Opacity percentage type guard shared by every style payload (0–100,
 * inclusive). Non-integers are accepted so older stored values round-trip.
 */
export function isMarketStyleOpacityPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

/** Clamp an opacity percentage into 0–100 (non-finite input falls back to 100). */
export function clampMarketStyleOpacityPercent(value: number): number {
  if (!Number.isFinite(value)) return MARKET_STYLE_OPACITY_PERCENT.full
  return Math.min(100, Math.max(0, value))
}

/** Sanitize an optional opacity percentage, returning `undefined` when invalid. */
export function sanitizeMarketStyleOpacityPercent(value: unknown): number | undefined {
  return isMarketStyleOpacityPercent(value) ? value : undefined
}

/**
 * Fold an opacity percentage into a CSS color string.
 *
 * Returns the color unchanged at 100% (Lightweight Charts accepts palette hex
 * there) and `rgba(r, g, b, a)` otherwise. Safe for both LWC series options and
 * canvas fill/stroke styles.
 */
export function marketStyleColorWithOpacity(color: string, opacityPercent: number): string {
  const clamped = clampMarketStyleOpacityPercent(opacityPercent)
  // Opaque hex/rgb input stays as-is at 100%; an `rgba(...)` input is rewritten
  // so a previously folded alpha can never leak into a full-opacity setting.
  if (clamped >= 100 && !/^rgba\(/i.test(color.trim())) return color
  return rgbaFromResolvedCssColor(color, clamped / 100)
}

/** Default primary/secondary/fill color strings with opacity already folded in. */
export function marketStyleRoleColor(role: MarketStyleRole): string {
  const style = MARKET_STYLE_DEFAULTS[role]
  return marketStyleColorWithOpacity(style.color, style.opacityPercent)
}
