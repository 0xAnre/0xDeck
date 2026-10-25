import { MARKET_STYLE_DEFAULTS, marketStyleColorWithOpacity } from './marketStylePalette.ts'

/**
 * FRVP level defaults (POC / VAH / VAL): palette secondary line
 * (`medium` @ 70%), replacing the previous theme-red POC and `#a0a0a0` levels.
 */
export const FRVP_LEVEL_DEFAULT_HEX = MARKET_STYLE_DEFAULTS.secondaryLine.color
export const FRVP_LEVEL_DEFAULT_OPACITY_PERCENT =
  MARKET_STYLE_DEFAULTS.secondaryLine.opacityPercent

export function readFrvpPocLineStrokeStyle(): string {
  return marketStyleColorWithOpacity(
    FRVP_LEVEL_DEFAULT_HEX,
    FRVP_LEVEL_DEFAULT_OPACITY_PERCENT,
  )
}

/** Hex value for `<input type="color">`. */
export function readFrvpPocLineColorInputHex(): string {
  return FRVP_LEVEL_DEFAULT_HEX
}
