import { BTC_PERPETUAL_CANDLESTICK_COLORS } from './btcPerpetualCandleColors.ts'
import type { FixedRangeVolumeProfileInstance } from './fixedRangeVolumeProfileInstances.ts'
import { isMarketStyleHexColor, isMarketStyleOpacityPercent } from './marketStylePalette.ts'

/**
 * FRVP histogram bar styling (per-instance Up/Down color + 0–100 opacity).
 *
 * The configured opacity is the ceiling for the Value Area rows; the render
 * geometry scales it by the Value-Area/outside shares, so an instance without
 * custom histogram fields keeps today's exact appearance:
 * Up `#DBDBDB` / Down `#808080` at 100% → 0.55 / 0.25 row alphas.
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

/** 100% configured opacity === the legacy 0.55 / 0.25 row alphas. */
export const FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT = 100

/** Legacy histogram appearance used by instances without custom settings. */
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

/** Hex value for `<input type="color">`: instance color, else the legacy default. */
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
  if (opacityPercent === FRVP_HISTOGRAM_DEFAULT_OPACITY_PERCENT) {
    const next = { ...instance }
    delete next[key]
    return next
  }
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
