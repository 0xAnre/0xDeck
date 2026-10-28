import {
  computeRollingVwapForInterval,
  DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD,
  DEFAULT_ROLLING_VWAP_MIN_BARS,
  DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS,
  isRollingVwapMinBars,
  sanitizeRollingVwapFixedTimePeriod,
  sanitizeRollingVwapStdevMultipliers,
  type RollingVwapFixedTimePeriod,
  type RollingVwapPoint,
  type RollingVwapStdevMultipliers,
} from './rollingVwap.ts'
import type { CandleInterval, MarketCandle } from './types.ts'
import {
  LINE_CHART_STROKE_STYLES,
  LINE_CHART_STROKE_WIDTHS,
  isLineChartStrokeStyle,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './lineChartStroke.ts'
import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_OPACITY_PERCENT,
  MARKET_STYLE_ROLLING_BAND_SHADES,
  isMarketStyleHexColor,
  isMarketStyleOpacityPercent,
  marketStyleShade,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'

export type RollingVwapBandColors = {
  band1: string
  band2: string
  band3: string
}

/** Independent 0–100 opacity per deviation band. */
export type RollingVwapBandOpacities = {
  band1: number
  band2: number
  band3: number
}

/** Independent stroke style per deviation band (shared `Line` / `Dot` row). */
export type RollingVwapBandLineStyles = {
  band1: RollingVwapLineStyle
  band2: RollingVwapLineStyle
  band3: RollingVwapLineStyle
}

export const ROLLING_VWAP_LINE_WIDTHS = LINE_CHART_STROKE_WIDTHS

export type RollingVwapLineWidth = LineChartStrokeWidth

export const DEFAULT_ROLLING_VWAP_LINE_WIDTH: RollingVwapLineWidth = 1

export const DEFAULT_ROLLING_VWAP_LINE_COLOR = MARKET_STYLE_DEFAULTS.primaryLine.color

export const DEFAULT_ROLLING_VWAP_LINE_OPACITY = MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent

/** Shared selectable line styles (`Line` = solid, `Dot` = dotted). */
export const ROLLING_VWAP_LINE_STYLES = LINE_CHART_STROKE_STYLES

export type RollingVwapLineStyle = LineChartStrokeStyle

export const DEFAULT_ROLLING_VWAP_LINE_STYLE: RollingVwapLineStyle = 'solid'

/**
 * Shared fill color from the palette fill role, with a lower Rolling-VWAP-only
 * opacity: bands 1–3 are nested, so three 15% fills compound to ~39% in the
 * innermost region instead of the ~58% a 25% role default would produce.
 */
export const DEFAULT_ROLLING_VWAP_FILL_COLOR = MARKET_STYLE_DEFAULTS.fill.color
export const DEFAULT_ROLLING_VWAP_FILL_OPACITY = 15

/** Shared default style for every deviation band until the user picks another. */
export const DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE: RollingVwapLineStyle =
  DEFAULT_ROLLING_VWAP_LINE_STYLE

const ROLLING_VWAP_LINE_WIDTH_SET = new Set<number>(ROLLING_VWAP_LINE_WIDTHS)

export function isRollingVwapLineWidth(value: unknown): value is RollingVwapLineWidth {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    ROLLING_VWAP_LINE_WIDTH_SET.has(value)
  )
}

/** True only for currently selectable styles (`solid`, `dotted`). */
export function isRollingVwapLineStyle(value: unknown): value is RollingVwapLineStyle {
  return isLineChartStrokeStyle(value)
}

/** Shared 0–100 opacity percentage guard. */
export const isRollingVwapLineOpacity = isMarketStyleOpacityPercent

/** Converts persisted hex + opacity percent to a color string for Lightweight Charts. */
export function rollingVwapCenterLineRgbaColor(lineColor: string, lineOpacity: number): string {
  return marketStyleColorWithOpacity(lineColor, lineOpacity)
}

export type RollingVwapSettings = {
  fixedTimePeriod: RollingVwapFixedTimePeriod
  minBars: number
  multipliers: RollingVwapStdevMultipliers
  bandColors: RollingVwapBandColors
  bandOpacities: RollingVwapBandOpacities
  bandLineStyles: RollingVwapBandLineStyles
  /** Shared band-pair fill color (one color for bands 1–3). */
  fillColor: string
  /** Shared band-pair fill opacity (0–100, one value for bands 1–3). */
  fillOpacity: number
  lineWidth: RollingVwapLineWidth
  lineColor: string
  lineOpacity: number
  lineStyle: RollingVwapLineStyle
}

const DEFAULT_BAND_COLORS: RollingVwapBandColors = {
  band1: marketStyleShade(MARKET_STYLE_ROLLING_BAND_SHADES, 0),
  band2: marketStyleShade(MARKET_STYLE_ROLLING_BAND_SHADES, 1),
  band3: marketStyleShade(MARKET_STYLE_ROLLING_BAND_SHADES, 2),
}

const DEFAULT_BAND_OPACITIES: RollingVwapBandOpacities = {
  band1: MARKET_STYLE_OPACITY_PERCENT.secondary,
  band2: MARKET_STYLE_OPACITY_PERCENT.secondary,
  band3: MARKET_STYLE_OPACITY_PERCENT.secondary,
}

const DEFAULT_BAND_LINE_STYLES: RollingVwapBandLineStyles = {
  band1: DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE,
  band2: DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE,
  band3: DEFAULT_ROLLING_VWAP_BAND_LINE_STYLE,
}

/** Kept for existing call sites; delegates to the shared palette hex guard. */
export const isRollingVwapHexColor = isMarketStyleHexColor

