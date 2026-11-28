/**
 * Live liquidation-level profile settings (per chart panel).
 *
 * The profile is a bar / fill object: each direction owns one shared
 * Color + Opacity pair (never a stroke width or a Line/Dot style), plus one bar
 * extent control — how far a bar may reach left from the pane's right edge,
 * exactly like the FRVP histogram's max width. The defaults come from the
 * shared semantic pair (long = green, short = red), which is what makes the two
 * sides readable in every theme; the user may restyle them because a bar drawn
 * over candles is a legibility preference, not a meaning change.
 */
import {
  MARKET_SEMANTIC_NEGATIVE_COLOR,
  MARKET_SEMANTIC_POSITIVE_COLOR,
} from './marketSemanticColors.ts'
import {
  clampMarketStyleOpacityPercent,
  isMarketStyleHexColor,
} from './marketStylePalette.ts'

/** Default bar opacity: readable over candles without hiding them. */
export const LIQUIDATION_LEVELS_DEFAULT_OPACITY_PERCENT = 60

/** Default bar extent as a share of the CANDLE pane plot width. */
export const LIQUIDATION_LEVELS_DEFAULT_MAX_WIDTH_PERCENT = 25

export const LIQUIDATION_LEVELS_MIN_WIDTH_PERCENT = 5
export const LIQUIDATION_LEVELS_MAX_WIDTH_PERCENT = 100
export const LIQUIDATION_LEVELS_WIDTH_STEP_PERCENT = 5

export interface LiquidationLevelsSettings {
  /** Long positions (positive size) are green by default. */
  longColor: string
  longOpacityPercent: number
  /** Short positions (negative size) are red by default. */
  shortColor: string
  shortOpacityPercent: number
  /** Bar extent, in percent of the candle pane's plot width (5–100). */
  maxWidthPercent: number
}

export const DEFAULT_LIQUIDATION_LEVELS_SETTINGS: LiquidationLevelsSettings = {
  longColor: MARKET_SEMANTIC_POSITIVE_COLOR,
  longOpacityPercent: LIQUIDATION_LEVELS_DEFAULT_OPACITY_PERCENT,
  shortColor: MARKET_SEMANTIC_NEGATIVE_COLOR,
  shortOpacityPercent: LIQUIDATION_LEVELS_DEFAULT_OPACITY_PERCENT,
  maxWidthPercent: LIQUIDATION_LEVELS_DEFAULT_MAX_WIDTH_PERCENT,
}

export function sanitizeLiquidationLevelsMaxWidthPercent(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return LIQUIDATION_LEVELS_DEFAULT_MAX_WIDTH_PERCENT
  }
  return Math.min(
    LIQUIDATION_LEVELS_MAX_WIDTH_PERCENT,
    Math.max(LIQUIDATION_LEVELS_MIN_WIDTH_PERCENT, Math.round(value)),
  )
}

/** Field-by-field sanitizer: one invalid field never discards the record. */
export function sanitizeLiquidationLevelsSettings(
  value: unknown,
): LiquidationLevelsSettings {
  if (!value || typeof value !== 'object') {
    return { ...DEFAULT_LIQUIDATION_LEVELS_SETTINGS }
  }
  const record = value as Record<string, unknown>
  const longColor = isMarketStyleHexColor(record.longColor)
    ? record.longColor
    : DEFAULT_LIQUIDATION_LEVELS_SETTINGS.longColor
  const shortColor = isMarketStyleHexColor(record.shortColor)
    ? record.shortColor
    : DEFAULT_LIQUIDATION_LEVELS_SETTINGS.shortColor
  const longOpacity =
    typeof record.longOpacityPercent === 'number'
      ? clampMarketStyleOpacityPercent(record.longOpacityPercent)
      : DEFAULT_LIQUIDATION_LEVELS_SETTINGS.longOpacityPercent
  const shortOpacity =
    typeof record.shortOpacityPercent === 'number'
      ? clampMarketStyleOpacityPercent(record.shortOpacityPercent)
      : DEFAULT_LIQUIDATION_LEVELS_SETTINGS.shortOpacityPercent
  return {
    longColor,
    longOpacityPercent: longOpacity,
    shortColor,
    shortOpacityPercent: shortOpacity,
    maxWidthPercent: sanitizeLiquidationLevelsMaxWidthPercent(record.maxWidthPercent),
  }
}

export function liquidationLevelsSettingsEqual(
  a: LiquidationLevelsSettings,
  b: LiquidationLevelsSettings,
): boolean {
  return (
    a.longColor === b.longColor &&
    a.longOpacityPercent === b.longOpacityPercent &&
    a.shortColor === b.shortColor &&
    a.shortOpacityPercent === b.shortOpacityPercent &&
    a.maxWidthPercent === b.maxWidthPercent
  )
}
