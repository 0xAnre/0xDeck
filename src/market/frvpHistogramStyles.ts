import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { isMarketStyleHexColor, isMarketStyleOpacityPercent } from './marketStylePalette.ts'

/**
 * FRVP histogram bar styling (per-instance Up/Down color + 0–100 opacity).
 *
 * The configured opacity is the ceiling for the Value Area rows; the render
 * geometry scales it by the Value-Area/outside shares (55 / 25 of it). The
 * default is 50% for both directions, so a profile without custom histogram
 * fields renders 0.275 inside the Value Area and 0.125 outside it.
 */
export type FixedRangeVolumeProfileHistogramStyleInput = {
  upColor: string
  downColor: string
  upOpacityPercent: number
  downOpacityPercent: number
}

/** Histogram direction: up volume and down volume render separately. */
export type FrvpHistogramDirection = 'up' | 'down'

/** Legacy histogram colors (BTC Perpetual candle colors) unless overridden. */
export const FRVP_HISTOGRAM_DEFAULT_UP_COLOR = BTC_PERPETUAL_CANDLESTICK_COLORS.upColor
export const FRVP_HISTOGRAM_DEFAULT_DOWN_COLOR = BTC_PERPETUAL_CANDLESTICK_COLORS.downColor

/** Default configured opacity (Value-Area ceiling) for both directions. */
export const FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT = 50

/** Default histogram appearance used by instances without custom settings. */
export function frvpHistogramStyleDefaults(): FixedRangeVolumeProfileHistogramStyleInput {
  return {
    upColor: FRVP_HISTOGRAM_DEFAULT_UP_COLOR,
    downColor: FRVP_HISTOGRAM_DEFAULT_DOWN_COLOR,
    upOpacityPercent: FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT,
    downOpacityPercent: FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT,
  }
}

const DIRECTION_COLOR_KEY: Record<
  FrvpHistogramDirection,
  'histogramUpColor' | 'histogramDownColor'
> = {
  up: 'histogramUpColor',
  down: 'histogramDownColor',
}

const DIRECTION_OPACITY_KEY: Record<
  FrvpHistogramDirection,
  'histogramUpOpacityPercent' | 'histogramDownOpacityPercent'
> = {
  up: 'histogramUpOpacityPercent',
  down: 'histogramDownOpacityPercent',
}

const DIRECTION_DEFAULT_HEX: Record<FrvpHistogramDirection, string> = {
  up: FRVP_HISTOGRAM_DEFAULT_UP_COLOR,
  down: FRVP_HISTOGRAM_DEFAULT_DOWN_COLOR,
}

/** Hex value for the shared color picker: instance color, else the legacy default. */
export function frvpHistogramColorInputValue(
  instance: FixedRangeVolumeProfileInstance,
  direction: FrvpHistogramDirection,
): string {
  const custom = instance[DIRECTION_COLOR_KEY[direction]]
  if (isMarketStyleHexColor(custom)) return custom
  return DIRECTION_DEFAULT_HEX[direction]
}

/** 0–100 configured opacity percentage (Value-Area rows use 55% of it). */
export function frvpHistogramOpacityPercent(
  instance: FixedRangeVolumeProfileInstance,
  direction: FrvpHistogramDirection,
): number {
  const value = instance[DIRECTION_OPACITY_KEY[direction]]
  if (isMarketStyleOpacityPercent(value)) return value
  return FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT
}

/** Per-instance histogram style consumed by the render geometry. */
export function frvpHistogramStyleForInstance(
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileHistogramStyleInput {
  return {
    upColor: frvpHistogramColorInputValue(instance, 'up'),
    downColor: frvpHistogramColorInputValue(instance, 'down'),
    upOpacityPercent: frvpHistogramOpacityPercent(instance, 'up'),
    downOpacityPercent: frvpHistogramOpacityPercent(instance, 'down'),
  }
}

export function setFrvpInstanceHistogramColor(
  instance: FixedRangeVolumeProfileInstance,
  direction: FrvpHistogramDirection,
  color: string,
): FixedRangeVolumeProfileInstance {
  if (!isMarketStyleHexColor(color)) return instance
  const key = DIRECTION_COLOR_KEY[direction]
  return { ...instance, [key]: color }
}

export function setFrvpInstanceHistogramOpacityPercent(
  instance: FixedRangeVolumeProfileInstance,
  direction: FrvpHistogramDirection,
  opacityPercent: number,
): FixedRangeVolumeProfileInstance {
  if (!isMarketStyleOpacityPercent(opacityPercent)) return instance
  const key = DIRECTION_OPACITY_KEY[direction]
  // Always persist an explicit user choice, even when it equals the default:
  // deleting at the default would make the value indistinguishable from a
  // profile that never configured the field, so a later default change would
  // silently rewrite the user's setting.
  return { ...instance, [key]: opacityPercent }
}

/**
 * Keep only valid persisted histogram fields. Missing or invalid fields stay
 * unset and resolve to the legacy defaults at read time, so stored records are
 * never rewritten to new defaults.
 */
export function sanitizeFrvpInstanceHistogramStyles(
  record: Record<string, unknown>,
  instance: FixedRangeVolumeProfileInstance,
): FixedRangeVolumeProfileInstance {
  let next = instance
  for (const direction of ['up', 'down'] as const) {
    const colorKey = DIRECTION_COLOR_KEY[direction]
    const opacityKey = DIRECTION_OPACITY_KEY[direction]
    if (isMarketStyleHexColor(record[colorKey])) {
      next = { ...next, [colorKey]: record[colorKey] }
    }
    if (isMarketStyleOpacityPercent(record[opacityKey])) {
      next = { ...next, [opacityKey]: record[opacityKey] }
    }
  }
  return next
}