function sanitizeBandColors(value: unknown, defaults: RollingVwapBandColors): RollingVwapBandColors {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    band1: isMarketStyleHexColor(record.band1) ? record.band1 : defaults.band1,
    band2: isMarketStyleHexColor(record.band2) ? record.band2 : defaults.band2,
    band3: isMarketStyleHexColor(record.band3) ? record.band3 : defaults.band3,
  }
}

function sanitizeBandOpacities(
  value: unknown,
  defaults: RollingVwapBandOpacities,
): RollingVwapBandOpacities {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    band1: isMarketStyleOpacityPercent(record.band1) ? record.band1 : defaults.band1,
    band2: isMarketStyleOpacityPercent(record.band2) ? record.band2 : defaults.band2,
    band3: isMarketStyleOpacityPercent(record.band3) ? record.band3 : defaults.band3,
  }
}

function sanitizeBandLineStyles(
  value: unknown,
  defaults: RollingVwapBandLineStyles,
): RollingVwapBandLineStyles {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    band1: sanitizeLineChartStrokeStyle(record.band1) ?? defaults.band1,
    band2: sanitizeLineChartStrokeStyle(record.band2) ?? defaults.band2,
    band3: sanitizeLineChartStrokeStyle(record.band3) ?? defaults.band3,
  }
}

/** Fresh defaults (Pine Rolling VWAP inputs). Not a shared mutable singleton. */
export function createDefaultRollingVwapSettings(): RollingVwapSettings {
  return {
    fixedTimePeriod: { ...DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD },
    minBars: DEFAULT_ROLLING_VWAP_MIN_BARS,
    multipliers: { ...DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS },
    bandColors: { ...DEFAULT_BAND_COLORS },
    bandOpacities: { ...DEFAULT_BAND_OPACITIES },
    bandLineStyles: { ...DEFAULT_BAND_LINE_STYLES },
    fillColor: DEFAULT_ROLLING_VWAP_FILL_COLOR,
    fillOpacity: DEFAULT_ROLLING_VWAP_FILL_OPACITY,
    lineWidth: DEFAULT_ROLLING_VWAP_LINE_WIDTH,
    lineColor: DEFAULT_ROLLING_VWAP_LINE_COLOR,
    lineOpacity: DEFAULT_ROLLING_VWAP_LINE_OPACITY,
    lineStyle: DEFAULT_ROLLING_VWAP_LINE_STYLE,
  }
}

export const DEFAULT_ROLLING_VWAP_BAND_COLORS: RollingVwapBandColors = { ...DEFAULT_BAND_COLORS }
export const DEFAULT_ROLLING_VWAP_BAND_OPACITIES: RollingVwapBandOpacities = {
  ...DEFAULT_BAND_OPACITIES,
}
export const DEFAULT_ROLLING_VWAP_BAND_LINE_STYLES: RollingVwapBandLineStyles = {
  ...DEFAULT_BAND_LINE_STYLES,
}

/**
 * Rolling VWAP band-pair fill resolution.
 *
 * The fill covers all three upper/lower pairs with one color + opacity and is
 * independent from the per-band line styling. Missing/invalid fields fall back
 * to the Rolling VWAP fill default so legacy instances load without migration.
 */
export function resolveRollingVwapBandFillStyle(
  settings: Partial<Pick<RollingVwapSettings, 'fillColor' | 'fillOpacity'>>,
): string {
  const color = isMarketStyleHexColor(settings.fillColor)
    ? settings.fillColor
    : DEFAULT_ROLLING_VWAP_FILL_COLOR
  const opacityPercent = isMarketStyleOpacityPercent(settings.fillOpacity)
    ? settings.fillOpacity
    : DEFAULT_ROLLING_VWAP_FILL_OPACITY
  return marketStyleColorWithOpacity(color, opacityPercent)
}

export function computeRollingVwapPointsForSettings(
  candles: readonly MarketCandle[],
  interval: CandleInterval,
  settings: RollingVwapSettings,
): RollingVwapPoint[] {
  return computeRollingVwapForInterval(candles, interval, settings.fixedTimePeriod, {
    minBars: settings.minBars,
    multipliers: settings.multipliers,
  })
}

export function sanitizeRollingVwapSettings(value: unknown): RollingVwapSettings {
  const defaults = createDefaultRollingVwapSettings()
  if (!value || typeof value !== 'object') {
    return defaults
  }
  const record = value as Record<string, unknown>
  return {
    fixedTimePeriod: sanitizeRollingVwapFixedTimePeriod(record.fixedTimePeriod, defaults.fixedTimePeriod),
    minBars: isRollingVwapMinBars(record.minBars) ? record.minBars : defaults.minBars,
    multipliers: sanitizeRollingVwapStdevMultipliers(record.multipliers, defaults.multipliers),
    bandColors: sanitizeBandColors(record.bandColors, defaults.bandColors),
    bandOpacities: sanitizeBandOpacities(record.bandOpacities, defaults.bandOpacities),
    bandLineStyles: sanitizeBandLineStyles(record.bandLineStyles, defaults.bandLineStyles),
    fillColor: isMarketStyleHexColor(record.fillColor)
      ? record.fillColor
      : defaults.fillColor,
    fillOpacity: isMarketStyleOpacityPercent(record.fillOpacity)
      ? record.fillOpacity
      : defaults.fillOpacity,
    lineWidth: isRollingVwapLineWidth(record.lineWidth) ? record.lineWidth : defaults.lineWidth,
    lineColor: isRollingVwapHexColor(record.lineColor) ? record.lineColor : defaults.lineColor,
    lineOpacity: isRollingVwapLineOpacity(record.lineOpacity)
      ? record.lineOpacity
      : defaults.lineOpacity,
    lineStyle: sanitizeLineChartStrokeStyle(record.lineStyle) ?? defaults.lineStyle,
  }
}
