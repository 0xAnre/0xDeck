import {
  DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS,
  type AnchoredVwapDrawingMultipliers,
} from './anchoredVwapDrawing.ts'
import {
  isRollingVwapHexColor,
  isRollingVwapLineOpacity,
} from './rollingVwapSettings.ts'
import {
  isLineChartStrokeWidth,
  sanitizeLineChartStrokeStyle,
  type LineChartStrokeStyle,
  type LineChartStrokeWidth,
} from './lineChartStroke.ts'
import {
  MARKET_STYLE_DEFAULTS,
  MARKET_STYLE_OPACITY_PERCENT,
  isMarketStyleOpacityPercent,
  marketStyleColorWithOpacity,
} from './marketStylePalette.ts'

/**
 * TradingView Anchored VWAP drawing defaults (verified against TV help/style docs):
 * - Source HLC3 (calculation module)
 * - Bands calculation: Standard Deviation; multipliers 1, 2, 3
 * - VWAP line visible, width 2, solid
 * - Band pair #1 visible; pairs #2 and #3 hidden by default
 * - Each band pair styles its upper and lower lines independently (color and
 *   opacity) and can fill the area between them (fill opacity 0 disables the
 *   fill by default).
 *
 * Colors come from the shared BTC Perp palette: center line `light` @ 100%,
 * band lines `medium` @ 70%.
 */
export type AnchoredVwapDrawingLineSettings = {
  visible: boolean
  lineColor: string
  lineOpacity: number
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
}

export type AnchoredVwapDrawingBandPairSettings = {
  visible: boolean
  multiplier: number
  upperVisible: boolean
  upperColor: string
  upperOpacity: number
  lowerVisible: boolean
  lowerColor: string
  lowerOpacity: number
  fillColor: string
  fillOpacity: number
  lineWidth: LineChartStrokeWidth
  lineStyle: LineChartStrokeStyle
}

export type AnchoredVwapDrawingSettings = {
  source: 'hlc3'
  vwapLine: AnchoredVwapDrawingLineSettings
  band1: AnchoredVwapDrawingBandPairSettings
  band2: AnchoredVwapDrawingBandPairSettings
  band3: AnchoredVwapDrawingBandPairSettings
}

const DEFAULT_BAND_LINE_COLOR = MARKET_STYLE_DEFAULTS.secondaryLine.color
const DEFAULT_BAND_LINE_OPACITY = MARKET_STYLE_DEFAULTS.secondaryLine.opacityPercent

const DEFAULT_VWAP_LINE: AnchoredVwapDrawingLineSettings = {
  visible: true,
  lineColor: MARKET_STYLE_DEFAULTS.primaryLine.color,
  lineOpacity: MARKET_STYLE_DEFAULTS.primaryLine.opacityPercent,
  lineWidth: 2,
  lineStyle: 'solid',
}

function defaultBandPair(
  multiplier: number,
  visible: boolean,
): AnchoredVwapDrawingBandPairSettings {
  return {
    visible,
    multiplier,
    upperVisible: true,
    upperColor: DEFAULT_BAND_LINE_COLOR,
    upperOpacity: DEFAULT_BAND_LINE_OPACITY,
    lowerVisible: true,
    lowerColor: DEFAULT_BAND_LINE_COLOR,
    lowerOpacity: DEFAULT_BAND_LINE_OPACITY,
    fillColor: MARKET_STYLE_DEFAULTS.fill.color,
    fillOpacity: 0,
    lineWidth: 1,
    lineStyle: 'solid',
  }
}

const DEFAULT_BAND1: AnchoredVwapDrawingBandPairSettings = defaultBandPair(
  DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier1,
  true,
)

const DEFAULT_BAND2: AnchoredVwapDrawingBandPairSettings = defaultBandPair(
  DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier2,
  false,
)

const DEFAULT_BAND3: AnchoredVwapDrawingBandPairSettings = defaultBandPair(
  DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier3,
  false,
)

export const DEFAULT_ANCHORED_VWAP_BAND_LINE_COLOR = DEFAULT_BAND_LINE_COLOR
export const DEFAULT_ANCHORED_VWAP_BAND_LINE_OPACITY = DEFAULT_BAND_LINE_OPACITY

function sanitizeMultiplier(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return value
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function isAnchoredVwapFillOpacity(value: unknown): value is number {
  return isMarketStyleOpacityPercent(value)
}

function sanitizeLineStyle(
  value: unknown,
  fallback: LineChartStrokeStyle,
): LineChartStrokeStyle {
  return sanitizeLineChartStrokeStyle(value) ?? fallback
}

function sanitizeLineSettings(
  value: unknown,
  defaults: AnchoredVwapDrawingLineSettings,
): AnchoredVwapDrawingLineSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    visible: sanitizeBoolean(record.visible, defaults.visible),
    lineColor: isRollingVwapHexColor(record.lineColor) ? record.lineColor : defaults.lineColor,
    lineOpacity: isRollingVwapLineOpacity(record.lineOpacity)
      ? record.lineOpacity
      : defaults.lineOpacity,
    lineWidth: isLineChartStrokeWidth(record.lineWidth) ? record.lineWidth : defaults.lineWidth,
    lineStyle: sanitizeLineStyle(record.lineStyle, defaults.lineStyle),
  }
}

