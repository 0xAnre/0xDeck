import {
  DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS,
  type AnchoredVwapDrawingMultipliers,
} from './anchoredVwapDrawing.ts'
import {
  isRollingVwapHexColor,
  isRollingVwapLineOpacity,
  isRollingVwapLineStyle,
  isRollingVwapLineWidth,
  rollingVwapCenterLineRgbaColor,
  type RollingVwapLineStyle,
  type RollingVwapLineWidth,
} from './rollingVwapSettings.ts'

/**
 * TradingView Anchored VWAP drawing defaults (verified against TV help/style docs):
 * - Source HLC3 (calculation module)
 * - Bands calculation: Standard Deviation; multipliers 1, 2, 3
 * - VWAP line visible, width 2, solid
 * - Band pair #1 visible; pairs #2 and #3 hidden by default
 * - Each band pair styles its upper and lower lines independently and can fill
 *   the area between them (fill opacity 0 disables the fill by default).
 */
export const ANCHORED_VWAP_DRAWING_CALCULATION_MODES = ['standard-deviation', 'percentage'] as const

export type AnchoredVwapDrawingCalculationMode =
  (typeof ANCHORED_VWAP_DRAWING_CALCULATION_MODES)[number]

export type AnchoredVwapDrawingLineSettings = {
  visible: boolean
  lineColor: string
  lineOpacity: number
  lineWidth: RollingVwapLineWidth
  lineStyle: RollingVwapLineStyle
}

export type AnchoredVwapDrawingBandPairSettings = {
  visible: boolean
  multiplier: number
  upperVisible: boolean
  upperColor: string
  lowerVisible: boolean
  lowerColor: string
  fillColor: string
  fillOpacity: number
  lineOpacity: number
  lineWidth: RollingVwapLineWidth
  lineStyle: RollingVwapLineStyle
}

export type AnchoredVwapDrawingSettings = {
  calculationMode: AnchoredVwapDrawingCalculationMode
  source: 'hlc3'
  vwapLine: AnchoredVwapDrawingLineSettings
  band1: AnchoredVwapDrawingBandPairSettings
  band2: AnchoredVwapDrawingBandPairSettings
  band3: AnchoredVwapDrawingBandPairSettings
}

const DEFAULT_VWAP_LINE: AnchoredVwapDrawingLineSettings = {
  visible: true,
  lineColor: '#2962FF',
  lineOpacity: 100,
  lineWidth: 2,
  lineStyle: 'solid',
}

const DEFAULT_BAND1: AnchoredVwapDrawingBandPairSettings = {
  visible: true,
  multiplier: DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier1,
  upperVisible: true,
  upperColor: '#4caf50',
  lowerVisible: true,
  lowerColor: '#4caf50',
  fillColor: '#4caf50',
  fillOpacity: 0,
  lineOpacity: 100,
  lineWidth: 1,
  lineStyle: 'solid',
}

const DEFAULT_BAND2: AnchoredVwapDrawingBandPairSettings = {
  visible: false,
  multiplier: DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier2,
  upperVisible: true,
  upperColor: '#ffeb3b',
  lowerVisible: true,
  lowerColor: '#ffeb3b',
  fillColor: '#ffeb3b',
  fillOpacity: 0,
  lineOpacity: 100,
  lineWidth: 1,
  lineStyle: 'solid',
}

const DEFAULT_BAND3: AnchoredVwapDrawingBandPairSettings = {
  visible: false,
  multiplier: DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier3,
  upperVisible: true,
  upperColor: '#ff5252',
  lowerVisible: true,
  lowerColor: '#ff5252',
  fillColor: '#ff5252',
  fillOpacity: 0,
  lineOpacity: 100,
  lineWidth: 1,
  lineStyle: 'solid',
}

function sanitizeMultiplier(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return value
}

function sanitizeBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function isAnchoredVwapFillOpacity(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
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
    lineWidth: isRollingVwapLineWidth(record.lineWidth) ? record.lineWidth : defaults.lineWidth,
    lineStyle: isRollingVwapLineStyle(record.lineStyle) ? record.lineStyle : defaults.lineStyle,
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
    lowerVisible: sanitizeBoolean(record.lowerVisible, defaults.lowerVisible),
    lowerColor: sanitizeBandColor(record, 'lowerColor', legacyLineColor, defaults.lowerColor),
    fillColor: sanitizeBandColor(record, 'fillColor', legacyLineColor, defaults.fillColor),
    fillOpacity: isAnchoredVwapFillOpacity(record.fillOpacity)
      ? record.fillOpacity
      : defaults.fillOpacity,
    lineOpacity: isRollingVwapLineOpacity(record.lineOpacity)
      ? record.lineOpacity
      : defaults.lineOpacity,
    lineWidth: isRollingVwapLineWidth(record.lineWidth) ? record.lineWidth : defaults.lineWidth,
    lineStyle: isRollingVwapLineStyle(record.lineStyle) ? record.lineStyle : defaults.lineStyle,
  }
}

export function createDefaultAnchoredVwapDrawingSettings(): AnchoredVwapDrawingSettings {
  return {
    calculationMode: 'standard-deviation',
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
  const calculationMode =
    record.calculationMode === 'percentage' ? 'percentage' : 'standard-deviation'
  return {
    calculationMode,
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

export function anchoredVwapDrawingLineRgba(
  lineColor: string,
  lineOpacity: number,
): string {
  return rollingVwapCenterLineRgbaColor(lineColor, lineOpacity)
}
