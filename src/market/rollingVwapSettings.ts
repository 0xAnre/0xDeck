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
  isLineChartStrokeStyle,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
} from './lineChartStroke.ts'
import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_OPACITY_PERCENT,
  MARKET_STYLE_PALETTE,
  MARKET_STYLE_ROLLING_BAND_SHADES,
  isMarketStyleHexColor,
  isMarketStyleOpacityPercent,
  marketStyleShade,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'

export const ROLLING_VWAP_INFO_BOX_SIZES = [
  'tiny',
  'small',
  'normal',
  'large',
  'huge',
  'auto',
] as const

export type RollingVwapInfoBoxSize = (typeof ROLLING_VWAP_INFO_BOX_SIZES)[number]

export const ROLLING_VWAP_INFO_BOX_VERTICAL_POSITIONS = ['top', 'middle', 'bottom'] as const

export type RollingVwapInfoBoxVerticalPosition =
  (typeof ROLLING_VWAP_INFO_BOX_VERTICAL_POSITIONS)[number]

export const ROLLING_VWAP_INFO_BOX_HORIZONTAL_POSITIONS = ['left', 'center', 'right'] as const

export type RollingVwapInfoBoxHorizontalPosition =
  (typeof ROLLING_VWAP_INFO_BOX_HORIZONTAL_POSITIONS)[number]

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

export type RollingVwapInfoBoxSettings = {
  visible: boolean
  size: RollingVwapInfoBoxSize
  verticalPosition: RollingVwapInfoBoxVerticalPosition
  horizontalPosition: RollingVwapInfoBoxHorizontalPosition
  backgroundColor: string
  backgroundColorOpacity: number
  textColor: string
  textColorOpacity: number
}

export const ROLLING_VWAP_LINE_WIDTHS = [1, 2, 3, 4] as const

export type RollingVwapLineWidth = (typeof ROLLING_VWAP_LINE_WIDTHS)[number]

export const DEFAULT_ROLLING_VWAP_LINE_WIDTH: RollingVwapLineWidth = 1

export const DEFAULT_ROLLING_VWAP_LINE_COLOR = MARKET_STYLE_DEFAULTS.primaryLine.color

export const DEFAULT_ROLLING_VWAP_LINE_OPACITY = MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent

/** Shared selectable line styles (`Line` = solid, `Dot` = dotted). */
export const ROLLING_VWAP_LINE_STYLES = LINE_CHART_STROKE_STYLES

export type RollingVwapLineStyle = LineChartStrokeStyle

export const DEFAULT_ROLLING_VWAP_LINE_STYLE: RollingVwapLineStyle = 'solid'

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
  infoBox: RollingVwapInfoBoxSettings
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

const DEFAULT_INFO_BOX: RollingVwapInfoBoxSettings = {
  visible: true,
  size: 'small',
  verticalPosition: 'bottom',
  horizontalPosition: 'right',
  backgroundColor: MARKET_STYLE_PALETTE.dark,
  backgroundColorOpacity: MARKET_STYLE_OPACITY_PERCENT.full,
  textColor: MARKET_STYLE_DEFAULTS.primaryLine.color,
  textColorOpacity: MARKET_STYLE_OPACITY_PERCENT.full,
}

const INFO_BOX_SIZE_SET = new Set<string>(ROLLING_VWAP_INFO_BOX_SIZES)
const INFO_BOX_VERTICAL_SET = new Set<string>(ROLLING_VWAP_INFO_BOX_VERTICAL_POSITIONS)
const INFO_BOX_HORIZONTAL_SET = new Set<string>(ROLLING_VWAP_INFO_BOX_HORIZONTAL_POSITIONS)

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

function sanitizeInfoBox(value: unknown, defaults: RollingVwapInfoBoxSettings): RollingVwapInfoBoxSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const size =
    typeof record.size === 'string' && INFO_BOX_SIZE_SET.has(record.size)
      ? (record.size as RollingVwapInfoBoxSize)
      : defaults.size
  const verticalPosition =
    typeof record.verticalPosition === 'string' && INFO_BOX_VERTICAL_SET.has(record.verticalPosition)
      ? (record.verticalPosition as RollingVwapInfoBoxVerticalPosition)
      : defaults.verticalPosition
  const horizontalPosition =
    typeof record.horizontalPosition === 'string' &&
    INFO_BOX_HORIZONTAL_SET.has(record.horizontalPosition)
      ? (record.horizontalPosition as RollingVwapInfoBoxHorizontalPosition)
      : defaults.horizontalPosition

  return {
    visible: typeof record.visible === 'boolean' ? record.visible : defaults.visible,
    size,
    verticalPosition,
    horizontalPosition,
    backgroundColor: isRollingVwapHexColor(record.backgroundColor)
      ? record.backgroundColor
      : defaults.backgroundColor,
    backgroundColorOpacity: isMarketStyleOpacityPercent(record.backgroundColorOpacity)
      ? record.backgroundColorOpacity
      : defaults.backgroundColorOpacity,
    textColor: isRollingVwapHexColor(record.textColor) ? record.textColor : defaults.textColor,
    textColorOpacity: isMarketStyleOpacityPercent(record.textColorOpacity)
      ? record.textColorOpacity
      : defaults.textColorOpacity,
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
    infoBox: { ...DEFAULT_INFO_BOX },
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
export const DEFAULT_ROLLING_VWAP_INFO_BOX: RollingVwapInfoBoxSettings = { ...DEFAULT_INFO_BOX }

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
    infoBox: sanitizeInfoBox(record.infoBox, defaults.infoBox),
    lineWidth: isRollingVwapLineWidth(record.lineWidth) ? record.lineWidth : defaults.lineWidth,
    lineColor: isRollingVwapHexColor(record.lineColor) ? record.lineColor : defaults.lineColor,
    lineOpacity: isRollingVwapLineOpacity(record.lineOpacity)
      ? record.lineOpacity
      : defaults.lineOpacity,
    lineStyle: sanitizeLineChartStrokeStyle(record.lineStyle) ?? defaults.lineStyle,
  }
}
