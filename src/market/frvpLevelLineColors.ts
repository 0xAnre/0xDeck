import { MARKET_STYLE_PALETTE, marketStyleColorWithOpacity } from './marketStylePalette.ts'

/**
 * FRVP level defaults.
 *
 * POC uses the palette accent red; VAH/VAL keep the neutral `medium` grey.
 * Every level renders at the shared 50% opacity (3px is the shared level width).
 */
export const FRVP_POC_DEFAULT_HEX = MARKET_STYLE_PALETTE.pocRed
export const FRVP_VAH_VAL_DEFAULT_HEX = MARKET_STYLE_PALETTE.medium

/** Default opacity percentage for every FRVP level (POC / VAH / VAL). */
export const FRVP_LEVEL_DEFAULT_OPACITY_PERCENT = 50

export function readFrvpPocLineStrokeStyle(): string {
  return marketStyleColorWithOpacity(
    FRVP_POC_DEFAULT_HEX,
    FRVP_LEVEL_DEFAULT_OPACITY_PERCENT,
  )
}

export function readFrvpVahValLineStrokeStyle(): string {
  return marketStyleColorWithOpacity(
    FRVP_VAH_VAL_DEFAULT_HEX,
    FRVP_LEVEL_DEFAULT_OPACITY_PERCENT,
  )
}

/** Hex value for the shared color picker. */
export function readFrvpPocLineColorInputHex(): string {
  return FRVP_POC_DEFAULT_HEX
}