/**
 * Precedence for each new band color:
 * valid new color -> valid legacy shared `lineColor` -> band default color.
 * Legacy saved data therefore keeps its previous appearance.
 */
function sanitizeBandColor(
  record: Record<string, unknown>,
  key: 'upperColor' | 'lowerColor' | 'fillColor',
  legacyLineColor: string | undefined,
  fallback: string,
): string {
  if (isRollingVwapHexColor(record[key])) return record[key]
  if (legacyLineColor !== undefined) return legacyLineColor
  return fallback
}

/**
 * Precedence for each new independent band opacity:
 * valid new `upperOpacity`/`lowerOpacity` -> legacy shared `lineOpacity`
 * (which used to style both band lines) -> band default opacity.
 */
function sanitizeBandOpacity(
  record: Record<string, unknown>,
  key: 'upperOpacity' | 'lowerOpacity',
  fallback: number,
): number {
  if (isRollingVwapLineOpacity(record[key])) return record[key]
  if (isRollingVwapLineOpacity(record.lineOpacity)) return record.lineOpacity
  return fallback
}

function sanitizeBandPair(
  value: unknown,
  defaults: AnchoredVwapDrawingBandPairSettings,
): AnchoredVwapDrawingBandPairSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const legacyLineColor = isRollingVwapHexColor(record.lineColor) ? record.lineColor : undefined
  return {
    visible: sanitizeBoolean(record.visible, defaults.visible),
    multiplier: sanitizeMultiplier(record.multiplier, defaults.multiplier),
    upperVisible: sanitizeBoolean(record.upperVisible, defaults.upperVisible),
    upperColor: sanitizeBandColor(record, 'upperColor', legacyLineColor, defaults.upperColor),
    upperOpacity: sanitizeBandOpacity(record, 'upperOpacity', defaults.upperOpacity),
    lowerVisible: sanitizeBoolean(record.lowerVisible, defaults.lowerVisible),
    lowerColor: sanitizeBandColor(record, 'lowerColor', legacyLineColor, defaults.lowerColor),
    lowerOpacity: sanitizeBandOpacity(record, 'lowerOpacity', defaults.lowerOpacity),
    fillColor: sanitizeBandColor(record, 'fillColor', legacyLineColor, defaults.fillColor),
    fillOpacity: isAnchoredVwapFillOpacity(record.fillOpacity)
      ? record.fillOpacity
      : defaults.fillOpacity,
    lineWidth: isLineChartStrokeWidth(record.lineWidth) ? record.lineWidth : defaults.lineWidth,
    lineStyle: sanitizeLineStyle(record.lineStyle, defaults.lineStyle),
  }
}

export function createDefaultAnchoredVwapDrawingSettings(): AnchoredVwapDrawingSettings {
  return {
    source: 'hlc3',
    vwapLine: { ...DEFAULT_VWAP_LINE },
    band1: { ...DEFAULT_BAND1 },
    band2: { ...DEFAULT_BAND2 },
    band3: { ...DEFAULT_BAND3 },
  }
}

export function sanitizeAnchoredVwapDrawingSettings(value: unknown): AnchoredVwapDrawingSettings {
  const defaults = createDefaultAnchoredVwapDrawingSettings()
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    source: 'hlc3',
    vwapLine: sanitizeLineSettings(record.vwapLine, defaults.vwapLine),
    band1: sanitizeBandPair(record.band1, defaults.band1),
    band2: sanitizeBandPair(record.band2, defaults.band2),
    band3: sanitizeBandPair(record.band3, defaults.band3),
  }
}

export function anchoredVwapDrawingMultipliersFromSettings(
  settings: AnchoredVwapDrawingSettings,
): AnchoredVwapDrawingMultipliers {
  return {
    multiplier1: settings.band1.multiplier,
    multiplier2: settings.band2.multiplier,
    multiplier3: settings.band3.multiplier,
  }
}

/** Hex + opacity percent → CSS color for Lightweight Charts / canvas. */
export function anchoredVwapDrawingLineRgba(lineColor: string, lineOpacity: number): string {
  return marketStyleColorWithOpacity(lineColor, lineOpacity)
}

/** Default band-line opacity percentage, exported for dialogs/tests. */
export const DEFAULT_ANCHORED_VWAP_BAND_LINE_OPACITY_PERCENT = MARKET_STYLE_OPACITY_PERCENT.secondary
