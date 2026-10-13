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
  lineColor: string
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
  lineColor: '#4caf50',
  lineOpacity: 100,
  lineWidth: 1,
  lineStyle: 'solid',
}

const DEFAULT_BAND2: AnchoredVwapDrawingBandPairSettings = {
  visible: false,
  multiplier: DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier2,
  lineColor: '#ffeb3b',
  lineOpacity: 100,
  lineWidth: 1,
  lineStyle: 'solid',
}

const DEFAULT_BAND3: AnchoredVwapDrawingBandPairSettings = {
  visible: false,
  multiplier: DEFAULT_ANCHORED_VWAP_DRAWING_MULTIPLIERS.multiplier3,
  lineColor: '#ff5252',
  lineOpacity: 100,
  lineWidth: 1,
  lineStyle: 'solid',
}

function sanitizeMultiplier(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return fallback
  return value
}

function sanitizeLineSettings(
  value: unknown,
  defaults: AnchoredVwapDrawingLineSettings,
): AnchoredVwapDrawingLineSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    visible: typeof record.visible === 'boolean' ? record.visible : defaults.visible,
    lineColor: isRollingVwapHexColor(record.lineColor) ? record.lineColor : defaults.lineColor,
    lineOpacity: isRollingVwapLineOpacity(record.lineOpacity)
      ? record.lineOpacity
      : defaults.lineOpacity,
    lineWidth: isRollingVwapLineWidth(record.lineWidth) ? record.lineWidth : defaults.lineWidth,
    lineStyle: isRollingVwapLineStyle(record.lineStyle) ? record.lineStyle : defaults.lineStyle,
  }
}

function sanitizeBandPair(
  value: unknown,
  defaults: AnchoredVwapDrawingBandPairSettings,
): AnchoredVwapDrawingBandPairSettings {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const line = sanitizeLineSettings(record, defaults)
  return {
    ...line,
    multiplier: sanitizeMultiplier(record.multiplier, defaults.multiplier),
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
