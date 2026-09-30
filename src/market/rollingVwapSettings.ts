import {
  DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD,
  DEFAULT_ROLLING_VWAP_MIN_BARS,
  DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS,
  isRollingVwapMinBars,
  sanitizeRollingVwapFixedTimePeriod,
  sanitizeRollingVwapStdevMultipliers,
  type RollingVwapFixedTimePeriod,
  type RollingVwapStdevMultipliers,
} from './rollingVwap.ts'

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

export type RollingVwapInfoBoxSettings = {
  visible: boolean
  size: RollingVwapInfoBoxSize
  verticalPosition: RollingVwapInfoBoxVerticalPosition
  horizontalPosition: RollingVwapInfoBoxHorizontalPosition
  backgroundColor: string
  textColor: string
}

export type RollingVwapSettings = {
  fixedTimePeriod: RollingVwapFixedTimePeriod
  minBars: number
  multipliers: RollingVwapStdevMultipliers
  bandColors: RollingVwapBandColors
  infoBox: RollingVwapInfoBoxSettings
}

const DEFAULT_BAND_COLORS: RollingVwapBandColors = {
  band1: '#4caf50',
  band2: '#ffeb3b',
  band3: '#ff5252',
}

const DEFAULT_INFO_BOX: RollingVwapInfoBoxSettings = {
  visible: true,
  size: 'small',
  verticalPosition: 'bottom',
  horizontalPosition: 'right',
  backgroundColor: '#787b86',
  textColor: '#ffffff',
}

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/

const INFO_BOX_SIZE_SET = new Set<string>(ROLLING_VWAP_INFO_BOX_SIZES)
const INFO_BOX_VERTICAL_SET = new Set<string>(ROLLING_VWAP_INFO_BOX_VERTICAL_POSITIONS)
const INFO_BOX_HORIZONTAL_SET = new Set<string>(ROLLING_VWAP_INFO_BOX_HORIZONTAL_POSITIONS)

export function isRollingVwapHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value)
}

function sanitizeBandColors(value: unknown, defaults: RollingVwapBandColors): RollingVwapBandColors {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    band1: isRollingVwapHexColor(record.band1) ? record.band1 : defaults.band1,
    band2: isRollingVwapHexColor(record.band2) ? record.band2 : defaults.band2,
    band3: isRollingVwapHexColor(record.band3) ? record.band3 : defaults.band3,
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
    textColor: isRollingVwapHexColor(record.textColor) ? record.textColor : defaults.textColor,
  }
}

/** Fresh defaults (Pine Rolling VWAP inputs). Not a shared mutable singleton. */
export function createDefaultRollingVwapSettings(): RollingVwapSettings {
  return {
    fixedTimePeriod: { ...DEFAULT_ROLLING_VWAP_FIXED_TIME_PERIOD },
    minBars: DEFAULT_ROLLING_VWAP_MIN_BARS,
    multipliers: { ...DEFAULT_ROLLING_VWAP_STDEV_MULTIPLIERS },
    bandColors: { ...DEFAULT_BAND_COLORS },
    infoBox: { ...DEFAULT_INFO_BOX },
  }
}

export const DEFAULT_ROLLING_VWAP_BAND_COLORS: RollingVwapBandColors = { ...DEFAULT_BAND_COLORS }
export const DEFAULT_ROLLING_VWAP_INFO_BOX: RollingVwapInfoBoxSettings = { ...DEFAULT_INFO_BOX }

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
    infoBox: sanitizeInfoBox(record.infoBox, defaults.infoBox),
  }
}
